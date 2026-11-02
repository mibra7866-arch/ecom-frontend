import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment } from '../../../environments/environment';
import { AppNotification } from '../../core/models/notification.model';
import { ChatService } from '../../core/services/chat.service';
import { SellerBalanceService } from '../../core/services/seller-balance.service';
import { SellerWithdrawService } from '../../core/services/seller-withdraw.service';
import { WithdrawalListItemDto } from '../../core/models/withdrawal.model';
import { ImagePreviewService } from '../../shared/image-preview/image-preview.service';
import { PagerComponent } from '../../shared/pager/pager.component';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { isImageUrl } from '../../shared/utils/file-type.util';
import { WithdrawModalComponent } from './withdraw-modal/withdraw-modal.component';

const PAGE_SIZE = 10;

// A review that doesn't change Balance (e.g. Pending -> Rejected) has no BalanceUpdated push to key
// off of — these are the notification types AdminWithdrawalsController.Review already fires
// regardless of whether balanceChanged, so listening for them here covers exactly the gap.
const WITHDRAWAL_NOTIFICATION_TYPES = new Set(['WithdrawalPaid', 'WithdrawalRejected', 'WithdrawalSetPending']);

/** The "Withdraw" sidebar page — new (no seller-facing withdraw page/modal existed before this). */
@Component({
  selector: 'app-seller-withdraw-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatIconModule, MatProgressSpinnerModule, PagerComponent, StatusBadgeComponent],
  templateUrl: './seller-withdraw-list.component.html',
  styleUrl: './seller-withdraw-list.component.scss'
})
export class SellerWithdrawListComponent implements OnInit {
  private readonly withdrawService = inject(SellerWithdrawService);
  private readonly balanceService = inject(SellerBalanceService);
  private readonly dialog = inject(MatDialog);
  private readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imagePreview = inject(ImagePreviewService);

  readonly requests = signal<WithdrawalListItemDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  // Reused directly from the shell's already-live balance signal (kept current all session via the
  // BalanceUpdated SignalR push — see SellerBalanceService) instead of this page firing its own
  // redundant GET seller/dashboard/summary just to read one field off a much larger response.
  readonly availableBalance = this.balanceService.balance;
  readonly creditScore = this.balanceService.creditScore;
  readonly creditScoreTooLow = () => {
    const score = this.creditScore();
    return score !== null && score < 90;
  };
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  private readonly onWithdrawalNotification = (notification: AppNotification) => {
    if (WITHDRAWAL_NOTIFICATION_TYPES.has(notification.type)) {
      this.load(false);
    }
  };

  ngOnInit(): void {
    this.load();
    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('ReceiveNotification', this.onWithdrawalNotification);
    });
    this.destroyRef.onDestroy(() => {
      this.chatService.getConnection().off('ReceiveNotification', this.onWithdrawalNotification);
    });
  }

  /** `showSpinner` is false for the live-refresh path (a background re-fetch shouldn't blank the page
   * the seller is already looking at) and true for every explicit user-driven call (initial load,
   * page change, post-submit reload). */
  load(showSpinner = true): void {
    if (showSpinner) {
      this.loading.set(true);
    }
    this.errorMessage.set(null);
    this.withdrawService.list(this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        // Guards against a stale/invalid current page (e.g. the dataset shrank between requests) —
        // land on the last real page instead of showing an empty list with a "Page N of M" that no
        // longer makes sense.
        if (res.totalPages > 0 && this.page() > res.totalPages) {
          this.page.set(res.totalPages);
          this.load(showSpinner);
          return;
        }
        this.requests.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        if (showSpinner) {
          this.errorMessage.set('Failed to load your withdrawal requests.');
        }
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  /** Same env-relative URL resolution as the admin Withdrawals list's receipt link. */
  fileUrl(receiptUrl: string): string {
    return `${environment.filesBaseUrl}${receiptUrl}`;
  }

  isImageReceipt(receiptUrl: string): boolean {
    return isImageUrl(receiptUrl);
  }

  openReceiptImage(event: Event, receiptUrl: string): void {
    event.stopPropagation();
    this.imagePreview.open(this.fileUrl(receiptUrl), 'Payout proof');
  }

  openWithdrawModal(): void {
    this.dialog
      .open(WithdrawModalComponent, {
        width: '480px',
        maxWidth: '92vw',
        panelClass: 'seller-catalog-dialog-panel',
        data: { availableBalance: this.availableBalance(), creditScore: this.creditScore() ?? 100 }
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
