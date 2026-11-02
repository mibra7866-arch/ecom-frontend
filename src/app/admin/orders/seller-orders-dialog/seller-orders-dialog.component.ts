import { Component, DestroyRef, Inject, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { environment } from '../../../../environments/environment';
import { ChatService } from '../../../core/services/chat.service';
import { OrdersService } from '../../../core/services/orders.service';
import { OrderListItemDto, OrderStatus, SellerOrderFinancialSummary, SellerOrderStatusCounts } from '../../../core/models/order.model';
import { SellerListItemDto } from '../../../core/models/seller.model';
import { PagerComponent } from '../../../shared/pager/pager.component';
import { VerifiedBadgeComponent } from '../../../shared/verified-badge/verified-badge.component';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { mergeOrderUpdate } from '../../../shared/utils/order-list-sync';
import { sellerOrderStatusClass, sellerOrderStatusLabel } from '../../../shared/utils/seller-order-status';
import { ORDER_STATUS_TABS, OrderTab } from '../../../shared/utils/order-status-tabs';
import { OrderDetailDialogComponent } from '../order-detail-dialog/order-detail-dialog.component';

export interface SellerOrdersDialogData {
  seller: SellerListItemDto;
}

const PAGE_SIZE = 10;
const ZERO_COUNTS: SellerOrderStatusCounts = { total: 0, unpaid: 0, paid: 0, pickup: 0, onTheWay: 0, outForDelivery: 0, delivered: 0, cancelled: 0 };

/**
 * Opened from a click anywhere on a Registered Sellers row (Admin → Orders) — shows that seller's
 * orders with the exact same All/Unpaid/Paid/Pickup/On the way/Out for delivery/Delivered/Cancelled
 * filter-pill row the seller Orders list uses (both `@include` the same `_status-tabs.scss` mixin and
 * both now import the one `ORDER_STATUS_TABS` definition, so there's no second, drifting copy of what
 * the tabs are or what they're labeled). Clicking a specific order opens OrderDetailDialogComponent,
 * which is where the actual status change happens (dropdown + Save) — this list is read+navigate only.
 * `hasChanges` is returned to the caller on close so it knows whether to refresh the seller grid's own
 * status counts.
 */
@Component({
  selector: 'app-seller-orders-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatDialogModule, MatIconModule, MatProgressSpinnerModule, PagerComponent, VerifiedBadgeComponent],
  templateUrl: './seller-orders-dialog.component.html',
  styleUrl: './seller-orders-dialog.component.scss'
})
export class SellerOrdersDialogComponent implements OnInit {
  private readonly ordersService = inject(OrdersService);
  private readonly imagePreview = inject(ImagePreviewService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<SellerOrdersDialogComponent, boolean>);
  private readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);

  readonly seller: SellerListItemDto;

  readonly tabs = ORDER_STATUS_TABS;
  readonly activeTab = signal<OrderTab['key']>('all');
  readonly statusFilter = signal<OrderStatus | null>(null);
  readonly counts = signal<SellerOrderStatusCounts | null>(null);
  readonly financialSummary = signal<SellerOrderFinancialSummary | null>(null);

  readonly orders = signal<OrderListItemDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  private hasChanges = false;

  // Picks up an order status change made from anywhere else (another admin session, or this same
  // seller's order acted on outside this dialog) while it's open — the in-dialog path (openOrder ->
  // applyUpdate) already covers changes made from inside it.
  private readonly onOrderUpdated = (updated: OrderListItemDto) => {
    if (updated.sellerId === this.seller.id) {
      this.applyUpdate(updated);
    }
  };

  constructor(@Inject(MAT_DIALOG_DATA) data: SellerOrdersDialogData) {
    this.seller = data.seller;
  }

  ngOnInit(): void {
    this.load();
    this.loadCounts();
    this.loadFinancialSummary();

    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('OrderUpdated', this.onOrderUpdated);
    });
    this.destroyRef.onDestroy(() => {
      this.chatService.getConnection().off('OrderUpdated', this.onOrderUpdated);
    });
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.ordersService.sellerOrders(this.seller.id, this.statusFilter(), this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        if (res.totalPages > 0 && this.page() > res.totalPages) {
          this.page.set(res.totalPages);
          this.load();
          return;
        }
        this.orders.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set("Failed to load this seller's orders.");
        this.loading.set(false);
      }
    });
  }

  loadCounts(): void {
    this.ordersService.sellerStatusCounts([this.seller.id]).subscribe({
      next: (counts) => this.counts.set(counts[this.seller.id] ?? ZERO_COUNTS),
      error: () => {} // Tab counts fall back to zero; not worth a dialog-level error banner for this.
    });
  }

  loadFinancialSummary(): void {
    this.ordersService.sellerFinancialSummary(this.seller.id).subscribe({
      next: (summary) => this.financialSummary.set(summary),
      error: () => {} // Header stats just stay blank; not worth a dialog-level error banner for this.
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  tabCount(tab: OrderTab): number {
    const c = this.counts();
    return c ? tab.count(c) : 0;
  }

  setFilter(tab: OrderTab): void {
    this.activeTab.set(tab.key);
    this.statusFilter.set(tab.status);
    this.page.set(1);
    this.load();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  openOrder(order: OrderListItemDto): void {
    this.dialog
      .open(OrderDetailDialogComponent, {
        data: { order },
        width: '520px',
        maxWidth: '94vw',
        maxHeight: '90vh'
      })
      .afterClosed()
      .subscribe((updated?: OrderListItemDto) => {
        if (updated) {
          this.applyUpdate(updated);
        }
      });
  }

  private applyUpdate(updated: OrderListItemDto): void {
    this.hasChanges = true;
    const { orders, countDelta } = mergeOrderUpdate(this.orders(), updated, this.statusFilter());
    this.orders.set(orders);
    if (countDelta !== 0) {
      this.totalCount.update((count) => Math.max(0, count + countDelta));
    }
    this.loadCounts();
    this.loadFinancialSummary();

    // A status change can filter the last row off a page that isn't page 1 — reload the previous page
    // instead of stranding the admin on a now-empty one.
    if (orders.length === 0 && this.page() > 1) {
      this.page.update((p) => p - 1);
      this.load();
    }
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(event: Event, order: OrderListItemDto): void {
    event.stopPropagation();
    if (order.productImageUrl) {
      this.imagePreview.open(this.fileUrl(order.productImageUrl), order.productName);
    }
  }

  statusLabel(order: OrderListItemDto): string {
    return sellerOrderStatusLabel(order.status);
  }

  statusClass(order: OrderListItemDto): string {
    return sellerOrderStatusClass(order.status);
  }

  close(): void {
    this.dialogRef.close(this.hasChanges);
  }
}
