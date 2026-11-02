import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { TokenService } from '../services/token.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const authService = inject(AuthService);

  const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/refresh') || req.url.includes('/auth/register');

  const token = tokenService.accessToken();
  const authReq = req.clone({
    withCredentials: true,
    setHeaders: token ? { Authorization: `Bearer ${token}` } : {}
  });

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthEndpoint) {
        return throwError(() => error);
      }

      // authService.refresh() is single-flight — every request that lands here at roughly the same
      // time (the common case right after an access token expires, e.g. on returning from background)
      // shares ONE actual refresh call instead of racing N of them against the backend's single-use
      // rotating refresh token.
      return authService.refresh().pipe(
        switchMap((res) => {
          const retried = req.clone({
            withCredentials: true,
            setHeaders: { Authorization: `Bearer ${res.accessToken}` }
          });
          return next(retried);
        }),
        catchError((refreshError: HttpErrorResponse) => {
          const isAuthRejection = refreshError.status === 401 || refreshError.status === 403;
          if (!isAuthRejection) {
            // Network failure / timeout / 5xx while refreshing — NOT a genuine invalid session. Leave
            // the token as-is and just fail this one request; the next request or the next proactive
            // refresh attempt retries once connectivity returns.
            return throwError(() => refreshError);
          }

          // Clears local state and redirects to login itself — idempotent, so concurrent requests that
          // all land here around the same moment (the common case right when the access token actually
          // expires and several in-flight calls all 401 together) never race each other into duplicate
          // clears or competing navigations.
          authService.handleUnrecoverableSession();
          return throwError(() => refreshError);
        })
      );
    })
  );
};
