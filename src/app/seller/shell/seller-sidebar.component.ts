import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { SellerBalanceService } from '../../core/services/seller-balance.service';
import { SellerDashboardService } from '../../core/services/seller-dashboard.service';
import { SellerKycStatusService } from '../../core/services/seller-kyc-status.service';
import { NotificationBellComponent } from '../../shared/notification-bell/notification-bell.component';
import { VerifiedBadgeComponent } from '../../shared/verified-badge/verified-badge.component';

@Component({
  selector: 'app-seller-sidebar',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, NotificationBellComponent, VerifiedBadgeComponent],
  templateUrl: './seller-sidebar.component.html',
  styleUrl: './seller-sidebar.component.scss'
})
export class SellerSidebarComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly sellerDashboardService = inject(SellerDashboardService);
  private readonly router = inject(Router);
  private readonly kycStatusService = inject(SellerKycStatusService);
  private readonly destroyRef = inject(DestroyRef);
  readonly chatService = inject(ChatService);
  readonly sellerBalanceService = inject(SellerBalanceService);

  readonly storeName = signal<string | null>(null);
  readonly sellerName = signal<string | null>(null);
  readonly isVerified = this.sellerBalanceService.isVerified;
  readonly balance = this.sellerBalanceService.balance;
  readonly guaranteeBalance = this.sellerBalanceService.guaranteeBalance;
  readonly pendingOrders = signal(0);

  // Drives hiding the global chat FAB while already on the Chat page itself (see template). Seeded
  // from the router's current state (not just future NavigationEnd events) so a hard refresh/direct
  // load of /seller/chat hides it immediately rather than only after the next navigation.
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );
  readonly onChatPage = computed(() => this.currentUrl().startsWith('/seller/chat'));

  // A lazy route's chunk (or a guard like kycApprovedGuard) can take a moment to resolve on a slow
  // mobile connection, and nothing else on this shell gave any feedback while that happened — a tap
  // on a nav item looked like it did nothing at all until the page eventually appeared, which is
  // exactly what makes someone tap the same target again (and sometimes a third time) thinking the
  // first tap didn't register. This just drives a thin top-of-content progress bar (see template/scss)
  // for that window — no change to the guard/navigation logic itself, only to whether the seller can
  // SEE that their tap was already received and is being acted on.
  readonly isNavigating = toSignal(
    this.router.events.pipe(
      filter(
        (e): e is NavigationStart | NavigationEnd | NavigationCancel | NavigationError =>
          e instanceof NavigationStart || e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError
      ),
      map((e) => e instanceof NavigationStart)
    ),
    { initialValue: false }
  );

  // Portal navigation is never blocked anymore (only Products/Orders themselves are, via
  // kycApprovedGuard) — this just drives the lock-icon/tooltip treatment on those two nav links so
  // it's clear why they're there before the seller even clicks. The KYC status banner on the
  // Dashboard is where the actual status/rejection-reason/resubmit UI lives.
  readonly kycApproved = computed(() => this.kycStatusService.status() === 'Active');

  // The 'Orders' nav badge otherwise only got its count once, in ngOnInit — since this component
  // wraps the whole seller portal via <router-outlet> and never remounts, accepting an order (or a new
  // one being assigned) left it showing the pre-action count until a hard refresh. Reusing the same
  // 'OrderUpdated' push every order-list/detail page already listens to (via the shared ChatService hub
  // connection) keeps it live, the same way SellerBalanceService already does for the balance figures.
  private readonly onOrderUpdated = () => this.loadPendingOrdersCount();

  ngOnInit(): void {
    this.chatService.refreshUnreadCount();
    void this.sellerBalanceService.init();
    this.loadSummary();
    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('OrderUpdated', this.onOrderUpdated);
    });
    this.destroyRef.onDestroy(() => {
      this.chatService.getConnection().off('OrderUpdated', this.onOrderUpdated);
    });
  }

  private loadSummary(): void {
    this.sellerDashboardService.getSummary().subscribe({
      next: (res) => {
        this.storeName.set(res.storeName);
        this.sellerName.set(res.sellerName);
        this.pendingOrders.set(res.pendingOrders);
        this.kycStatusService.setFromSummary(res.sellerStatus);
      },
      error: () => {
        // Sidebar chrome degrades to zero-state values; the dashboard page surfaces the real error/retry UI.
      }
    });
  }

  private loadPendingOrdersCount(): void {
    this.sellerDashboardService.getSummary().subscribe({
      next: (res) => this.pendingOrders.set(res.pendingOrders),
      error: () => {}
    });
  }

  goToChat(): void {
    this.router.navigateByUrl('/seller/chat');
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  logout(): void {
    this.authService.logout().subscribe(() => this.router.navigateByUrl('/seller/login'));
  }
}
