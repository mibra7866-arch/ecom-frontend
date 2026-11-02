import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SellerTopUpService } from '../../core/services/seller-topup.service';
import { TopUpListItemDto } from '../../core/models/topup.model';
import { PagerComponent } from '../../shared/pager/pager.component';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { SellerTopUpModalComponent } from './seller-topup-modal/seller-topup-modal.component';

const PAGE_SIZE = 10;

/** The "Top Up" sidebar page — reuses SellerTopUpModalComponent as-is (already built, already fires NotifyAsync(TopUpRequested) on submit) for the "+ Top Up" action; this page only adds the request-history list around it. */
@Component({
  selector: 'app-seller-topup-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatIconModule, MatProgressSpinnerModule, PagerComponent, StatusBadgeComponent],
  templateUrl: './seller-topup-list.component.html',
  styleUrl: './seller-topup-list.component.scss'
})
export class SellerTopUpListComponent implements OnInit {
  private readonly topUpService = inject(SellerTopUpService);
  private readonly dialog = inject(MatDialog);

  readonly requests = signal<TopUpListItemDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.topUpService.list(this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        // Guards against a stale/invalid current page (e.g. the dataset shrank between requests) —
        // land on the last real page instead of showing an empty list with a "Page N of M" that no
        // longer makes sense.
        if (res.totalPages > 0 && this.page() > res.totalPages) {
          this.page.set(res.totalPages);
          this.load();
          return;
        }
        this.requests.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load your top-up requests.');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  openTopUpModal(): void {
    this.dialog
      .open(SellerTopUpModalComponent, {
        // clamp() scales fluidly from near-full-width on mobile up to a wider, more square 700px
        // panel on desktop — one expression covers all three breakpoints without duplicating widths.
        width: 'clamp(340px, 90vw, 700px)',
        maxWidth: '94vw',
        maxHeight: '90vh',
        panelClass: 'seller-catalog-dialog-panel'
      })
      .afterClosed()
      .subscribe((submitted?: boolean) => {
        if (submitted) {
          this.page.set(1);
          this.load();
        }
      });
  }
}
