import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenService } from '../services/token.service';
import { SellerKycStatusService } from '../services/seller-kyc-status.service';

export const adminGuard: CanActivateFn = () => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (tokenService.role() === 'Admin') {
    return true;
  }

  return router.createUrlTree(['/admin/login']);
};

export const sellerGuard: CanActivateFn = () => {
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (tokenService.role() === 'Seller') {
    return true;
  }

  return router.createUrlTree(['/seller/login']);
};

/** Guards Products/Orders specifically — the rest of the seller portal (Dashboard, Profile, Chat,
 * Top-Up, Withdraw, Bank Details) is reachable regardless of KYC status; only these two modules require
 * an Active seller. This is real enforcement, not just hiding a nav link: the same restriction is
 * mirrored server-side (SellerProductsController/SellerOrdersController's class-level KycApproved
 * policy), so a bookmark or a typed-in URL can't bypass it — this guard just avoids the round trip to
 * find that out. */
export const kycApprovedGuard: CanActivateFn = async () => {
  const kycStatusService = inject(SellerKycStatusService);
  const router = inject(Router);

  const status = await kycStatusService.ensureLoaded();
  if (status === 'Active') {
    return true;
  }

  return router.createUrlTree(['/seller/dashboard']);
};

/** Progress was removed from the Seller Portal's nav/UI (no sidebar link, no quick-link) but the route,
 * component, and backend data are deliberately left intact — this guard is what actually prevents a
 * seller from reaching it via a bookmarked or typed-in URL, redirecting the same place kycApprovedGuard
 * does rather than leaving the route silently reachable. */
export const progressHiddenGuard: CanActivateFn = () => {
  const router = inject(Router);
  return router.createUrlTree(['/seller/dashboard']);
};
