import { Component, Inject, WritableSignal, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { environment } from '../../../../environments/environment';
import { OrdersService } from '../../../core/services/orders.service';
import { OrderListItemDto, OrderStatus } from '../../../core/models/order.model';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { SETTABLE_ORDER_STATUSES } from '../../../shared/utils/order-status-tabs';
import { sellerOrderStatusClass, sellerOrderStatusLabel } from '../../../shared/utils/seller-order-status';

export interface OrderDetailDialogData {
  order: OrderListItemDto;
}

/**
 * The "click a specific order" modal opened from SellerOrdersDialogComponent's row list — full order
 * info plus a status dropdown pre-selected to the order's current status. Save calls
 * OrdersService.setStatus (the one admin-only, ownership-scoped endpoint that can set an order directly
 * to any of the 7 post-assignment statuses) and, on success, closes returning the updated order so the
 * seller-orders modal can patch its list and the Registered Sellers grid can refresh its counts — the
 * same live-update chain that already keeps the seller's own Orders view in sync via the OrderUpdated
 * SignalR push the backend broadcasts on every successful change.
 */
@Component({
  selector: 'app-order-detail-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, MatDialogModule, MatIconModule],
  templateUrl: './order-detail-dialog.component.html',
  styleUrl: './order-detail-dialog.component.scss'
})
export class OrderDetailDialogComponent {
  private readonly ordersService = inject(OrdersService);
  private readonly imagePreview = inject(ImagePreviewService);
  private readonly dialogRef = inject(MatDialogRef<OrderDetailDialogComponent, OrderListItemDto | undefined>);

  readonly order: WritableSignal<OrderListItemDto>;
  readonly selectedStatus: WritableSignal<OrderStatus>;
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor(@Inject(MAT_DIALOG_DATA) data: OrderDetailDialogData) {
    this.order = signal(data.order);
    this.selectedStatus = signal(data.order.status);
  }

  /** Cancelled is only offered while the order is still Assigned or Accepted — matching the backend's
   * own restriction (SetStatus rejects Cancelled from Completed onward, since setting an order to
   * Completed already settled it financially by then). Filtering it out here avoids a
   * guaranteed-to-fail Save attempt for a combination the backend will reject anyway. */
  get availableStatuses(): OrderStatus[] {
    const current = this.order().status;
    if (current === 'Assigned' || current === 'Accepted') {
      return SETTABLE_ORDER_STATUSES;
    }
    return SETTABLE_ORDER_STATUSES.filter((s) => s !== 'Cancelled');
  }

  get hasChange(): boolean {
    return this.selectedStatus() !== this.order().status;
  }

  save(): void {
    if (!this.hasChange || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.ordersService.setStatus(this.order().id, this.selectedStatus()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.dialogRef.close(updated);
      },
      error: (err) => {
        // A 409 (someone else already changed it, e.g. a second admin tab) still carries the real
        // current state in its body — reflect it rather than just showing a generic error.
        if (err.status === 409 && err.error?.order) {
          this.order.set(err.error.order);
          this.selectedStatus.set(err.error.order.status);
        }
        this.errorMessage.set(err.error?.error ?? 'Failed to update this order.');
        this.saving.set(false);
      }
    });
  }

  close(): void {
    this.dialogRef.close(undefined);
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(): void {
    const o = this.order();
    if (o.productImageUrl) {
      this.imagePreview.open(this.fileUrl(o.productImageUrl), o.productName);
    }
  }

  statusLabel(status: OrderStatus): string {
    return sellerOrderStatusLabel(status);
  }

  statusClass(status: OrderStatus): string {
    return sellerOrderStatusClass(status);
  }

  shippingAddress(o: OrderListItemDto): string {
    const parts = [o.addressLine1, o.addressLine2, o.city, o.zipCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '—';
  }
}
