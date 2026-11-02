import { OrderStatus } from '../../core/models/order.model';

/**
 * Merges a live "OrderUpdated" push into an already-loaded, possibly status-filtered order list —
 * shared by the admin and seller Orders list pages so both stay in sync without a refresh whenever
 * the OTHER portal (or a background job) changes an order's status. Deliberately never inserts a row
 * that wasn't already visible: a brand-new/now-matching order could belong anywhere in the current
 * page's sort order or a different page entirely, and guessing would risk showing a duplicate or an
 * out-of-order row — the next natural list reload (pagination, filter change) picks it up correctly.
 *
 * Generic over the DTO shape (only `id`/`status` are read) so it works for both the admin's full
 * OrderListItemDto and the seller's masked SellerOrderListItemDto pushes without duplicating this logic.
 */
export function mergeOrderUpdate<T extends { id: number; status: OrderStatus }>(
  current: T[],
  updated: T,
  statusFilter: OrderStatus | null
): { orders: T[]; countDelta: number } {
  const exists = current.some((o) => o.id === updated.id);
  if (!exists) {
    return { orders: current, countDelta: 0 };
  }

  const stillMatchesFilter = statusFilter === null || updated.status === statusFilter;
  if (!stillMatchesFilter) {
    return { orders: current.filter((o) => o.id !== updated.id), countDelta: -1 };
  }

  return { orders: current.map((o) => (o.id === updated.id ? updated : o)), countDelta: 0 };
}
