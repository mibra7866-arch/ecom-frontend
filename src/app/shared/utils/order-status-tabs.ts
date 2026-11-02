import { OrderStatus, SellerOrderStatusCounts } from '../../core/models/order.model';

/**
 * The single definition of the Orders filter-pill row — All/Unpaid/Paid/Pickup/On the way/Out for
 * delivery/Delivered/Cancelled — shared by the seller Orders list and the admin seller-orders modal so
 * both always filter by, count, and label the exact same set of statuses. Originally only defined on
 * the seller list; extracted here rather than letting the admin modal define its own subset, per the
 * "use the existing statuses/filters from Seller → Orders, don't duplicate" requirement.
 */
export interface OrderTab {
  key: 'all' | 'unpaid' | 'paid' | 'pickup' | 'onTheWay' | 'outForDelivery' | 'delivered' | 'cancelled';
  label: string;
  status: OrderStatus | null;
  dotClass: string;
  count: (counts: SellerOrderStatusCounts) => number;
}

export const ORDER_STATUS_TABS: OrderTab[] = [
  { key: 'all', label: 'All', status: null, dotClass: 'orders-tabs__dot--all', count: (c) => c.total },
  { key: 'unpaid', label: 'Unpaid', status: 'Assigned', dotClass: 'orders-tabs__dot--unpaid', count: (c) => c.unpaid },
  { key: 'paid', label: 'Paid', status: 'Accepted', dotClass: 'orders-tabs__dot--paid', count: (c) => c.paid },
  { key: 'pickup', label: 'Pickup', status: 'Completed', dotClass: 'orders-tabs__dot--pickup', count: (c) => c.pickup },
  { key: 'onTheWay', label: 'On the way', status: 'OnTheWay', dotClass: 'orders-tabs__dot--on-the-way', count: (c) => c.onTheWay },
  { key: 'outForDelivery', label: 'Out for delivery', status: 'OutForDelivery', dotClass: 'orders-tabs__dot--out-for-delivery', count: (c) => c.outForDelivery },
  { key: 'delivered', label: 'Delivered', status: 'Delivered', dotClass: 'orders-tabs__dot--delivered', count: (c) => c.delivered },
  { key: 'cancelled', label: 'Cancelled', status: 'Cancelled', dotClass: 'orders-tabs__dot--cancelled', count: (c) => c.cancelled }
];

/** The statuses an admin can set an order to from the order-details modal's dropdown — the same 7
 * post-assignment statuses the tabs above filter by (every OrderTab except 'all', which isn't a real
 * status). Pending is never selectable: an order in a seller's list is always past that point already. */
export const SETTABLE_ORDER_STATUSES: OrderStatus[] = ORDER_STATUS_TABS.map((t) => t.status).filter((s): s is OrderStatus => s !== null);
