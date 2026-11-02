import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AdminSellerActionsService } from '../../core/services/admin-seller-actions.service';
import { ChatService } from '../../core/services/chat.service';
import { SellersService } from '../../core/services/sellers.service';
import { SellerListItemDto, SellerStatus } from '../../core/models/seller.model';

type SellerFilterValue = SellerStatus | 'All' | 'Deleted';
import { ResultsPillComponent } from '../../shared/results-pill/results-pill.component';
import { BalanceUpdatedEvent } from '../../core/models/realtime.model';
import { ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult } from '../../shared/confirmation-modal/confirmation-modal.component';
import {
  FinancialAdjustmentModalComponent,
  FinancialAdjustmentModalData,
  FinancialAdjustmentModalResult
} from '../../shared/financial-adjustment-modal/financial-adjustment-modal.component';
import { PagerComponent } from '../../shared/pager/pager.component';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { AdminResetPasswordDialogComponent, AdminResetPasswordDialogData } from './actions/admin-reset-password-dialog.component';
import { AdminResetTransactionPasswordDialogComponent, AdminResetTransactionPasswordDialogData } from './actions/admin-reset-transaction-password-dialog.component';
import { LoginHistoryDialogComponent } from './actions/login-history-dialog.component';
import { ProductLimitModalComponent, ProductLimitModalData, ProductLimitModalResult } from './actions/product-limit-modal.component';
import { SellerCreditScoreModalComponent, SellerCreditScoreModalData, SellerCreditScoreModalResult } from './actions/seller-credit-score-modal.component';
import { SellerDetailDialogComponent, SellerDetailDialogData } from './actions/seller-detail-dialog.component';
import { SellerRatingModalComponent, SellerRatingModalData, SellerRatingModalResult } from './actions/seller-rating-modal.component';
import { SendNotificationDialogComponent } from './actions/send-notification-dialog.component';
import { SellerNotificationsDialogComponent } from './actions/seller-notifications-dialog.component';
import { VerifiedBadgeComponent } from '../../shared/verified-badge/verified-badge.component';

@Component({
  selector: 'app-sellers-list',
  standalone: true,
  imports: [
    DatePipe,
    CurrencyPipe,
    MatTableModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatMenuModule,
    MatIconModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    PagerComponent,
    StatusBadgeComponent,
    ResultsPillComponent,
    VerifiedBadgeComponent
  ],
  templateUrl: './sellers-list.component.html',
  styleUrl: './sellers-list.component.scss'
})
export class SellersListComponent implements OnInit, OnDestroy {
  private readonly sellersService = inject(SellersService);
  private readonly actionsService = inject(AdminSellerActionsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput$ = new Subject<string>();
  // A single switchMap-driven pipeline for every trigger that reloads the list (search, status
  // filter, showDeleted toggle, page change) — switching to a new request cancels whichever
  // previous one was still in flight instead of leaving it to race the new one. Without this, typing
  // in the search box and then immediately toggling a filter could fire two overlapping requests,
  // and whichever happened to resolve last (not necessarily the latest one) would win — a stale-data
  // bug, and the abandoned request's server-side cancellation is exactly what surfaced as an
  // unhandled TaskCanceledException in AdminSellersController.
  private readonly reload$ = new Subject<void>();
  private readonly onBalanceUpdated = (event: BalanceUpdatedEvent) => {
    this.sellers.update((list) =>
      list.map((s) => (s.id === event.sellerId ? { ...s, balance: event.balance, guaranteeBalance: event.guaranteeBalance } : s))
    );
  };

  readonly sellers = signal<SellerListItemDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly showDeleted = signal(false); 
  readonly search = signal('');
  readonly statusFilter = signal<SellerStatus | null>(null);

  readonly statuses: SellerStatus[] = ['PendingKyc', 'Active', 'Suspended'];
  readonly columns = ['name', 'email', 'storeName', 'password', 'transactionPassword', 'status', 'verified', 'balance', 'createdAt', 'actions'];
  readonly errorMessage = signal<string | null>(null);

  // Active/Deleted and the status filter used to be two separate mat-button-toggle-groups, which put
  // "Active" on screen twice (once as "not deleted", once as the status) and forced the row to wrap on
  // phone widths. One combined toggle group derived from the same two underlying signals reads as a
  // single set of mutually-exclusive filters instead.
  readonly filterValue = computed<SellerFilterValue>(() => (this.showDeleted() ? 'Deleted' : (this.statusFilter() ?? 'All')));

  ngOnInit(): void {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((term) => {
      this.search.set(term);
      this.page.set(1);
      this.load();
    });

    this.reload$
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.errorMessage.set(null);
          return this.sellersService.list(this.page(), 10, this.showDeleted(), this.search(), this.statusFilter());
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (res) => {
          this.sellers.set(res.items);
          this.totalPages.set(res.totalPages);
          this.totalCount.set(res.totalCount);
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Failed to load sellers.');
          this.loading.set(false);
        }
      });

