import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { environment } from '../../../environments/environment';
import { AdminTopUpService } from '../../core/services/admin-topup.service';
import { TopUpListItemDto, TopUpStatus } from '../../core/models/topup.model';
import { ImagePreviewService } from '../../shared/image-preview/image-preview.service';
import { PagerComponent } from '../../shared/pager/pager.component';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { isImageUrl } from '../../shared/utils/file-type.util';
import { AdminTopUpDetailDialogComponent } from './admin-topup-detail-dialog/admin-topup-detail-dialog.component';

/**
 * Structurally mirrors WithdrawalsListComponent (status filter toggle group, list-page/list-table
 * shell, StatusBadgeComponent, PagerComponent) — the sibling "financial review queue" screen — plus
 * the KYC Review screen's list-page/status-badge/pager shell, since both already share those same
 * primitives. Review actions live in a click-through detail dialog (AdminTopUpDetailDialogComponent)
 * rather than inline row buttons, since a receipt needs real preview space that a table row can't
 * give it — the dialog itself still reuses the MatDialog wrapper already used everywhere else
 * (RejectReasonDialogComponent, the seller catalog modal).
 */
@Component({
  selector: 'app-admin-topup-requests',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatTableModule,
    MatButtonToggleModule,
    MatIconModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    PagerComponent,
    StatusBadgeComponent
  ],
  templateUrl: './admin-topup-requests.component.html',
  styleUrl: './admin-topup-requests.component.scss'
})
export class AdminTopUpRequestsComponent implements OnInit {
  private readonly topUpService = inject(AdminTopUpService);
  private readonly dialog = inject(MatDialog);
  private readonly imagePreview = inject(ImagePreviewService);

  readonly requests = signal<TopUpListItemDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly statusFilter = signal<TopUpStatus | null>('Pending');
  readonly errorMessage = signal<string | null>(null);

  readonly statuses: TopUpStatus[] = ['Pending', 'Approved', 'Rejected'];
  readonly columns = ['seller', 'amount', 'receipt', 'submitted', 'status'];

  ngOnInit(): void {
    this.load();
    this.topUpService.markRead();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.topUpService.list(this.statusFilter(), this.page(), 10).subscribe({
      next: (res) => {
        this.requests.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load top-up requests.');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  setFilter(status: TopUpStatus | null): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  initialOf(name: string): string {
    return name.charAt(0).toUpperCase();
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
    this.imagePreview.open(this.fileUrl(receiptUrl), 'Payment receipt');
  }

  openDetail(request: TopUpListItemDto): void {
    const ref = this.dialog.open(AdminTopUpDetailDialogComponent, {
      width: '560px',
      maxWidth: '92vw',
      maxHeight: '90vh',
      panelClass: 'seller-catalog-dialog-panel',
      data: { request }
    });

    ref.afterClosed().subscribe((updated?: TopUpListItemDto) => {
      if (!updated) {
        return;
      }

      // Reflect the reviewed request immediately; if it no longer matches the active filter
      // (e.g. Pending -> Approved while viewing the Pending tab), drop it from the current view.
      if (this.statusFilter() !== null && updated.status !== this.statusFilter()) {
        this.requests.update((current) => current.filter((r) => r.id !== updated.id));
        this.totalCount.update((count) => Math.max(0, count - 1));
      } else {
        this.requests.update((current) => current.map((r) => (r.id === updated.id ? updated : r)));
      }
    });
  }
}
