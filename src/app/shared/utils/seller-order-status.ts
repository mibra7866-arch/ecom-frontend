import { OrderStatus } from '../../core/models/order.model';

/** Seller-facing relabeling of the backend's internal OrderStatus: sellers never see 'Pending' (an
 * order isn't shown to them until it's Assigned). The full post-assignment lifecycle is framed as a
 * delivery journey — Unpaid/Paid/Pickup for the payment side, then On the way/Out for delivery/
 * Delivered for the fulfillment side, with Cancelled for an order declined before it was ever paid for
 * — the same words used by the Orders list's filter tabs, the order card, the orders table, and the
 * order detail header/stepper, so a given order's status always reads identically no matter where it's
 * shown. */
const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  Assigned: 'Unpaid',
  Accepted: 'Paid',
  Completed: 'Pickup',
  OnTheWay: 'On the way',
  OutForDelivery: 'Out for delivery',
  Delivered: 'Delivered',
  Cancelled: 'Cancelled'
};

const STATUS_CLASS: Partial<Record<OrderStatus, string>> = {
  Assigned: 'order-status-pill--unpaid',
  Accepted: 'order-status-pill--paid',
  Completed: 'order-status-pill--pickup',
  OnTheWay: 'order-status-pill--on-the-way',
  OutForDelivery: 'order-status-pill--out-for-delivery',
  Delivered: 'order-status-pill--delivered',
  Cancelled: 'order-status-pill--cancelled'
};

export function sellerOrderStatusLabel(status: OrderStatus): string {
  return STATUS_LABEL[status] ?? status;
}

export function sellerOrderStatusClass(status: OrderStatus): string {
  return STATUS_CLASS[status] ?? '';
}
