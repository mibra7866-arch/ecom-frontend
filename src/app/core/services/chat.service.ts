import { HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ChatAttachmentUploadResponse,
  ChatClearedEvent,
  ChatDisplayMessage,
  ChatInboxRow,
  ChatMessage,
  ChatMessagesReadEvent,
  ChatPresenceEvent,
  ChatSenderType,
  MessageDeletedEvent,
  PreLoginChatResolveRequest,
  PreLoginChatResolveResponse,
  SellerSearchResult
} from '../models/chat.model';
import { ApiService } from './api.service';
import { TokenService } from './token.service';

const PAGE_SIZE = 30;
const RECONNECT_BASE_DELAY_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

/**
 * Shared between the seller Chat page, the admin Chat panel, AND the pre-login "Chat with support"
 * panel on the login page — same app, same route tree, same seller-{sellerId} thread either way, so
 * this is the literal same service for all three. One HubConnection is kept alive across seller
 * switches; switching threads calls JoinSellerChat again rather than reconnecting the whole socket (the
 * hub auto-leaves the previous seller's group server-side).
 *
 * The pre-login case passes an explicit `accessTokenOverride` to connect() instead of relying on
 * TokenService's own accessToken() — a not-yet-authenticated visitor has no real session token to fall
 * back on there, and this keeps the scoped pre-login token out of TokenService's shared signals entirely
 * (which route guards and every other HTTP call read), so it can never be mistaken for a real login.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly tokenService = inject(TokenService);
  private readonly api = inject(ApiService);

  private connection: signalR.HubConnection | null = null;
  private currentSellerId: number | null = null;
  private accessTokenOverride: string | null = null;
  /** See onConnection() below. */
  private readonly connectionListeners: Array<(connection: signalR.HubConnection) => void> = [];
  /** See ensureBadgeListener() below. */
  private badgeListenerAttached = false;
  /** See scheduleReconnect() below. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  /** Set right before an intentional connection.stop() (disconnect()) so its onclose knows not to treat
   * a deliberate teardown as a dropped connection worth retrying. */
  private intentionalStop = false;

  readonly connectionState = signal<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected);
  readonly messages = signal<ChatDisplayMessage[]>([]);
  readonly presence = signal<ChatPresenceEvent | null>(null);
  readonly loadingHistory = signal(false);
  readonly hasMoreHistory = signal(true);
  readonly unreadCount = signal(0);
  /** Admin-side sidebar badge — total unread across every seller thread this admin can access (distinct from the seller-scoped `unreadCount` above). */
  readonly adminUnreadCount = signal(0);

  constructor() {
    // SignalR's own withAutomaticReconnect() gives up permanently after its last built-in retry delay
    // (a few tens of seconds) — scheduleReconnect() (see onclose below) covers everything past that.
    // This covers the case that backoff loop alone can't: a tab whose JS timers were fully suspended in
    // the background (mobile Safari, throttled background tabs) never got to run any of those retries
    // at all. Catching up the moment the tab becomes visible/focused again — the same resilience pattern
    // the app's own idle-activity tracking used to rely on — means a long-backgrounded tab reconnects
    // immediately on resume instead of waiting for a backoff timer that may itself have been suspended.
    ['visibilitychange', 'focus', 'pageshow'].forEach((evt) =>
      window.addEventListener(evt, () => this.maybeReconnectOnResume(), { passive: true })
    );
  }

  private maybeReconnectOnResume(): void {
    if (document.visibilityState !== undefined && document.visibilityState !== 'visible') {
      return;
    }
    if (!this.connection || (!this.tokenService.hasToken() && !this.accessTokenOverride)) {
      return;
    }
    if (this.connection.state === signalR.HubConnectionState.Disconnected) {
      void this.ensureStarted();
    }
  }

  /** Seller-side sidebar badge — kept live by ensureBadgeListener() below (a 'ChatMessage' push
   * refetches it), in addition to being explicitly refreshed at specific points (mount, opening the
   * chat page, which also locally zeroes it since opening the thread marks everything read). */
  refreshUnreadCount(): void {
    firstValueFrom(this.api.get<number>('chat/unread-count'))
      .then((count) => this.unreadCount.set(count))
      .catch(() => {});
  }

  refreshAdminUnreadCount(): void {
    firstValueFrom(this.api.get<number>('admin/chat/unread-count'))
      .then((count) => this.adminUnreadCount.set(count))
      .catch(() => {});
  }

  getInbox(): Observable<ChatInboxRow[]> {
    return this.api.get<ChatInboxRow[]>('admin/chat/inbox');
  }

  /** Searches ALL sellers (not just ones already in the inbox) — for starting a fresh conversation. */
  searchSellers(query: string): Observable<SellerSearchResult[]> {
    return this.api.get<SellerSearchResult[]>('admin/chat/sellers/search', { query });
  }

  /**
   * Soft-deletes the whole thread server-side, then clears the local message list immediately —
   * the OTHER party's open view (if any) clears live via the ChatCleared hub event handled below.
   */
  async deleteChat(sellerId: number, accessTokenOverride?: string): Promise<void> {
    const headers = accessTokenOverride ? new HttpHeaders({ Authorization: `Bearer ${accessTokenOverride}` }) : undefined;
    await firstValueFrom(this.api.post(`chat/${sellerId}/delete`, {}, undefined, headers));
    if (this.currentSellerId === sellerId) {
      this.messages.set([]);
    }
  }

  /** Resolves an email to a seller's existing thread for the pre-login chat panel — see PreLoginChatController. */
  resolvePreLogin(email: string): Observable<PreLoginChatResolveResponse> {
    return this.api.post<PreLoginChatResolveResponse, PreLoginChatResolveRequest>('chat/pre-login/resolve', { email });
  }

  /**
   * Uploads a chat image and returns its URL — a separate HTTP step from actually sending the
   * message (see ChatController.UploadAttachment's doc comment for why). Callers pass the returned
   * url straight into sendMessage().
   */
  async uploadAttachment(sellerId: number, file: File, accessTokenOverride?: string): Promise<string> {
    const headers = accessTokenOverride ? new HttpHeaders({ Authorization: `Bearer ${accessTokenOverride}` }) : undefined;
    const formData = new FormData();
    formData.append('file', file);
    const res = await firstValueFrom(this.api.postFormData<ChatAttachmentUploadResponse>(`chat/${sellerId}/attachment`, formData, headers));
    return res.url;
  }

  /**
   * Returns the shared hub connection (building it if needed) without starting or joining anything —
   * for callers like NotificationService that need to attach a listener before the connection exists.
   */
  getConnection(): signalR.HubConnection {
    return this.ensureConnection();
  }

  /** Starts the shared connection if it isn't already up. Idempotent — safe to call from anywhere (e.g. NotificationBellComponent) independent of whether a chat thread is open. */
  async ensureStarted(): Promise<void> {
    this.ensureBadgeListener();
    const connection = this.ensureConnection();
    if (connection.state === signalR.HubConnectionState.Disconnected) {
      this.connectionState.set(signalR.HubConnectionState.Connecting);
      await connection.start();
      this.connectionState.set(signalR.HubConnectionState.Connected);
      this.reconnectAttempt = 0;
    }
  }

  /** Keeps unreadCount/adminUnreadCount live off the same 'ChatMessage' notification every other
   * badge in the app already reacts to (see admin-shell.component.ts's identical check for the
   * KYC/Withdrawals/Top-Up badges) — re-fetches from the server (never increments locally) so it can
   * never drift from the real unread count. Armed once, from ensureStarted() (called by every caller
   * that establishes the live connection — the notification bell, KYC status, chat threads, ...), and
   * registered via onConnection() so it keeps working across a reconnect the same way every other
   * service-level listener in this file now does. */
  private ensureBadgeListener(): void {
    if (this.badgeListenerAttached) {
      return;
    }
    this.badgeListenerAttached = true;

    this.onConnection((connection) => {
      connection.on('ReceiveNotification', (notification: { type: string }) => {
        if (notification.type !== 'ChatMessage') {
          return;
        }
        const role = this.tokenService.role();
        if (role === 'Seller') {
          this.refreshUnreadCount();
        } else if (role === 'Admin') {
          this.refreshAdminUnreadCount();
        }
      });
    });
  }

  /** accessTokenOverride, when passed, is used for the hub connection AND the history GET instead of TokenService's own token — see class doc. Omit it for the normal authenticated seller/admin path. */
  async connect(sellerId: number, accessTokenOverride?: string): Promise<void> {
    this.accessTokenOverride = accessTokenOverride ?? null;
    const connection = this.ensureConnection();

    if (this.currentSellerId === sellerId && connection.state === signalR.HubConnectionState.Connected) {
      return;
    }

    this.currentSellerId = sellerId;
    this.messages.set([]);
    this.presence.set(null);
    this.hasMoreHistory.set(true);

    await this.ensureStarted();

    const counterpartOnline = await connection.invoke<boolean>('JoinSellerChat', sellerId);
    const myRole = this.effectiveRole();
    this.presence.set({ role: myRole === 'Seller' ? 'Admin' : 'Seller', userId: 0, isOnline: counterpartOnline });

    await this.loadOlderMessages();
  }

  async loadOlderMessages(): Promise<void> {
    const sellerId = this.currentSellerId;
    if (sellerId === null || this.loadingHistory() || !this.hasMoreHistory()) {
      return;
    }

    const oldest = this.messages()[0];
    const params: Record<string, number> = { pageSize: PAGE_SIZE };
    if (oldest) {
      params['beforeMessageId'] = oldest.id;
    }

    const headers = this.accessTokenOverride ? new HttpHeaders({ Authorization: `Bearer ${this.accessTokenOverride}` }) : undefined;

    this.loadingHistory.set(true);
    try {
      const page = await firstValueFrom(this.api.get<ChatMessage[]>(`chat/${sellerId}/messages`, params, headers));
      this.messages.update((current) => [...page, ...current]);
      this.hasMoreHistory.set(page.length === PAGE_SIZE);
    } finally {
      this.loadingHistory.set(false);
    }
  }

  /** attachmentUrl comes from a prior uploadAttachment() call — a message needs at least one of content/attachmentUrl (an image can be sent with no caption). */
  async sendMessage(content: string, attachmentUrl?: string): Promise<void> {
    const sellerId = this.currentSellerId;
    const connection = this.connection;
    const trimmed = content.trim();
    if (sellerId === null || (!trimmed && !attachmentUrl) || !connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    const claims = this.tokenService.claims();
    const clientId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: ChatDisplayMessage = {
      id: -1,
      sellerId,
      senderType: this.effectiveRole() ?? 'Seller',
      // Server-assigned SenderId is always the sellerId itself when the sender is (or is standing in
      // for) the Seller — matches ChatHub.GetCallerIdentity's PreLoginChat mapping, so this stays
      // correct whether claims.userId is real (authenticated seller) or absent (pre-login).
      senderId: claims.userId ?? sellerId,
      content: trimmed,
      attachmentUrl: attachmentUrl ?? null,
      sentAtUtc: new Date().toISOString(),
      deliveredAtUtc: null,
      readAtUtc: null,
      editedAtUtc: null,
      clientId,
      status: 'sending'
    };
    this.messages.update((current) => [...current, optimistic]);

    try {
      // The confirmed message arrives via the ReceiveMessage broadcast (onReceiveMessage reconciles
      // it against this pending entry) — the invoke() result itself is only used for error handling.
      await connection.invoke('SendMessage', sellerId, trimmed, attachmentUrl ?? null);
    } catch {
      this.messages.update((current) => current.map((m) => (m.clientId === clientId ? { ...m, status: 'failed' as const } : m)));
    }
  }

  /** Sender-only, enforced server-side too (ChatHub.EditMessage) — the confirmed edit arrives back via the MessageEdited broadcast handled in ensureConnection() below, same reconciliation-via-broadcast shape as sendMessage. */
  async editMessage(messageId: number, content: string): Promise<void> {
    const sellerId = this.currentSellerId;
    const connection = this.connection;
    const trimmed = content.trim();
    if (sellerId === null || !trimmed || !connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    await connection.invoke('EditMessage', sellerId, messageId, trimmed);
  }

  /** Sender-only, enforced server-side too (ChatHub.DeleteMessage) — distinct from deleteChat() above, which wipes the whole thread. */
  async deleteMessage(messageId: number): Promise<void> {
    const sellerId = this.currentSellerId;
    const connection = this.connection;
    if (sellerId === null || !connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    await connection.invoke('DeleteMessage', sellerId, messageId);
    this.messages.update((current) => current.filter((m) => m.id !== messageId));
  }

  /** Strict ownership check (senderType AND senderId) — distinct from ChatThreadComponent's own looser `isMine(senderType)` used purely for bubble alignment (every "our side" message renders on the same side regardless of which specific admin sent it). This one gates the edit/delete menu, so it must match the exact sender ChatHub.EditMessage/DeleteMessage will authorize. */
  isOwnMessage(message: ChatMessage): boolean {
    const myClaims = this.tokenService.claims();
    const effectiveRole = this.effectiveRole();
    const effectiveUserId = myClaims.userId ?? (effectiveRole === 'Seller' ? this.currentSellerId : null);
    return message.senderType === effectiveRole && message.senderId === effectiveUserId;
  }

  async markAsRead(lastMessageId: number): Promise<void> {
    const sellerId = this.currentSellerId;
    const connection = this.connection;
    if (sellerId === null || lastMessageId <= 0 || !connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    await connection.invoke('MarkAsRead', sellerId, lastMessageId).catch(() => {});
  }

  /**
   * Leaves the current chat THREAD only — invokes LeaveSellerChat and resets thread-scoped state
   * (messages/presence/history), but deliberately does NOT stop the underlying connection. That one
   * connection is shared app-wide: every other live listener (ReceiveNotification, OrderUpdated,
   * BalanceUpdated, SellerProfileUpdated, StageUpdated, ...) is attached to it too, established once
   * near login and expected to stay live for the whole session. Calling the old disconnect() here on
   * every "leave the Chat page" — its previous behavior — silently killed every one of those other
   * listeners the first time anyone visited Chat and navigated away, since none of them ever got a
   * chance to re-attach to whatever new connection object a later reconnect would have created. This is
   * what ChatThreadComponent.ngOnDestroy calls for the normal authenticated seller/admin chat case.
   */
  async leaveThread(): Promise<void> {
    const connection = this.connection;
    if (connection && this.currentSellerId !== null && connection.state === signalR.HubConnectionState.Connected) {
      await connection.invoke('LeaveSellerChat', this.currentSellerId).catch(() => {});
    }
    this.currentSellerId = null;
    this.messages.set([]);
    this.presence.set(null);
    this.hasMoreHistory.set(true);
  }

  /**
   * Full teardown of the connection itself — distinct from leaveThread() above. Only appropriate where
   * the connection's underlying identity must actually end: real logout (AuthService calls this on
   * every sign-out/cross-tab-logout path) and the pre-login guest widget closing (a
   * scoped, short-lived identity — see ChatThreadComponent.ngOnDestroy — that must never be reused for
   * a later real login, since switching from a guest identity to a real one needs a fresh handshake to
   * join the right hub groups).
   */
  async disconnect(): Promise<void> {
    const connection = this.connection;
    if (!connection) {
      return;
    }

    if (this.currentSellerId !== null && connection.state === signalR.HubConnectionState.Connected) {
      await connection.invoke('LeaveSellerChat', this.currentSellerId).catch(() => {});
    }

    this.clearReconnectTimer();
    this.intentionalStop = true;
    await connection.stop();
    this.connection = null;
    this.currentSellerId = null;
    this.accessTokenOverride = null;
    this.connectionState.set(signalR.HubConnectionState.Disconnected);
  }

  /** Exponential backoff (5s, 10s, 20s, ... capped at 60s) for reconnect attempts once SignalR's own
   * withAutomaticReconnect() has given up — see onclose above. Never gives up itself as long as the user
   * is still authenticated; a genuinely dead server just keeps getting retried at the capped interval
   * rather than leaving the app permanently disconnected until a manual refresh. */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.tokenService.hasToken() && !this.accessTokenOverride) {
        return; // logged out (or the pre-login widget closed) while waiting — nothing to reconnect
      }
      this.reconnectAttempt++;
      this.ensureStarted().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private ensureConnection(): signalR.HubConnection {
    if (this.connection) {
      return this.connection;
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(environment.chatHubUrl, { accessTokenFactory: () => this.accessTokenOverride ?? this.tokenService.accessToken() ?? '' })
      .withAutomaticReconnect()
      .build();

    connection.on('ReceiveMessage', (message: ChatMessage) => this.onReceiveMessage(message));
    connection.on('MessagesRead', (event: ChatMessagesReadEvent) => this.onMessagesRead(event));
    connection.on('UserPresenceChanged', (event: ChatPresenceEvent) => this.presence.set(event));
    // The OTHER party's live view — the one who clicked delete already cleared locally in deleteChat().
    connection.on('ChatCleared', (event: ChatClearedEvent) => {
      if (event.sellerId === this.currentSellerId) {
        this.messages.set([]);
      }
    });
    // Reaches BOTH parties, including the editor's own other tab/device — the editor's immediate tab
    // already has the new content from editMessage()'s optimistic-free await, but reconciling here too
    // (by id, same as onReceiveMessage) keeps every open view consistent without a special case.
    connection.on('MessageEdited', (message: ChatMessage) => {
      if (message.sellerId !== this.currentSellerId) {
        return;
      }
      this.messages.update((current) => current.map((m) => (m.id === message.id ? { ...m, ...message } : m)));
    });
    // The OTHER party's live view — the deleter's own tab already removed it in deleteMessage() above.
    connection.on('MessageDeleted', (event: MessageDeletedEvent) => {
      if (event.sellerId === this.currentSellerId) {
        this.messages.update((current) => current.filter((m) => m.id !== event.messageId));
      }
    });

    connection.onreconnecting(() => this.connectionState.set(signalR.HubConnectionState.Reconnecting));
    connection.onreconnected(() => {
      this.connectionState.set(signalR.HubConnectionState.Connected);
      this.reconnectAttempt = 0;
      if (this.currentSellerId !== null) {
        connection.invoke('JoinSellerChat', this.currentSellerId).catch(() => {});
      }
    });
    // Fires once SignalR's own withAutomaticReconnect() has exhausted its built-in retry attempts and
    // given up for good — everything from here on is this service's own responsibility. Skipped for an
    // intentional stop() (real logout): that's not a dropped connection, there's nothing to retry.
    connection.onclose(() => {
      this.connectionState.set(signalR.HubConnectionState.Disconnected);
      if (this.intentionalStop) {
        this.intentionalStop = false;
        return;
      }
      this.scheduleReconnect();
    });

    this.connection = connection;
    // Re-runs every registered app-wide listener (see onConnection() below) against this freshly built
    // connection — the piece that makes a singleton service's live-signal subscription (notifications,
    // KYC status, account balance, ...) survive a disconnect()+reconnect (logout then a different
    // account logging back in, in the same tab) without that service needing to know a reconnect ever
    // happened.
    this.connectionListeners.forEach((listener) => listener(connection));
    return connection;
  }

  /**
   * Registers a callback to run against every HubConnection this service ever builds — immediately
   * against the current one if it already exists, and again automatically each time a NEW one replaces
   * it (see ensureConnection() above). This is the fix for the app's long-standing "notifications (and
   * other live signals) silently stop arriving after visiting Chat, or after a logout/login cycle"
   * class of bug: a service that calls `chatService.getConnection().on('ReceiveNotification', ...)`
   * directly, ONCE, in its own constructor/init(), was permanently orphaned the moment that specific
   * connection object was ever torn down (previously: every time anyone left the Chat page — see
   * leaveThread()'s doc comment — and always on logout/login) — the listener itself was never wired to
   * the REPLACEMENT connection. Callers (NotificationService, SellerKycStatusService,
   * SellerBalanceService, ...) should still only call this once per service instance (registering the
   * callback itself is idempotent-by-caller-discipline, not by this method), but what runs INSIDE the
   * callback (a `connection.on(...)` call) is safe to re-run against a new connection every time — it's
   * a fresh handler registration on a fresh object, never a duplicate on the same one.
   */
  onConnection(listener: (connection: signalR.HubConnection) => void): void {
    this.connectionListeners.push(listener);
    if (this.connection) {
      listener(this.connection);
    }
  }

  /**
   * TokenService has no session at all in the pre-login case (accessTokenOverride is used instead), so
   * claims().role is null there — this falls back to 'Seller' whenever an override is active, since
   * that's exactly what a pre-login connection always is standing in for.
   */
  private effectiveRole(): ChatSenderType | null {
    return this.tokenService.claims().role ?? (this.accessTokenOverride ? 'Seller' : null);
  }

  private onReceiveMessage(message: ChatMessage): void {
    if (message.sellerId !== this.currentSellerId) {
      return;
    }

    // ChatHub.GetCallerIdentity maps a pre-login connection's SenderId to the sellerId itself — same
    // fallback as sendMessage's optimistic entry above, so this reconciles against it correctly.
    const isMine = this.isOwnMessage(message);

    this.messages.update((current) => {
      if (current.some((m) => m.id === message.id)) {
        return current;
      }

      if (isMine) {
        const pendingIndex = current.findIndex((m) => m.status === 'sending');
        if (pendingIndex !== -1) {
          const next = [...current];
          next[pendingIndex] = message;
          return next;
        }
      }

      return [...current, message];
    });
  }

  private onMessagesRead(event: ChatMessagesReadEvent): void {
    if (event.sellerId !== this.currentSellerId) {
      return;
    }

    this.messages.update((current) =>
      current.map((m) =>
        m.id !== -1 && m.id <= event.lastReadMessageId
          ? { ...m, readAtUtc: m.readAtUtc ?? event.readAtUtc, deliveredAtUtc: m.deliveredAtUtc ?? event.readAtUtc }
          : m
      )
    );
  }
}
