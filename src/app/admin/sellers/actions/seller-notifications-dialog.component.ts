import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminSellerActionsService } from '../../../core/services/admin-seller-actions.service';
import { AppNotification } from '../../../core/models/notification.model';
import { PagerComponent } from '../../../shared/pager/pager.component';
import { ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult } from '../../../shared/confirmation-modal/confirmation-modal.component';
import { notificationIcon } from '../../../shared/utils/notification-icon.util';

export interface SellerNotificationsDialogData {
  sellerId: number;
  sellerName: string;
}

const PAGE_SIZE = 15;

/**
 * Admin -> Sellers -> seller's 3-dot menu -> All Notifications. Reuses the exact same
 * INotificationRepository-backed pipeline the seller's own notification bell already reads from (see
 * AdminSellerActionsController.Notifications) — this is a read/manage view onto that same data, not a
 * separate notification system. Delete (individual and bulk) goes through the one
 * AdminSellerActionsController.DeleteNotifications endpoint; a single in-flight `submitting` flag (not
 * per-row state) is enough to block duplicate/repeated delete clicks since every delete here — one row
 * or many — is a single request followed by a full list reconciliation.
 */
@Component({
  selector: 'app-seller-notifications-dialog',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatIconModule, MatProgressSpinnerModule, PagerComponent],
  templateUrl: './seller-notifications-dialog.component.html',
  styleUrl: './action-dialog.scss'
})
export class SellerNotificationsDialogComponent implements OnInit {
  private readonly actionsService = inject(AdminSellerActionsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  readonly dialogRef = inject(MatDialogRef<SellerNotificationsDialogComponent>);
  readonly data = inject<SellerNotificationsDialogData>(MAT_DIALOG_DATA);

  readonly items = signal<AppNotification[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  /** Blocks every delete trigger (row buttons + Delete Selected) while a delete request is in flight —
   * simple and sufficient here since any delete (one row or many) always ends in a full list reload. */
  readonly submitting = signal(false);
  readonly selectedIds = signal<ReadonlySet<number>>(new Set());

  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly allSelected = computed(() => this.items().length > 0 && this.items().every((n) => this.selectedIds().has(n.id)));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.actionsService.getNotifications(this.data.sellerId, this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
        // Never let a selection from a previous page/load linger once it's no longer visible.
        const visibleIds = new Set(res.items.map((n) => n.id));
        this.selectedIds.update((current) => new Set([...current].filter((id) => visibleIds.has(id))));
      },
      error: () => {
        this.errorMessage.set('Failed to load notifications.');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  iconFor(type: string): string {
    return notificationIcon(type);
  }

  isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelected(id: number): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  toggleSelectAll(): void {
    this.selectedIds.set(this.allSelected() ? new Set() : new Set(this.items().map((n) => n.id)));
  }

  deleteOne(notification: AppNotification): void {
    if (this.submitting()) {
      return;
    }
    this.confirmDelete(1).subscribe((confirmed) => {
      if (confirmed) {
        this.performDelete([notification.id]);
      }
    });
  }

  deleteSelected(): void {
    const ids = [...this.selectedIds()];
    if (ids.length === 0 || this.submitting()) {
      return;
    }
    this.confirmDelete(ids.length).subscribe((confirmed) => {
      if (confirmed) {
        this.performDelete(ids);
      }
    });
  }

  private confirmDelete(count: number) {
    return this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data: {
          title: count === 1 ? 'Delete Notification?' : 'Delete Notifications?',
          message:
            count === 1
              ? 'Are you sure you want to delete this notification? This action cannot be undone.'
              : `Are you sure you want to delete the selected ${count} notifications? This action cannot be undone.`,
          variant: 'red',
          confirmLabel: 'Delete',
          icon: 'delete_forever'
        }
      })
      .afterClosed();
  }

  private performDelete(ids: number[]): void {
    this.submitting.set(true);
    this.actionsService.deleteNotifications(this.data.sellerId, ids).subscribe({
      next: () => {
        this.submitting.set(false);
        this.items.update((current) => current.filter((n) => !ids.includes(n.id)));
        this.totalCount.update((count) => Math.max(0, count - ids.length));
        this.selectedIds.update((current) => new Set([...current].filter((id) => !ids.includes(id))));
        this.snackBar.open(ids.length === 1 ? 'Notification deleted.' : `${ids.length} notifications deleted.`, undefined, { duration: 3000 });
        // The current page can end up empty after deleting everything on it (not page 1) — reload the
        // previous page instead of stranding the admin on a blank one, same pattern used elsewhere.
        if (this.items().length === 0 && this.page() > 1) {
          this.page.update((p) => p - 1);
          this.load();
        }
      },
      error: () => {
        this.submitting.set(false);
        this.snackBar.open('Failed to delete notification(s). Please try again.', undefined, { duration: 4000 });
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