    this.load();
    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('BalanceUpdated', this.onBalanceUpdated);
    });
  }

  ngOnDestroy(): void {
    this.chatService.getConnection().off('BalanceUpdated', this.onBalanceUpdated);
  }

  load(): void {
    this.reload$.next();
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  setFilter(value: SellerFilterValue): void {
    if (value === 'Deleted') {
      this.showDeleted.set(true);
      this.statusFilter.set(null);
    } else {
      this.showDeleted.set(false);
      this.statusFilter.set(value === 'All' ? null : value);
    }
    this.page.set(1);
    this.load();
  }

  statusLabel(status: SellerStatus): string {
    return status.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  private replaceSeller(updated: SellerListItemDto): void {
    this.sellers.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  private removeSeller(id: number): void {
    this.sellers.update((list) => list.filter((s) => s.id !== id));
    this.totalCount.update((count) => Math.max(0, count - 1));
  }

  /** Same clipboard + toast pattern as invitations-list.component.ts's copyCode — reused here for the Email/Password table cells. */
  copyToClipboard(value: string, label: string): void {
    navigator.clipboard.writeText(value);
    this.snackBar.open(`${label} copied.`, undefined, { duration: 2000 });
  }

  // ---------- Account Actions ----------

  /** focusKyc scrolls the dialog straight to its KYC Verification section (Approve/Reject) — used by
   * the Sellers list's "Pending KYC" status badge so clicking it doesn't leave the admin to scroll past
   * Bank Details to find the decision buttons; the "Bank Details & KYC" menu item still opens plain. */
  openSellerDetail(seller: SellerListItemDto, focusKyc = false): void {
    this.dialog.open<SellerDetailDialogComponent, SellerDetailDialogData>(SellerDetailDialogComponent, {
      width: '520px',
      maxWidth: '92vw',
      maxHeight: '90vh',
      panelClass: 'seller-catalog-dialog-panel',
      data: { seller, focusKyc }
    });
  }

  openSendNotification(seller: SellerListItemDto): void {
    this.dialog.open(SendNotificationDialogComponent, {
      width: '480px',
      panelClass: 'seller-catalog-dialog-panel',
      data: { sellerId: seller.id, sellerName: seller.storeName }
    });
  }

  openAllNotifications(seller: SellerListItemDto): void {
    this.dialog.open(SellerNotificationsDialogComponent, {
      width: '560px',
      panelClass: 'seller-catalog-dialog-panel',
      data: { sellerId: seller.id, sellerName: seller.storeName }
    });
  }

  openLoginHistory(seller: SellerListItemDto): void {
    this.dialog.open(LoginHistoryDialogComponent, {
      width: '480px',
      panelClass: 'seller-catalog-dialog-panel',
      data: { sellerId: seller.id, sellerName: seller.storeName }
    });
  }

  // ---------- Security ----------

  openResetPassword(seller: SellerListItemDto): void {
    this.dialog
      .open<AdminResetPasswordDialogComponent, AdminResetPasswordDialogData, boolean>(AdminResetPasswordDialogComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data: { sellerId: seller.id, sellerName: seller.storeName }
      })
      .afterClosed()
      .subscribe((success) => {
        if (success) {
          this.snackBar.open(`Password reset for ${seller.storeName}.`, undefined, { duration: 3000 });
        }
      });
  }

  openResetTransactionPassword(seller: SellerListItemDto): void {
    this.dialog
      .open<AdminResetTransactionPasswordDialogComponent, AdminResetTransactionPasswordDialogData, boolean>(AdminResetTransactionPasswordDialogComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data: { sellerId: seller.id, sellerName: seller.storeName }
      })
      .afterClosed()
      .subscribe((success) => {
        if (success) {
          this.snackBar.open(`Transaction password reset for ${seller.storeName}.`, undefined, { duration: 3000 });
        }
      });
  }

  // ---------- Financials ----------

  openAdjustBalance(seller: SellerListItemDto): void {
    const data: FinancialAdjustmentModalData = { title: 'Adjust Balance', fieldLabel: 'Shop Balance', currentValue: seller.balance };
    this.dialog
      .open<FinancialAdjustmentModalComponent, FinancialAdjustmentModalData, FinancialAdjustmentModalResult>(FinancialAdjustmentModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.actionsService.adjustBalance(seller.id, { amount: result.amount, reason: result.reason, field: 'Balance' }).subscribe({
          next: (updated) => this.replaceSeller(updated),
          error: (err) => this.errorMessage.set(this.extractErrorMessage(err, 'Failed to adjust balance.'))
        });
      });
  }

  openRating(seller: SellerListItemDto): void {
    const data: SellerRatingModalData = { storeName: seller.storeName, currentRating: seller.rating };
    this.dialog
      .open<SellerRatingModalComponent, SellerRatingModalData, SellerRatingModalResult>(SellerRatingModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.sellersService.updateRating(seller.id, result.rating, result.reason).subscribe({
          next: (updated) => this.replaceSeller(updated),
          error: (err) => this.errorMessage.set(this.extractErrorMessage(err, 'Failed to update rating.'))
        });
      });
  }

  openCreditScore(seller: SellerListItemDto): void {
    const data: SellerCreditScoreModalData = { storeName: seller.storeName, currentScore: seller.creditScore };
    this.dialog
      .open<SellerCreditScoreModalComponent, SellerCreditScoreModalData, SellerCreditScoreModalResult>(SellerCreditScoreModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.sellersService.updateCreditScore(seller.id, result.creditScore, result.reason).subscribe({
          next: (updated) => this.replaceSeller(updated),
          error: (err) => this.errorMessage.set(this.extractErrorMessage(err, 'Failed to update credit score.'))
        });
      });
  }

  // ---------- Shop Settings ----------

  openProductLimit(seller: SellerListItemDto): void {
    const data: ProductLimitModalData = { storeName: seller.storeName, currentLimit: seller.productLimit };
    this.dialog
      .open<ProductLimitModalComponent, ProductLimitModalData, ProductLimitModalResult>(ProductLimitModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.actionsService.productLimit(seller.id, { limit: result.newLimit }).subscribe({
          next: (updated) => this.replaceSeller(updated),
          error: (err) => this.errorMessage.set(this.extractErrorMessage(err, 'Failed to update product limit.'))
        });
      });
  }

  // ---------- Risk Controls ----------

  private confirm(data: ConfirmationModalData) {
    return this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '460px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed();
  }

  suspendAccount(seller: SellerListItemDto): void {
    this.confirm({
      title: 'Suspend Account',
      message: `Are you sure you want to suspend this account? ${seller.storeName} will no longer be able to sign in until reactivated.`,
      variant: 'amber',
      confirmLabel: 'Suspend',
      icon: 'block',
      requireReason: true,
      reasonLabel: 'Reason for suspension'
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.actionsService.suspend(seller.id, { reason: result.reason }).subscribe({
        next: (updated) => this.replaceSeller(updated),
        error: () => this.errorMessage.set('Failed to suspend account.')
      });
    });
  }

  unsuspendAccount(seller: SellerListItemDto): void {
    this.confirm({
      title: 'Unsuspend Account',
      message: `${seller.storeName} will be able to sign in again immediately.`,
      variant: 'amber',
      confirmLabel: 'Unsuspend',
      icon: 'check_circle'
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.actionsService.unsuspend(seller.id).subscribe({
        next: (updated) => this.replaceSeller(updated),
        error: () => this.errorMessage.set('Failed to unsuspend account.')
      });
    });
  }

  blockWithdrawals(seller: SellerListItemDto): void {
    this.confirm({
      title: 'Block Withdrawals',
      message: `Are you sure you want to block withdrawals for this seller? ${seller.storeName} will no longer be able to request withdrawals.`,
      variant: 'amber',
      confirmLabel: 'Block',
      icon: 'block',
      requireReason: true,
      reasonLabel: 'Reason for blocking withdrawals'
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.actionsService.blockWithdrawals(seller.id, { reason: result.reason }).subscribe({
        next: (updated) => this.replaceSeller(updated),
        error: () => this.errorMessage.set('Failed to block withdrawals.')
      });
    });
  }

  unblockWithdrawals(seller: SellerListItemDto): void {
    this.confirm({
      title: 'Unblock Withdrawals',
      message: `${seller.storeName} will be able to request withdrawals again.`,
      variant: 'amber',
      confirmLabel: 'Unblock',
      icon: 'check_circle'
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.actionsService.unblockWithdrawals(seller.id).subscribe({
        next: (updated) => this.replaceSeller(updated),
        error: () => this.errorMessage.set('Failed to unblock withdrawals.')
      });
    });
  }

  deleteStore(seller: SellerListItemDto): void {
    this.confirm({
      title: 'Delete Store',
      message: `Are you sure you want to delete this store? The store will be soft-deleted and can be restored later. ${seller.storeName}'s account, orders, and product history are retained but their login is blocked immediately.`,
      variant: 'red',
      confirmLabel: 'Delete Store',
      icon: 'delete_forever',
      requireReason: true,
      reasonLabel: 'Reason for deletion',
      typeToConfirmValue: seller.storeName
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.actionsService.deleteStore(seller.id, { reason: result.reason }).subscribe({
        next: () => this.removeSeller(seller.id),
        error: () => this.errorMessage.set('Failed to delete store.')
      });
    });
  }

  restoreStore(seller: SellerListItemDto): void {
    this.confirm({
      title: 'Restore Store',
      message: 'Are you sure you want to restore this store?',
      variant: 'amber',
      confirmLabel: 'Restore',
      icon: 'restore'
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.actionsService.restoreStore(seller.id).subscribe({
        next: () => this.removeSeller(seller.id),
        error: () => this.errorMessage.set('Failed to restore store.')
      });
    });
  }

  /** Surfaces the real backend message (e.g. adjust-balance's "would take the balance below zero" check) instead of a hardcoded generic string — same pattern already used elsewhere in the app. */
  private extractErrorMessage(err: { error?: { error?: string; title?: string; errors?: Record<string, string[]> } }, fallback: string): string {
    if (err.error?.error) {
      return err.error.error;
    }
    if (err.error?.errors) {
      const firstError = Object.values(err.error.errors)[0]?.[0];
      if (firstError) {
        return firstError;
      }
    }
    if (err.error?.title) {
      return err.error.title;
    }
    return fallback;
  }
}
