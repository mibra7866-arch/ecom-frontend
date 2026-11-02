import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppNotification, AppNotificationPage } from '../models/notification.model';
import { ApiService } from './api.service';
import { ChatService } from './chat.service';

const PAGE_SIZE = 20;

/**
 * Shared between the seller and admin NotificationBellComponent — one generic pipeline for every
 * notification Type, driven entirely by data (see notification-bell.component.ts's icon lookup).
 * Live push reuses ChatService's single hub connection (ChatHub now also emits ReceiveNotification)
 * instead of opening a second SignalR connection.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(ApiService);
  private readonly chatService = inject(ChatService);

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly loading = signal(false);
  readonly hasMore = signal(true);

  private page = 0;
  private listenerAttached = false;
  private initStarted = false;
  private audioCtx: AudioContext | null = null;

  /**
   * Idempotent — more than one NotificationBellComponent instance can call this on init within the
   * same shell (e.g. the seller portal now renders one inside the desktop sidebar nav and a second
   * inside the mobile bottom tab bar, only one of which is ever visible at a time via CSS). Only the
   * first call actually does anything; later calls are a no-op instead of firing a second
   * GET notifications/unread-count for data the first call already fetched.
   */
  async init(): Promise<void> {
    if (this.initStarted) {
      return;
    }
    this.initStarted = true;

    this.attachListener();
    this.refreshUnreadCount();
    await this.chatService.ensureStarted();
  }

  /** Called on logout — clears this account's notification state so a DIFFERENT account logging in
   * next (same browser tab, no full page reload in between) never briefly shows the previous account's
   * stale notifications/unread count, and re-arms init() so the next login's fresh
   * NotificationBellComponent mount refetches for real instead of no-op'ing on the old initStarted
   * flag. Deliberately does NOT touch listenerAttached / re-register with chatService.onConnection() —
   * that registration already re-fires automatically against whatever connection the next login builds
   * (see ChatService.onConnection's doc comment); doing it again here would attach the handler twice. */
  reset(): void {
    this.notifications.set([]);
    this.unreadCount.set(0);
    this.initStarted = false;
  }

  refreshUnreadCount(): void {
    firstValueFrom(this.api.get<number>('notifications/unread-count'))
      .then((count) => this.unreadCount.set(count))
      .catch(() => {});
  }

  async loadFirstPage(): Promise<void> {
    this.page = 1;
    this.hasMore.set(true);
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.get<AppNotificationPage>('notifications', { page: this.page, pageSize: PAGE_SIZE }));
      this.notifications.set(res.items);
      this.hasMore.set(this.page < res.totalPages);
    } catch {
      // Panel degrades to an empty list; the badge still reflects the last known unread count.
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    if (this.loading() || !this.hasMore()) {
      return;
    }

    this.page += 1;
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.get<AppNotificationPage>('notifications', { page: this.page, pageSize: PAGE_SIZE }));
      this.notifications.update((current) => [...current, ...res.items]);
      this.hasMore.set(this.page < res.totalPages);
    } catch {
      this.page -= 1;
    } finally {
      this.loading.set(false);
    }
  }

  async markAsRead(id: number): Promise<void> {
    const target = this.notifications().find((n) => n.id === id);
    if (!target || target.isRead) {
      return;
    }

    this.notifications.update((current) => current.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    this.unreadCount.update((count) => Math.max(0, count - 1));
    await firstValueFrom(this.api.post(`notifications/${id}/read`, {})).catch(() => {});
  }

  async markAllAsRead(): Promise<void> {
    if (this.unreadCount() === 0) {
      return;
    }

    this.notifications.update((current) => current.map((n) => ({ ...n, isRead: true })));
    this.unreadCount.set(0);
    await firstValueFrom(this.api.post('notifications/mark-all-read', {})).catch(() => {});
  }

  private attachListener(): void {
    if (this.listenerAttached) {
      return;
    }
    this.listenerAttached = true;

    // chatService.onConnection (not a one-off getConnection().on()) so this keeps working across a
    // reconnect — including the connection ChatService rebuilds after a logout/login cycle in the same
    // tab — without needing to know that ever happened. See ChatService.onConnection's doc comment for
    // why a raw getConnection().on() here was the root cause of notifications silently going stale.
    this.chatService.onConnection((connection) => {
      connection.on('ReceiveNotification', (notification: AppNotification) => {
        this.notifications.update((current) => {
          // Guards against the same notification ever being added twice — e.g. the live push landing
          // while loadFirstPage()/loadMore() also happens to return the same row, or (in principle) a
          // duplicate delivery around a reconnect window. Matched by the backend's own row id, the same
          // source of truth markAsRead already keys off.
          if (current.some((n) => n.id === notification.id)) {
            return current;
          }
          return [notification, ...current];
        });
        if (!notification.isRead) {
          this.unreadCount.update((count) => count + 1);
        }
        this.playChime();
      });
    });
  }

  /**
   * A short two-note chime for a live-pushed notification — only for the real-time 'ReceiveNotification'
   * push, never for loadFirstPage/loadMore's historical fetches, so opening the panel to browse past
   * notifications stays silent. Synthesized with the Web Audio API rather than shipping an audio asset
   * file, so there's nothing to fetch and it always matches the app's own volume/output device. Reuses
   * one AudioContext across calls (creating one per chime would leak). Best-effort: a browser blocking
   * autoplay before the user has interacted with the page, or lacking AudioContext entirely, just means
   * no sound — never an error the caller needs to handle.
   */
  private playChime(): void {
    try {
      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }
      this.audioCtx ??= new AudioContextCtor();
      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      [880, 1174.66].forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;

        const start = now + i * 0.09;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.24);
      });
    } catch {
      // Autoplay restrictions or no Web Audio support — silently skip the chime.
    }
  }
}
