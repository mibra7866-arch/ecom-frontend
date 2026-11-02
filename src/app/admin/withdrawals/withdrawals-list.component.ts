import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { environment } from '../../../environments/environment';
import { WithdrawalsService } from '../../core/services/withdrawals.service';
import { WithdrawalListItemDto, WithdrawalStatus } from '../../core/models/withdrawal.model';
import { ImagePreviewService } from '../../shared/image-preview/image-preview.service';
import { PagerComponent } from '../../shared/pager/pager.component';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { isImageUrl } from '../../shared/utils/file-type.util';
import { WithdrawalDetailDialogComponent } from './withdrawal-detail-dialog/withdrawal-detail-dialog.component';

@Component({
  selector: 'app-withdrawals-list',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatTableModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    PagerComponent,
    StatusBadgeComponent
  ],
  templateUrl: './withdrawals-list.component.html',
  styleUrl: './withdrawals-list.component.scss'
})
export class WithdrawalsListComponent implements OnInit {
  private readonly withdrawalsService = inject(WithdrawalsService);
  private readonly dialog = inject(MatDialog);
  private readonly imagePreview = inject(ImagePreviewService);

  readonly withdrawals = signal<WithdrawalListItemDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly statusFilter = signal<WithdrawalStatus | null>('Pending');

  readonly statuses: WithdrawalStatus[] = ['Pending', 'Paid', 'Rejected'];
  readonly columns = ['id', 'sellerName', 'amount', 'receipt', 'status', 'requestedAt'];
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
    this.withdrawalsService.markRead();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.withdrawalsService.list(this.statusFilter(), this.page(), 10).subscribe({
      next: (res) => {
        this.withdrawals.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load withdrawals.');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  setFilter(status: WithdrawalStatus | null): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  fileUrl(receiptUrl: string): string {
    return `${environment.filesBaseUrl}${receiptUrl}`;
  }

  isImageReceipt(receiptUrl: string): boolean {
    return isImageUrl(receiptUrl);
  }

  /** Stops the row/card's own openDetail() click from also firing (same as the existing receipt link) — an image receipt opens the shared lightbox instead of a new tab; a non-image one still opens normally. */
  openReceiptImage(event: Event, receiptUrl: string): void {
    event.stopPropagation();
    this.imagePreview.open(this.fileUrl(receiptUrl), 'Payout proof');
  }

  openDetail(withdrawal: WithdrawalListItemDto): void {
    const ref = this.dialog.open(WithdrawalDetailDialogComponent, {
      width: '560px',
      maxWidth: '92vw',
      maxHeight: '90vh',
      panelClass: 'seller-catalog-dialog-panel',
      data: { withdrawal }
    });

    ref.afterClosed().subscribe((updated?: WithdrawalListItemDto) => {
      if (!updated) {
        return;
      }

      // Reflect the reviewed request immediately; if it no longer matches the active filter, drop it
      // from the current view — same reconciliation AdminTopUpRequestsComponent already uses.
      if (this.statusFilter() !== null && updated.status !== this.statusFilter()) {
        this.withdrawals.update((current) => current.filter((w) => w.id !== updated.id));
        this.totalCount.update((count) => Math.max(0, count - 1));
      } else {
        this.withdrawals.update((current) => current.map((w) => (w.id === updated.id ? updated : w)));
      }
    });
  }
}
