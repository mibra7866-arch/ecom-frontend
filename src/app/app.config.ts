import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withPreloading } from '@angular/router';
import { catchError, firstValueFrom, of } from 'rxjs';

import { routes } from './app.routes';
import { SelectiveOnDataPreloadingStrategy } from './core/routing/selective-preload.strategy';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { ChunkErrorRecoveryService } from './core/services/chunk-error-recovery.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withPreloading(SelectiveOnDataPreloadingStrategy)),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    // Applies to every MatSnackBar.open() call app-wide (admin + seller) so toasts don't need
    // per-call positioning — surfaces near the header instead of the page bottom.
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: { verticalPosition: 'top', duration: 3000, panelClass: 'app-snackbar-top' }
    },
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      inject(ChunkErrorRecoveryService); // eagerly constructed so it starts watching router navigation from app boot
      // A failed boot-time refresh just means no valid session to restore (first visit, expired/revoked
      // refresh token, etc.) — the router guards handle sending the user to login from there.
      return firstValueFrom(authService.refresh().pipe(catchError(() => of(null))));
    })
  ]
};
