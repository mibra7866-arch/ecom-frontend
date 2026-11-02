import { Injectable, inject } from '@angular/core';
import { Observable, finalize, shareReplay } from 'rxjs';
import { SellerDashboardSummaryDto } from '../models/seller-dashboard.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SellerDashboardService {
  private readonly api = inject(ApiService);

  private pendingSummary$: Observable<SellerDashboardSummaryDto> | null = null;

  /**
   * On login/every seller-portal navigation to a fresh route, several independent consumers each
   * call this within the same tick — the shell (store name/pending orders/KYC status), the persistent
   * SellerBalanceService, and whichever page just activated (Dashboard's own full summary, Progress'
   * stage data) — which used to mean 2-3 near-simultaneous, byte-for-byte identical HTTP requests to
   * this one endpoint on every login. Sharing the in-flight request (not caching the result — the
   * shared observable is thrown away the moment it resolves) collapses that burst into one real
   * network round-trip without introducing any staleness: a call made even a moment after the
   * previous one already settled still goes to the network fresh, exactly as before.
   */
  getSummary(): Observable<SellerDashboardSummaryDto> {
    if (!this.pendingSummary$) {
      this.pendingSummary$ = this.api.get<SellerDashboardSummaryDto>('seller/dashboard/summary').pipe(
        finalize(() => (this.pendingSummary$ = null)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.pendingSummary$;
  }
}
