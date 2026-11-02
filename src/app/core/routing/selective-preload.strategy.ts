import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Preloads only routes explicitly opted in via `data: { preload: true }` (see app.routes.ts) —
 * NOT Angular's built-in PreloadAllModules, which would also prefetch the entire admin portal's
 * chunks during a seller session (and vice versa) even though the two are mutually exclusive per
 * login. Without any preloading strategy at all, every lazy route's chunk is only ever fetched cold,
 * on the first tap that navigates to it — on mobile that network round-trip is exactly what shows up
 * as a "noticeable delay before the page responds" after tapping a module. Flagged routes are
 * prefetched in the background once the initial route has finished activating, so by the time the
 * seller actually taps another tab/quick-link, its component is already in memory.
 */
@Injectable({ providedIn: 'root' })
export class SelectiveOnDataPreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] ? load() : of(null);
  }
}
