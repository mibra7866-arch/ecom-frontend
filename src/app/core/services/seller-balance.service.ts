import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BalanceUpdatedEvent, SellerProfileUpdatedEvent } from '../models/realtime.model';
import { ChatService } from './chat.service';
import { SellerDashboardService } from './seller-dashboard.service';

/**
 * The seller's single source of truth for their own live-updating account state (Balance,
 * GuaranteeBalance, IsVerified, Rating, CreditScore), read directly by SellerSidebarComponent (shown
 * on every seller page) and by the Dashboard/Profile/Withdraw pages, so none of them need their own
 * fetch-once copy. Reuses ChatService's shared hub connection (like NotificationService) rather than
 * opening a second SignalR connection — "BalanceUpdated" (order accept/complete, top-up, withdrawal,
 * admin adjustment) and "SellerProfileUpdated" (KYC review, admin rating/credit-score edit) pushes
 * update these signals live, so the seller never has to refresh or re-login to see current values.
 */
@Injectable({ providedIn: 'root' })
export class SellerBalanceService {
  private readonly dashboardService = inject(SellerDashboardService);
  private readonly chatService = inject(ChatService);

  readonly balance = signal(0);
  readonly guaranteeBalance = signal(0);
  /** Admin-set only — gates withdrawal eligibility below 90 (enforced server-side too, in SellerWithdrawController.Submit). Null until the first summary fetch resolves. */
  readonly creditScore = signal<number | null>(null);
  /** Set only by AdminKycController.Review — never seller-editable. */
  readonly isVerified = signal(false);
  /** Admin-set only — a manual override, not a computed average. */
  readonly rating = signal<number | null>(null);

  private listenerAttached = false;

  /** Idempotent — safe to call from every seller shell/page that needs live account state. */
  async init(): Promise<void> {
    this.attachListener();
    this.refresh();
    await this.chatService.ensureStarted();
  }

  refresh(): void {
    firstValueFrom(this.dashboardService.getSummary())
      .then((summary) => {
        this.balance.set(summary.balance);
        this.guaranteeBalance.set(summary.guaranteeBalance);
        this.creditScore.set(summary.creditScore);
        this.isVerified.set(summary.isVerified);
        this.rating.set(summary.rating);
      })
      .catch(() => {
        // Sidebar chrome degrades to its last known value; the dashboard page surfaces the real error/retry UI.
      });
  }

  private attachListener(): void {
    if (this.listenerAttached) {
      return;
    }
    this.listenerAttached = true;

    // chatService.onConnection (not a one-off getConnection().on()) so this survives a reconnect —
    // including the connection ChatService rebuilds after a logout/login cycle in the same tab — see
    // ChatService.onConnection's doc comment.
    this.chatService.onConnection((connection) => {
      connection.on('BalanceUpdated', (event: BalanceUpdatedEvent) => {
        this.balance.set(event.balance);
        this.guaranteeBalance.set(event.guaranteeBalance);
      });
      connection.on('SellerProfileUpdated', (event: SellerProfileUpdatedEvent) => {
        this.isVerified.set(event.isVerified);
        this.rating.set(event.rating);
        this.creditScore.set(event.creditScore);
      });
    });
  }
}
