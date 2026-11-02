import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, of, shareReplay, tap, throwError, timeout } from 'rxjs';
import {
  AdminLoginRequest,
  AuthResponse,
  SellerLoginRequest,
  SellerRegisterRequest,
  ValidateInviteResponse
} from '../models/auth.model';
import { ApiService } from './api.service';
import { ChatService } from './chat.service';
import { NotificationService } from './notification.service';
import { TokenService } from './token.service';

const LAST_ROLE_KEY = 'ecom_last_role';
const LOGOUT_BROADCAST_KEY = 'ecom_logout_broadcast';
const PROACTIVE_REFRESH_BUFFER_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;
// A hung request (dropped connection, unresponsive server) previously left no way out — the caller's
// Observable just never emitted next/error, e.g. leaving a login button's loading state stuck forever.
// These are generous enough to never trip on a genuinely slow-but-working connection, while guaranteeing
// every auth-critical call eventually settles one way or the other.
const LOGIN_TIMEOUT_MS = 20_000;
const REFRESH_TIMEOUT_MS = 15_000;
const LOGOUT_TIMEOUT_MS = 10_000;

/** A rxjs TimeoutError has no HTTP semantics of its own — normalized here into the same
 * HttpErrorResponse shape every caller (component error handlers, the interceptor's status checks)
 * already expects, so a timeout is just another error status they handle with zero special-casing.
 * Exported so other services with the same hung-request risk (e.g. SellerOnboardingService's KYC
 * upload) can reuse it instead of duplicating this normalization. */
