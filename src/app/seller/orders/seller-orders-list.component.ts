import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ChatService } from '../../core/services/chat.service';
import { SellerOrdersService } from '../../core/services/seller-orders.service';
import { SellerOrderListItemDto, OrderStatus, SellerOrderStatusCounts } from '../../core/models/order.model';
import { PagerComponent } from '../../shared/pager/pager.component';
import { mergeOrderUpdate } from '../../shared/utils/order-list-sync';
import { sellerOrderStatusClass, sellerOrderStatusLabel } from '../../shared/utils/seller-order-status';
import { ImagePreviewService } from '../../shared/image-preview/image-preview.service';
import { SellerOrderCardComponent } from './order-card/seller-order-card.component';
import { ORDER_STATUS_TABS, OrderTab } from '../../shared/utils/order-status-tabs';

const TABS = ORDER_STATUS_TABS;

/**
 * Same field set as the admin Orders screen (Order #, Product, Quantity, Amount, Profit, Status,
 * Created), minus the admin-only Seller/Actions columns — kept structurally identical on purpose.
 * Desktop shows a `.list-table` (same global table/card pattern as Admin Sellers etc.); mobile keeps
 * the existing `<app-seller-order-card>` row-card list, wrapped in `.list-cards` so only one of the
 * two is visible at a time, same as every other page using this pattern — see styles.scss. Filter
 * tabs are relabeled Unpaid/Paid/Pickup/On the way/Out for delivery/Delivered/Cancelled rather than
 * showing the raw OrderStatus names — see shared/utils/seller-order-status.ts, the single source of
 * truth for that mapping.
 */
@Component({
  selector: 'app-seller-orders-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatIconModule, MatProgressSpinnerModule, MatTableModule, PagerComponent, SellerOrderCardComponent],
  templateUrl: './seller-orders-list.component.html',
  styleUrl: './seller-orders-list.component.scss'
})
export class SellerOrdersListComponent implements OnInit, OnDestroy {
  private readonly ordersService = inject(SellerOrdersService);
  private readonly router = inject(Router);
  private readonly chatService = inject(ChatService);
  private readonly imagePreview = inject(ImagePreviewService);
  private readonly onOrderUpdated = (updated: SellerOrderListItemDto) => {
    const { orders, countDelta } = mergeOrderUpdate(this.orders(), updated, this.statusFilter());
    this.orders.set(orders);
    if (countDelta !== 0) {
      this.totalCount.update((count) => Math.max(0, count + countDelta));
    }
    // A live status change can filter the last row off a page that isn't page 1 (e.g. the one
    // "Accepted" order on page 2 completes) — reload the previous page instead of stranding the
    // user on a now-empty one.
    if (orders.length === 0 && this.page() > 1) {
      this.page.update((p) => p - 1);
      this.load();
    }
    // A status change (e.g. Assigned -> Accepted) shifts which tab this order counts toward, so the
    // tab badges need a live refresh too, not just the currently-filtered list.
    this.loadCounts();
  };

  readonly orders = signal<SellerOrderListItemDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly statusFilter = signal<OrderStatus | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly tabs = TABS;
  readonly activeTab = signal<OrderTab['key']>('all');
  readonly counts = signal<SellerOrderStatusCounts | null>(null);
  readonly columns = ['image', 'product', 'customer', 'quantity', 'price', 'status', 'date', 'actions'];

  ngOnInit(): void {
    this.load();
    this.loadCounts();
    this.chatService.ensureStarted().then(() => {
      this.chatService.getConnection().on('OrderUpdated', this.onOrderUpdated);
    });
  }

  loadCounts(): void {
    this.ordersService.counts().subscribe({ next: (c) => this.counts.set(c) });
  }

  tabCount(tab: OrderTab): number {
    const c = this.counts();
    return c ? tab.count(c) : 0;
  }

  ngOnDestroy(): void {
    this.chatService.getConnection().off('OrderUpdated', this.onOrderUpdated);
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.ordersService.list(this.statusFilter(), this.page(), 10).subscribe({
      next: (res) => {
        // Guards against a stale/invalid current page (e.g. the dataset shrank between requests) —
        // land on the last real page instead of showing an empty list with a "Page N of M" that no
        // longer makes sense.
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
        this.errorMessage.set('Failed to load your orders.');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  setFilter(tab: OrderTab): void {
    this.activeTab.set(tab.key);
    this.statusFilter.set(tab.status);
    this.page.set(1);
    this.load();
  }

  open(order: SellerOrderListItemDto): void {
    this.router.navigate(['/seller/orders', order.id]);
  }

  fileUrl(imageUrl: string): string {
    return `${environment.filesBaseUrl}${imageUrl}`;
  }

  openImage(event: Event, order: SellerOrderListItemDto): void {
    event.stopPropagation();
    if (order.productImageUrl) {
      this.imagePreview.open(this.fileUrl(order.productImageUrl), order.productName);
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  statusLabel(order: SellerOrderListItemDto): string {
    return sellerOrderStatusLabel(order.status);
  }

  statusClass(order: SellerOrderListItemDto): string {
    return sellerOrderStatusClass(order.status);
  }
}
