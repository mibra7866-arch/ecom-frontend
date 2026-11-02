import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatService } from '../../core/services/chat.service';
import { ChatInboxRow, ChatMessage, SellerSearchResult } from '../../core/models/chat.model';
import { AppNotification } from '../../core/models/notification.model';
import { ChatThreadComponent } from '../../shared/chat-thread/chat-thread.component';
import { isImageUrl } from '../../shared/utils/file-type.util';

/** The currently-open thread's identity — kept separate from ChatInboxRow so starting a fresh chat from search (a seller with no messages yet, so not in `rows()`) still has a label to show. */
interface ActiveSeller {
  sellerId: number;
  name: string;
}

@Component({
  selector: 'app-admin-chat',
  standalone: true,
  imports: [DatePipe, MatIconModule, MatProgressSpinnerModule, ChatThreadComponent],
  templateUrl: './admin-chat.component.html',
  styleUrl: './admin-chat.component.scss'
})
export class AdminChatComponent implements OnInit, OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly searchInput$ = new Subject<string>();

  // Below this width the list+thread grid has no room for both panes (a 320px sidebar alone would
  // overflow a 320-430px phone screen) — switch to a single-pane view that shows either the seller
  // list or the open thread, with a back button, matching the standard mobile messaging-app pattern.
  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 768px)').pipe(map((r) => r.matches)),
    { initialValue: false }
  );

  /** Exposed for the template — the same image/attachment distinction KYC and other document previews already use. */
  readonly isImageUrl = isImageUrl;

  // ReceiveMessage only reaches whoever currently has THAT seller's thread open (ChatHub broadcasts
  // to the seller-{id} group) — covers the admin's own open thread, sent or received either way. Has
  // the real message, so the row's thumbnail/attachment state stays exactly accurate.
  private readonly onReceiveMessage = (message: ChatMessage) => {
    this.bumpConversation(message.sellerId, message.content, message.attachmentUrl, message.sentAtUtc, false);
  };

  // ReceiveNotification covers every OTHER seller's activity — the backend only fires a ChatMessage
  // notification when no admin has that seller's thread open (see ChatHub.SendMessage), so this
  // never double-counts against onReceiveMessage above. Only a text preview is available here (no
  // attachment URL travels with a notification), so any existing thumbnail is cleared rather than left
  // stale — the next full load() (or opening the thread) fills it back in correctly.
  private readonly onReceiveNotification = (notification: AppNotification) => {
    if (notification.type !== 'ChatMessage') {
      return;
    }
    const sellerId = this.sellerIdFromLink(notification.linkUrl);
    if (sellerId === null) {
      return;
    }
    this.bumpConversation(sellerId, notification.body, null, notification.createdAtUtc, true);
  };

  /** Prefixes an uploaded file's relative URL with the API's file host — same pattern as every other document/attachment preview in the app (e.g. SellerDetailDialogComponent.fileUrl). */
  fileUrl(url: string): string {
    return `${environment.filesBaseUrl}${url}`;
  }

  readonly rows = signal<ChatInboxRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly activeSeller = signal<ActiveSeller | null>(null);

  readonly searchQuery = signal('');
  readonly searchResults = signal<SellerSearchResult[]>([]);
  readonly searching = signal(false);

  ngOnInit(): void {
    this.load();

    this.chatService.ensureStarted().then(() => {
      const connection = this.chatService.getConnection();
      connection.on('ReceiveMessage', this.onReceiveMessage);
      connection.on('ReceiveNotification', this.onReceiveNotification);
    });

    this.searchInput$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query.trim()) {
            this.searching.set(false);
            return [];
          }
          this.searching.set(true);
          return this.chatService.searchSellers(query);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (results) => {
          this.searching.set(false);
          this.searchResults.set(results);
        },
        error: () => this.searching.set(false)
      });
  }

  ngOnDestroy(): void {
    const connection = this.chatService.getConnection();
    connection.off('ReceiveMessage', this.onReceiveMessage);
    connection.off('ReceiveNotification', this.onReceiveNotification);
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.chatService.getInbox().subscribe({
      next: (res) => {
        this.rows.set(res);
        this.loading.set(false);

        // Deep-linked from a chat notification (see NotificationTemplates.ChatMessage's admin LinkUrl).
        const sellerId = Number(this.route.snapshot.queryParamMap.get('sellerId'));
        const row = res.find((r) => r.sellerId === sellerId);
        if (row) {
          this.select(row);
        }
      },
      error: () => {
        this.errorMessage.set('Failed to load conversations.');
        this.loading.set(false);
      }
    });
  }

  select(row: ChatInboxRow): void {
    this.activeSeller.set({ sellerId: row.sellerId, name: row.sellerName });
    // Opening the thread marks it read server-side (ChatThreadComponent's debounced MarkAsRead) —
    // clear the badge here immediately rather than waiting on a full inbox refetch.
    this.rows.update((current) => current.map((r) => (r.sellerId === row.sellerId ? { ...r, unreadCount: 0 } : r)));
    if (row.unreadCount > 0) {
      // The server-side MarkAsRead above is debounced, so give it a moment before pulling the sidebar
      // Chat badge's aggregate count down to match — same margin ChatThreadComponent's own debounce uses.
      setTimeout(() => this.chatService.refreshAdminUnreadCount(), 600);
    }
  }

  /** Mobile-only — the single-pane view's back button. Desktop never renders this (the list stays visible alongside the thread there), so it's the only place a user can "close" the open thread on a phone. */
  backToList(): void {
    this.activeSeller.set(null);
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchInput$.next(value);
  }

  /** The seller has no messages yet, so they're deliberately not in `rows()` — opening the (empty) thread is what "starts" the conversation; once the admin sends the first message, this seller will appear in the regular list on the next load(). */
  startChatWithSeller(result: SellerSearchResult): void {
    this.activeSeller.set({ sellerId: result.sellerId, name: result.name });
    this.searchQuery.set('');
    this.searchResults.set([]);
  }

  /** Moves the seller with new activity to the top of the list with an updated preview/timestamp — mirrors the app's existing "patch matching row by id" live-update pattern (see mergeOrderUpdate/onBalanceUpdated), but reorders instead of just patching in place. Deliberately never inserts a row that wasn't already visible — a first-ever message for a brand-new conversation just appears on the next full load(), same limitation those helpers document. */
  private bumpConversation(sellerId: number, preview: string, attachmentUrl: string | null, atUtc: string, incrementUnread: boolean): void {
    this.rows.update((current) => {
      const idx = current.findIndex((r) => r.sellerId === sellerId);
      if (idx === -1) {
        return current;
      }
      const bumped: ChatInboxRow = {
        ...current[idx],
        lastMessagePreview: preview,
        lastMessageAttachmentUrl: attachmentUrl,
        lastMessageAtUtc: atUtc,
        unreadCount: incrementUnread ? current[idx].unreadCount + 1 : current[idx].unreadCount
      };
      return [bumped, ...current.slice(0, idx), ...current.slice(idx + 1)];
    });
  }

  private sellerIdFromLink(linkUrl: string | null): number | null {
    if (!linkUrl) {
      return null;
    }
    const match = linkUrl.match(/sellerId=(\d+)/);
    return match ? Number(match[1]) : null;
  }
}
