import { Routes } from '@angular/router';
import { adminGuard, kycApprovedGuard, progressHiddenGuard, sellerGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'seller/landing', pathMatch: 'full' },
  {
    path: 'admin/login',
    loadComponent: () => import('./admin/login/admin-login.component').then((m) => m.AdminLoginComponent)
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/shell/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./admin/dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent)
      },
      {
        path: 'sellers',
        loadComponent: () => import('./admin/sellers/sellers-list.component').then((m) => m.SellersListComponent)
      },
      {
        path: 'invitations',
        loadComponent: () => import('./admin/invitations/invitations-list.component').then((m) => m.InvitationsListComponent)
      },
      {
        path: 'admins',
        loadComponent: () => import('./admin/admins/admins-list.component').then((m) => m.AdminsListComponent)
      },
      {
        path: 'kyc',
        loadComponent: () => import('./admin/kyc/kyc-review.component').then((m) => m.KycReviewComponent)
      },
      {
        path: 'products',
        loadComponent: () => import('./admin/products/products-list.component').then((m) => m.ProductsListComponent)
      },
      {
        path: 'orders',
        loadComponent: () => import('./admin/orders/orders-list.component').then((m) => m.OrdersListComponent)
      },
      {
        path: 'withdrawals',
        loadComponent: () => import('./admin/withdrawals/withdrawals-list.component').then((m) => m.WithdrawalsListComponent)
      },
      {
        path: 'topup',
        loadComponent: () => import('./admin/topup/admin-topup-requests.component').then((m) => m.AdminTopUpRequestsComponent)
      },
      {
        path: 'chat',
        loadComponent: () => import('./admin/chat/admin-chat.component').then((m) => m.AdminChatComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./admin/profile/admin-profile.component').then((m) => m.AdminProfileComponent)
      }
    ]
  },
  {
    path: 'seller/landing',
    loadComponent: () => import('./seller/landing/seller-landing.component').then((m) => m.SellerLandingComponent)
  },
  {
    path: 'seller/signup',
    loadComponent: () => import('./seller/signup/seller-signup.component').then((m) => m.SellerSignupComponent)
  },
  {
    path: 'seller/login',
    loadComponent: () => import('./seller/login/seller-login.component').then((m) => m.SellerLoginComponent)
  },
  {
    path: 'seller',
    canActivate: [sellerGuard],
    loadComponent: () => import('./seller/shell/seller-sidebar.component').then((m) => m.SellerSidebarComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      // data.preload flags the seller portal's own top-level modules (the ones reachable from the
      // bottom tab bar / Profile quick-links — see seller-sidebar.component.html) for
      // SelectiveOnDataPreloadingStrategy (app.routes.ts's default, no-preload behavior only prefetches
      // a lazy chunk once the user actually taps it — on mobile that cold fetch is exactly the
      // "noticeable delay before the page responds" the seller portal was seeing). Once the seller
      // lands on any of these after login, the router preloads the REST of this list in the
      // background, so by the time they actually tap another tab, its chunk is already cached.
      // orders/:id is deliberately left unflagged — a parameterized detail route, not a "module".
      {
        path: 'dashboard',
        loadComponent: () => import('./seller/dashboard/seller-dashboard.component').then((m) => m.SellerDashboardComponent),
        data: { preload: true }
      },
      {
        path: 'home',
        loadComponent: () => import('./seller/home/seller-home.component').then((m) => m.SellerHomeComponent),
        data: { preload: true }
      },
      {
        path: 'products',
        canActivate: [kycApprovedGuard],
        loadComponent: () => import('./seller/products/seller-products-list.component').then((m) => m.SellerProductsListComponent),
        data: { preload: true }
      },
      {
        path: 'orders',
        canActivate: [kycApprovedGuard],
        loadComponent: () => import('./seller/orders/seller-orders-list.component').then((m) => m.SellerOrdersListComponent),
        data: { preload: true }
      },
      {
        path: 'orders/:id',
        canActivate: [kycApprovedGuard],
        loadComponent: () => import('./seller/orders/detail/seller-order-detail.component').then((m) => m.SellerOrderDetailComponent)
      },
      {
        // Removed from the Seller Portal's nav/UI — see progressHiddenGuard's doc comment. The route,
        // component, and backend data are untouched; this only blocks reaching it directly.
        path: 'progress',
        canActivate: [progressHiddenGuard],
        loadComponent: () => import('./seller/progress/seller-progress.component').then((m) => m.SellerProgressComponent)
      },
      {
        path: 'topup',
        loadComponent: () => import('./seller/topup/seller-topup-list.component').then((m) => m.SellerTopUpListComponent),
        data: { preload: true }
      },
      {
        path: 'withdraw',
        loadComponent: () => import('./seller/withdraw/seller-withdraw-list.component').then((m) => m.SellerWithdrawListComponent),
        data: { preload: true }
      },
      {
        path: 'chat',
        loadComponent: () => import('./seller/chat/seller-chat.component').then((m) => m.SellerChatComponent),
        data: { preload: true }
      }
    ]
  },
  { path: '**', redirectTo: 'seller/landing' }
];
