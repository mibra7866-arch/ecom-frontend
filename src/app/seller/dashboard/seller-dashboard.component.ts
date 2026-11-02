import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';
import { SellerBalanceService } from '../../core/services/seller-balance.service';
import { SellerDashboardService } from '../../core/services/seller-dashboard.service';
import { SellerDashboardSummaryDto } from '../../core/models/seller-dashboard.model';
import { TokenService } from '../../core/services/token.service';
import { KycStatusBannerComponent } from '../../shared/kyc-status-banner/kyc-status-banner.component';
import { StarRatingComponent } from '../../shared/star-rating/star-rating.component';
import { VerifiedBadgeComponent } from '../../shared/verified-badge/verified-badge.component';
import { SellerTopUpModalComponent } from '../topup/seller-topup-modal/seller-topup-modal.component';

const CATEGORY_DOT_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

@Component({
  selector: 'app-seller-dashboard',
  standalone: true,
  imports: [MatIconModule, KycStatusBannerComponent, StarRatingComponent, VerifiedBadgeComponent],
  templateUrl: './seller-dashboard.component.html',
  styleUrl: './seller-dashboard.component.scss'
})
export class SellerDashboardComponent implements OnInit {
  private readonly sellerDashboardService = inject(SellerDashboardService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  readonly tokenService = inject(TokenService);
  readonly chatService = inject(ChatService);
  readonly sellerBalanceService = inject(SellerBalanceService);

  readonly summary = signal<SellerDashboardSummaryDto | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  // Live-updating (SignalR "SellerProfileUpdated"), unlike the rest of `summary` below which is a
  // one-time snapshot from load() — an admin changing these should reflect here without a refresh.
  readonly isVerified = this.sellerBalanceService.isVerified;
  readonly rating = this.sellerBalanceService.rating;
  readonly creditScore = this.sellerBalanceService.creditScore;

  readonly initial = computed(() => (this.tokenService.claims().name ?? '?').charAt(0).toUpperCase());

  // Order accept/complete and balance-affecting actions change TotalOrders/TotalOrdersAmount/
  // TotalProfit and the sales stats below, none of which have their own dedicated live event — a
  // full summary re-fetch (quiet, no loading spinner) on either push keeps them current without a
  // manual reload, same "re-fetch the summary on a live push" pattern the sidebar's pending-orders
  // badge and SellerBalanceService already use.
  private readonly onLiveUpdate = () => this.refreshSummary();

  ngOnInit(): void {
    this.load();
    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('OrderUpdated', this.onLiveUpdate);
      this.chatService.getConnection().on('BalanceUpdated', this.onLiveUpdate);
    });
    this.destroyRef.onDestroy(() => {
      this.chatService.getConnection().off('OrderUpdated', this.onLiveUpdate);
      this.chatService.getConnection().off('BalanceUpdated', this.onLiveUpdate);
    });
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.sellerDashboardService.getSummary().subscribe({
      next: (res) => {
        this.summary.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to load dashboard data.');
        this.loading.set(false);
      }
    });
  }

  private refreshSummary(): void {
    this.sellerDashboardService.getSummary().subscribe({
      next: (res) => this.summary.set(res),
      error: () => {
        // Live refresh failures degrade to the last known snapshot — load()'s own error/retry UI
        // already covers a genuinely broken connection.
      }
    });
  }

  goToProducts(): void {
    this.router.navigateByUrl('/seller/products');
  }

  goToOrders(): void {
    this.router.navigateByUrl('/seller/orders');
  }

  goToWithdraw(): void {
    this.router.navigateByUrl('/seller/withdraw');
  }

  /** Same SellerTopUpModalComponent + dialog config as the "+ Top Up" sidebar button/Top Up page's own
   * "+ Top Up" action (SellerTopUpListComponent.openTopUpModal) — one submission flow, opened from a
   * third place, rather than navigating away to the Top Up page just to reach the same form. Nothing
   * on the dashboard needs to react to a successful submission (unlike the Top Up page's own request
   * history list), so the result is intentionally left unhandled. */
  openTopUpModal(): void {
    this.dialog.open(SellerTopUpModalComponent, {
      width: 'clamp(340px, 90vw, 700px)',
      maxWidth: '94vw',
      maxHeight: '90vh',
      panelClass: 'seller-catalog-dialog-panel'
    });
  }

  /** The seller has exactly one thread (keyed by their own sellerId — see ChatService/ChatHub doc
   * comments), so there's no conversation to pick: navigating here IS opening "the Admin Support
   * conversation", already-existing or not. SellerChatComponent.ngOnInit clears unreadCount to 0
   * itself once the thread is marked read, so this doesn't need to touch it. */
  categoryColor(index: number): string {
    return CATEGORY_DOT_COLORS[index % CATEGORY_DOT_COLORS.length];
  }

  formatCurrency(value: number | undefined): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);
  }
}
