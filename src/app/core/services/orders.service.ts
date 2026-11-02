import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import {
  AdminOrderCreateForSellerRequest,
  CreateForSellerResult,
  OrderAssignRequest,
  OrderCreateRequest,
  OrderListItemDto,
  OrderStatus,
  SellerOrderFinancialSummary,
  SellerOrderStatusCounts
} from '../models/order.model';
import { PagedResult } from '../models/paged-result.model';
import { SellerProductListItem } from '../models/seller-product.model';
import { ApiService } from './api.service';

/** Matches NotificationTemplates.OrderCompletedAdmin's Type string server-side — the "Seller Order
 * Completed" event that backs the Orders sidebar badge below. */
const ORDER_COMPLETED_TYPE = 'OrderCompletedAdmin';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly api = inject(ApiService);

  /** Backs the "Orders" sidebar badge — unread count of OrderCompletedAdmin notifications, cleared via
   * markCompletedRead() when the admin opens the Orders list, same shared-signal pattern as every other
   * module badge (KYC/Withdrawals/Top-Up). */
  readonly completedUnreadCount = signal(0);

  refreshCompletedUnreadCount(): void {
    firstValueFrom(this.api.get<number>('notifications/unread-count', { type: ORDER_COMPLETED_TYPE }))
      .then((count) => this.completedUnreadCount.set(count))
      .catch(() => {});
  }

  /** Marks every OrderCompletedAdmin notification read (admin-wide, since these broadcast to all
   * admins the same way the notification bell's IsRead already does) — called once the Orders list has
   * loaded so the badge reflects what the admin has actually seen. */
  markCompletedRead(): void {
    if (this.completedUnreadCount() === 0) {
      return;
    }
    this.completedUnreadCount.set(0);
    firstValueFrom(this.api.post('notifications/mark-all-read', {}, { type: ORDER_COMPLETED_TYPE })).catch(() => {});
  }

  list(status: OrderStatus | null, page: number, pageSize: number): Observable<PagedResult<OrderListItemDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status) {
      params['status'] = status;
    }
    return this.api.get<PagedResult<OrderListItemDto>>('admin/orders', params);
  }

  create(request: OrderCreateRequest): Observable<OrderListItemDto> {
    return this.api.post<OrderListItemDto, OrderCreateRequest>('admin/orders', request);
  }

  assign(orderId: number, request: OrderAssignRequest): Observable<OrderListItemDto> {
    return this.api.post<OrderListItemDto, OrderAssignRequest>(`admin/orders/${orderId}/assign`, request);
  }

  /** A specific seller's own product list (what they've added to their shop, whether via Quick Add
   * Random or individually) — step 2 of the Create Order for Seller flow. */
  sellerProducts(sellerId: number): Observable<SellerProductListItem[]> {
    return this.api.get<SellerProductListItem[]>(`admin/orders/sellers/${sellerId}/products`);
  }

  /** Creates one order per selected product, all assigned to the same seller with the same shared
   * address — never throws on a partial failure (a product outside the seller's stage range, etc.); the
   * response always separates what was created from what wasn't (and why). */
  createForSeller(request: AdminOrderCreateForSellerRequest): Observable<CreateForSellerResult> {
    return this.api.post<CreateForSellerResult, AdminOrderCreateForSellerRequest>('admin/orders/create-for-seller', request);
  }

  /** One batched request for a page of sellers' All/Unpaid/Paid/Delivered order counts, rather than
   * one request per row — backs the Registered Sellers grid's status columns. */
  sellerStatusCounts(sellerIds: number[]): Observable<Record<number, SellerOrderStatusCounts>> {
    return this.api.post<Record<number, SellerOrderStatusCounts>, { sellerIds: number[] }>('admin/orders/seller-status-counts', { sellerIds });
  }

  /** Backs the seller-orders modal opened from a Registered Sellers row — that seller's own orders,
   * paged and optionally filtered by status. */
  sellerOrders(sellerId: number, status: OrderStatus | null, page: number, pageSize: number): Observable<PagedResult<OrderListItemDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status) {
      params['status'] = status;
    }
    return this.api.get<PagedResult<OrderListItemDto>>(`admin/orders/sellers/${sellerId}/orders`, params);
  }

  /** The order-details modal's dropdown+Save — sets an order directly to any of the 7 post-assignment
   * statuses in one step, admin-only (sellers can view but no longer change status; see
   * SellerOrdersService, which has no status-changing methods at all). */
  setStatus(orderId: number, status: OrderStatus): Observable<OrderListItemDto> {
    return this.api.post<OrderListItemDto, { status: OrderStatus }>(`admin/orders/${orderId}/status`, { status });
  }

  /** Total Orders / Total Orders Amount / Total Profit for one seller — backs the seller-orders modal's
   * header stats. */
  sellerFinancialSummary(sellerId: number): Observable<SellerOrderFinancialSummary> {
    return this.api.get<SellerOrderFinancialSummary>(`admin/orders/sellers/${sellerId}/financial-summary`);
  }
}
