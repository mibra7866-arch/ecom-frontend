import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppNotification } from '../models/notification.model';
import { ChatService } from './chat.service';
import { SellerDashboardService } from './seller-dashboard.service';

export type SellerKycStatus = 'PendingKyc' | 'Active' | 'Suspended';

/**
 * Tracks the current seller's live KYC status for the Seller Portal shell — backs the KYC-pending
 * modal and, once approved, lets the shell unblock the portal immediately without a re-login. Seeded
 * from SellerDashboardService.getSummary() (already fetched by the shell on every mount) and kept
 * live by attaching its own listener to ChatService's shared hub connection, mirroring how
 * admin-chat.component.ts independently listens for the same 'ReceiveNotification' broadcast
 * alongside NotificationService's own listener — multiple independent listeners on one broadcast is
 * the established pattern here, not something to consolidate.
 */
@Injectable({ providedIn: 'root' })
export class SellerKycStatusService {
  private readonly chatService = inject(ChatService);
  private readonly sellerDashboardService = inject(SellerDashboardService);

  readonly status = signal<SellerKycStatus | null>(null);

  private listenerAttached = false;

  setFromSummary(status: SellerKycStatus): void {
    this.status.set(status);
    this.ensureListener();
  }

  /** Used by kycApprovedGuard, which can run before the shell's own loadSummary() call resolves (e.g.
   * a fresh direct navigation to /seller/products) — resolves immediately if the status is already
   * known, otherwise fetches it itself. SellerDashboardService.getSummary() already shares an
   * in-flight request across simultaneous callers, so this never causes a second real network call
   * beyond whatever the shell was already about to make. */
  async ensureLoaded(): Promise<SellerKycStatus> {
    const current = this.status();
    if (current) {
      return current;
    }

    const summary = await firstValueFrom(this.sellerDashboardService.getSummary());
    this.setFromSummary(summary.sellerStatus);
    return summary.sellerStatus;
  }

  private ensureListener(): void {
    if (this.listenerAttached) {
      return;
    }
    this.listenerAttached = true;

    void this.chatService.ensureStarted();
    // chatService.onConnection (not a one-off getConnection().on()) so this survives a reconnect —
    // including the connection ChatService rebuilds after a logout/login cycle in the same tab — see
    // ChatService.onConnection's doc comment.
    this.chatService.onConnection((connection) => {
      connection.on('ReceiveNotification', (notification: AppNotification) => {
        if (notification.type === 'KycApproved') {
          this.status.set('Active');
        } else if (notification.type === 'KycRejected') {
          // A rejection never reverts Status server-side if the seller was already Active (Products/
          // Orders access is a separate, one-way rule — see AdminKycController.Review) — only flip the
          // signal here for the pre-approval case, so an already-approved seller's later rejection
          // doesn't incorrectly re-lock a portal they're still entitled to use.
          if (this.status() !== 'Active') {
            this.status.set('PendingKyc');
          }
        }
      });
    });
  }
}
