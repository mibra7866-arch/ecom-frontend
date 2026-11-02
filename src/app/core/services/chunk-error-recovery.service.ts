import { Injectable, inject } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';

const RELOAD_GUARD_KEY = 'ecom_chunk_reload_guard';

/**
 * Every deploy replaces the served build wholesale with fresh hashed chunk filenames. A tab left open
 * across a deploy still holds the OLD hashes for any lazy route (loadComponent) it hasn't fetched yet
 * — clicking into one then fails the dynamic import (that chunk file no longer exists on the server)
 * and the navigation just silently doesn't happen, with no visible error. A manual refresh picks up
 * the new index.html and works again. This does that refresh automatically, once, so a stale tab
 * self-heals instead of leaving the user stuck on a dead nav click.
 */
@Injectable({ providedIn: 'root' })
export class ChunkErrorRecoveryService {
  private readonly router = inject(Router);

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        sessionStorage.removeItem(RELOAD_GUARD_KEY);
      } else if (event instanceof NavigationError && this.looksLikeChunkLoadFailure(event.error)) {
        if (!sessionStorage.getItem(RELOAD_GUARD_KEY)) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
          window.location.reload();
        }
      }
    });
  }

  private looksLikeChunkLoadFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /dynamically imported module|loading chunk|failed to fetch|importing a module script failed/i.test(message);
  }
}
