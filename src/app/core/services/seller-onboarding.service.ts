import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { AuthResponse } from '../models/auth.model';
import { ApiService } from './api.service';
import { toTimeoutHttpError } from './auth.service';

export interface CompleteSellerApplicationRequest {
  name: string;
  email: string;
  password: string;
  storeName: string;
  invitationCode: string | null;
  idFrontFile: File;
  idBackFile: File;
}

// Same hung-request risk AuthService's login/refresh/logout calls already guard against (see its
// LOGIN_TIMEOUT_MS comment) — a dropped/stalled connection here previously left the signup wizard's
// Finish button spinning forever with no way out. Longer than those because this request carries two
// KYC images (up to 10 MB each, see FileValidationRules.Default server-side) instead of a small JSON
// body, so it needs real headroom for a slow-but-still-progressing upload.
const COMPLETE_APPLICATION_TIMEOUT_MS = 120_000;

/**
 * Feature service for the seller signup wizard's Finish action. Sits on top of the generic
 * ApiService rather than each screen building its own HTTP call — the wizard component just
 * builds the request and calls completeApplication().
 */
@Injectable({ providedIn: 'root' })
export class SellerOnboardingService {
  private readonly api = inject(ApiService);

  /**
   * Registers the seller and uploads their mandatory KYC ID documents (front + back) in the same
   * request, so the backend persists all of it in one database transaction. Bank/payout details and
   * the transaction password are no longer collected here — the seller adds them later from Profile
   * → Payout Method / Security (same SellerBankDetailsService/Seller columns). Returns an
   * AuthResponse — the caller (seller-signup.component.ts) applies it via AuthService to log the
   * seller straight into the portal, same as a normal login/register.
   */
  completeApplication(request: CompleteSellerApplicationRequest): Observable<AuthResponse> {
    const formData = new FormData();
    formData.append('name', request.name);
    formData.append('email', request.email);
    formData.append('password', request.password);
    formData.append('storeName', request.storeName);
    if (request.invitationCode) {
      formData.append('invitationCode', request.invitationCode);
    }
    formData.append('idFrontFile', request.idFrontFile);
    formData.append('idBackFile', request.idBackFile);

    return this.api.postFormData<AuthResponse>('seller/auth/complete', formData).pipe(
      timeout(COMPLETE_APPLICATION_TIMEOUT_MS),
      catchError((err) => throwError(() => (err instanceof HttpErrorResponse ? err : toTimeoutHttpError())))
    );
  }
}
