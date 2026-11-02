import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, DestroyRef, OnInit, Signal, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AdminProfileService } from '../../core/services/admin-profile.service';
import { AdminTopUpService } from '../../core/services/admin-topup.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { KycAdminService } from '../../core/services/kyc-admin.service';
import { OrdersService } from '../../core/services/orders.service';
import { TokenService } from '../../core/services/token.service';
import { WithdrawalsService } from '../../core/services/withdrawals.service';
import { NotificationBellComponent } from '../../shared/notification-bell/notification-bell.component';

/** Notification types that mean "the KYC Review sidebar badge's unread count may have changed" — a full
 * refetch on receipt (not incrementing locally) so the badge can never drift from the true unread
 * count, matching every other live-refresh in this file. KycApproved/KycRejected are seller-directed
 * (never reach an admin's own connection) so they're deliberately not listened for here. */
const KYC_NOTIFICATION_TYPES = new Set(['KycSubmitted', 'KycResubmitted']);

interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Optional live count (e.g. AdminTopUpService.unreadCount) — renders with the same red badge used for Orders/KYC/Chat counts. Data-driven so new badged nav items don't need template changes. */
  badgeCount?: Signal<number>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    NotificationBellComponent
  ],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss'
})
export class AdminShellComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly adminTopUpService = inject(AdminTopUpService);
  private readonly adminProfileService = inject(AdminProfileService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly kycAdminService = inject(KycAdminService);
  private readonly ordersService = inject(OrdersService);
  private readonly withdrawalsService = inject(WithdrawalsService);
  private readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);
  readonly tokenService = inject(TokenService);

  // Only a SuperAdmin can create other admin accounts — this just hides the nav link for everyone
  // else; the actual authorization boundary is server-side (AdminsController re-checks the role live).
  readonly isSuperAdmin = signal(false);

  // The sidenav had zero mobile handling before this — hardcoded mode="side" opened, fixed 240px
  // width. Below 1024px (matching the seller portal's own sidebar breakpoint, so both portals switch
  // to a mobile nav at the same width) it becomes an off-canvas drawer instead.
  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 1024px)').pipe(map((r) => r.matches)),
    { initialValue: false }
  );
  // Defaults closed — desktop ignores this entirely (its [opened] binding is hardcoded true), so this
  // value only matters for the mobile case, where the drawer should start collapsed behind the
  // hamburger rather than covering the page on first load.
  readonly sidenavOpened = signal(false);

  readonly navGroups: NavGroup[] = [
    {
      label: 'MANAGE',
      items: [
        { label: 'Sellers', icon: 'storefront', route: '/admin/sellers' },
        { label: 'LLC Codes', icon: 'vpn_key', route: '/admin/invitations' },
        { label: 'KYC Review', icon: 'fact_check', route: '/admin/kyc', badgeCount: this.kycAdminService.unreadCount },
        { label: 'Products', icon: 'inventory_2', route: '/admin/products' },
        { label: 'Orders', icon: 'local_shipping', route: '/admin/orders', badgeCount: this.ordersService.completedUnreadCount }
      ]
    },
    {
      label: 'COMMUNICATION',
      items: [{ label: 'Chat', icon: 'chat', route: '/admin/chat', badgeCount: this.chatService.adminUnreadCount }]
    },
    {
      label: 'FINANCE',
      items: [
        { label: 'Withdrawals', icon: 'payments', route: '/admin/withdrawals', badgeCount: this.withdrawalsService.unreadCount },
        { label: 'Top-Up Requests', icon: 'add_card', route: '/admin/topup', badgeCount: this.adminTopUpService.unreadCount }
      ]
    },
    {
      label: 'ACCOUNT',
      items: [{ label: 'Profile', icon: 'person', route: '/admin/profile' }]
    }
  ];

  ngOnInit(): void {
    this.adminTopUpService.refreshUnreadCount();
    this.kycAdminService.refreshUnreadCount();
    this.withdrawalsService.refreshUnreadCount();
    this.ordersService.refreshCompletedUnreadCount();
    this.chatService.refreshAdminUnreadCount();
    this.adminProfileService.get().subscribe({
      next: (profile) => this.isSuperAdmin.set(profile.role === 'SuperAdmin'),
      error: () => {}
    });

    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('ReceiveNotification', this.onNotification);
    });
    this.destroyRef.onDestroy(() => {
      this.chatService.getConnection().off('ReceiveNotification', this.onNotification);
    });
  }

  // Re-fetches (never increments locally) so these badges can never drift from the true unread count —
  // same reasoning as every other live-refresh in this file.
  private readonly onNotification = (notification: { type: string }) => {
    if (KYC_NOTIFICATION_TYPES.has(notification.type)) {
      this.kycAdminService.refreshUnreadCount();
    } else if (notification.type === 'WithdrawalRequested') {
      this.withdrawalsService.refreshUnreadCount();
    } else if (notification.type === 'TopUpRequested') {
      this.adminTopUpService.refreshUnreadCount();
    } else if (notification.type === 'OrderCompletedAdmin') {
      this.ordersService.refreshCompletedUnreadCount();
    } else if (notification.type === 'ChatMessage') {
      this.chatService.refreshAdminUnreadCount();
    }
  };

  toggleSidenav(): void {
    this.sidenavOpened.set(!this.sidenavOpened());
  }

  closeSidenavIfMobile(): void {
    if (this.isMobile()) {
      this.sidenavOpened.set(false);
    }
  }

  logout(): void {
    this.authService.logout().subscribe(() => this.router.navigateByUrl('/admin/login'));
  }
}