export function toTimeoutHttpError(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 0,
    error: { error: 'The request timed out. Please check your connection and try again.' }
  });
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly chatService = inject(ChatService);
  private readonly notificationService = inject(NotificationService);

  private pendingRefresh$: Observable<AuthResponse> | null = null;
  private proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  /** Guards handleUnrecoverableSession against firing its clear+redirect more than once for the same
   * session invalidation (see that method's doc comment). Re-armed on every new valid session. */
  private invalidationHandled = false;

  constructor() {
    // Re-arms on every new token (login/refresh) since expiresAt changes each time the signal is set.
    effect(() => this.scheduleProactiveRefresh(this.tokenService.expiresAt()));
    // Cross-tab logout sync (explicit logout, or an unrecoverable 401 in any tab) — see
    // clearLocalSession/onStorageEvent below.
    window.addEventListener('storage', (event) => this.onStorageEvent(event));
  }

  adminLogin(request: AdminLoginRequest): Observable<AuthResponse> {
    return this.api.post<AuthResponse, AdminLoginRequest>('admin/auth/login', request).pipe(
      timeout(LOGIN_TIMEOUT_MS),
      tap((res) => this.applyAuthResponse(res)),
      catchError((err) => throwError(() => (err instanceof HttpErrorResponse ? err : toTimeoutHttpError())))
    );
  }

  sellerLogin(request: SellerLoginRequest): Observable<AuthResponse> {
    return this.api.post<AuthResponse, SellerLoginRequest>('seller/auth/login', request).pipe(
      timeout(LOGIN_TIMEOUT_MS),
      tap((res) => this.applyAuthResponse(res)),
      catchError((err) => throwError(() => (err instanceof HttpErrorResponse ? err : toTimeoutHttpError())))
    );
  }

  sellerRegister(request: SellerRegisterRequest): Observable<AuthResponse> {
    return this.api
      .post<AuthResponse, SellerRegisterRequest>('seller/auth/register', request)
      .pipe(tap((res) => this.applyAuthResponse(res)));
  }

  validateInvite(code: string): Observable<ValidateInviteResponse> {
    return this.api.post<ValidateInviteResponse, { code: string }>('seller/auth/validate-invite', { code });
  }

  /**
   * Single-flight: every concurrent caller (multiple components hitting a 401 at once, or the
   * proactive-refresh timer racing a reactive retry) shares ONE actual HTTP refresh call instead of
   * firing N of them. The backend's refresh token is single-use/rotating with theft-detection — N
   * concurrent refresh() calls meant only the first succeeded and every other one tripped
   * reuse-detection, revoking the whole session. Same in-flight-dedup pattern as
   * SellerDashboardService.getSummary().
   */
  refresh(): Observable<AuthResponse> {
    if (this.pendingRefresh$) {
      return this.pendingRefresh$;
    }
    const role = localStorage.getItem(LAST_ROLE_KEY);
    const path = role === 'Seller' ? 'seller' : 'admin';
    this.pendingRefresh$ = this.api.post<AuthResponse>(`${path}/auth/refresh`, {}).pipe(
      timeout(REFRESH_TIMEOUT_MS),
      tap((res) => this.applyAuthResponse(res)),
      // A timeout here must be treated exactly like any other network hiccup, never a genuine auth
      // rejection — it has no HTTP status, so every existing "was this a real 401/403?" check downstream
      // (the interceptor, scheduleProactiveRefresh's error handler) already leaves the session alone for
      // it with no further change needed; this only guarantees the call itself always settles instead of
      // hanging the whole retry chain behind it forever.
      catchError((err) => throwError(() => (err instanceof HttpErrorResponse ? err : toTimeoutHttpError()))),
      finalize(() => (this.pendingRefresh$ = null)),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.pendingRefresh$;
  }

  /** Explicit logout (Logout button). Clears local state even if the server call errors OR hangs — a
   * network blip (or an unresponsive server) during logout must not strand the user "logged in" to a
   * session that's already meant to be gone client-side. */
  logout(): Observable<object> {
    const role = this.tokenService.role() ?? (localStorage.getItem(LAST_ROLE_KEY) as 'Admin' | 'Seller' | null);
    const path = role === 'Seller' ? 'seller' : 'admin';
    return this.api.post(`${path}/auth/logout`, {}).pipe(
      timeout(LOGOUT_TIMEOUT_MS),
      tap(() => this.clearLocalSession(role)),
      catchError(() => {
        this.clearLocalSession(role);
        return of({});
      })
    );
  }

  /** Called when a refresh attempt comes back with a genuine auth rejection (401/403) — the session is
   * really gone (revoked, or the refresh token's own absolute expiry), not just a network hiccup. Owns
   * the redirect itself (rather than leaving each of its two call sites — the interceptor and
   * scheduleProactiveRefresh — to duplicate the same target logic) and is idempotent: concurrent
   * requests that all 401 around the same moment (a common case right when the access token actually
   * expires) each independently reach this, but only the first one actually clears state / navigates —
   * the rest are no-ops. Reset back to armed by applyAuthResponse, so a LATER session's own expiry can
   * still be handled. */
  handleUnrecoverableSession(): void {
    if (this.invalidationHandled) {
      return;
    }
    this.invalidationHandled = true;
    const role = this.tokenService.role() ?? (localStorage.getItem(LAST_ROLE_KEY) as 'Admin' | 'Seller' | null);
    this.clearLocalSession(role);
    this.router.navigateByUrl(role === 'Seller' ? '/seller/login' : '/admin/login');
  }

  /** Stores the access token and last-known role from any endpoint that returns an AuthResponse (login, register, refresh, or the signup wizard's combined complete-application call). */
  applyAuthResponse(res: AuthResponse): void {
    this.tokenService.setToken(res.accessToken, res.accessTokenExpiresAt);
    localStorage.setItem(LAST_ROLE_KEY, res.role);
    // A new, valid session begins here — re-arm so THIS session's own eventual expiry can still be
    // handled (handleUnrecoverableSession would otherwise stay permanently tripped from whatever
    // session, if any, ended right before this one started).
    this.invalidationHandled = false;
  }

  private clearLocalSession(role: 'Admin' | 'Seller' | null): void {
    this.tokenService.clear();
    localStorage.removeItem(LAST_ROLE_KEY);
    this.clearProactiveRefreshTimer();
    // The live-signal connection (notifications, order/balance updates, ...) was never actually torn
    // down on logout before — it only ever stopped as an accidental side effect of leaving the Chat
    // page. A tab that logged out could keep silently receiving another account's live pushes on a
    // stale connection until the page was closed. Full disconnect() (not leaveThread()) is correct
    // here: the identity itself is ending, not just the current chat thread.
    void this.chatService.disconnect();
    // Clears this account's in-memory notification state — otherwise a different account logging in
    // next, in the same tab with no full page reload in between, would briefly see the previous
    // account's stale notifications/unread count until their own first refetch happened to land.
    this.notificationService.reset();
    // A dialog (e.g. the KYC-pending modal) lives in the CDK overlay, outside the router-outlet — a
    // plain router navigation away from the authenticated shell does NOT close it on its own, which
    // otherwise leaves it visually stuck on top of the login page after a forced logout.
    this.dialog.closeAll();
    // Broadcasts to every other tab via the 'storage' event — see onStorageEvent below.
    localStorage.setItem(LOGOUT_BROADCAST_KEY, JSON.stringify({ role, at: Date.now() }));
  }

  private onStorageEvent(event: StorageEvent): void {
    if (event.key !== LOGOUT_BROADCAST_KEY || !event.newValue || !this.tokenService.hasToken()) {
      return; // not our key, or this tab is already logged out
    }
    let role: 'Admin' | 'Seller' | null = null;
    try {
      role = JSON.parse(event.newValue).role ?? null;
    } catch {
      // ignore malformed payload
    }

    this.invalidationHandled = true;
    this.tokenService.clear();
    localStorage.removeItem(LAST_ROLE_KEY);
    this.clearProactiveRefreshTimer();
    void this.chatService.disconnect();
    this.notificationService.reset();
    this.dialog.closeAll();
    this.router.navigateByUrl(role === 'Seller' ? '/seller/login' : '/admin/login');
  }

  private scheduleProactiveRefresh(expiresAt: string | null): void {
    this.clearProactiveRefreshTimer();
    if (!expiresAt) {
      return;
    }
    const delay = Math.max(new Date(expiresAt).getTime() - Date.now() - PROACTIVE_REFRESH_BUFFER_MS, MIN_REFRESH_DELAY_MS);
    this.proactiveRefreshTimer = setTimeout(() => {
      this.refresh().subscribe({
        error: (err: HttpErrorResponse) => {
          // Only a genuine auth rejection means the session is really gone — a network error/timeout
          // (including refresh()'s own internal timeout, normalized to status 0 above) must NOT log the
          // user out; the token is simply left as-is and the next proactive attempt (or the reactive 401
          // path once the token actually expires) retries.
          if (err.status === 401 || err.status === 403) {
            this.handleUnrecoverableSession();
          }
        }
      });
    }, delay);
  }

  private clearProactiveRefreshTimer(): void {
    if (this.proactiveRefreshTimer) {
      clearTimeout(this.proactiveRefreshTimer);
      this.proactiveRefreshTimer = null;
    }
  }
}
