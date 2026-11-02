export type OrderStatus = 'Pending' | 'Assigned' | 'Accepted' | 'Completed' | 'OnTheWay' | 'OutForDelivery' | 'Delivered' | 'Cancelled';

export interface OrderListItemDto {
  id: number;
  productId: number;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  amount: number;
  cost: number;
  profit: number;
  status: OrderStatus;
  sellerId: number | null;
  sellerName: string | null;
  stageNumber: number | null;
  assignedAtUtc: string | null;
  acceptedAtUtc: string | null;
  expiresAtUtc: string | null;
  completedAtUtc: string | null;
  onTheWayAtUtc: string | null;
  outForDeliveryAtUtc: string | null;
  deliveredAtUtc: string | null;
  cancelledAtUtc: string | null;
  createdAt: string;
  /** Only ever populated for orders created via Create Order for Seller — null for the older whole-catalog Create/Assign flow. Full, unmasked — admin-only. */
  customerName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  zipCode: string | null;
  phone: string | null;
}

/** ServerNowUtc lets the countdown view compute clock drift once (offset = local Date.now() - ServerNowUtc) instead of trusting the browser's own clock. */
export interface OrderDetailDto {
  order: OrderListItemDto;
  serverNowUtc: string;
}

export interface OrderCreateRequest {
  productId: number;
}

export interface OrderAssignRequest {
  sellerId: number;
}

export interface AdminOrderCreateForSellerRequest {
  sellerId: number;
  productIds: number[];
  customerName: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  zipCode: string;
  phone: string;
}

export interface CreateForSellerFailure {
  productId: number;
  reason: string;
}

export interface CreateForSellerResult {
  created: OrderListItemDto[];
  failed: CreateForSellerFailure[];
}

/** Total Orders / Total Orders Amount / Total Profit for one seller — a live sum over every
 * non-Cancelled order currently assigned to them, not a stored running total. Same shape backs both
 * the admin per-seller endpoint and the seller's own dashboard. */
export interface SellerOrderFinancialSummary {
  totalOrders: number;
  totalOrdersAmount: number;
  totalProfit: number;
}

/**
 * The seller-facing order shape — every address/customer field is already masked (first/last
 * character visible) by the backend before this ever reaches the browser. Never attempt to
 * "unmask" or otherwise derive the real value from this DTO; it isn't present anywhere in it.
 */
export interface SellerOrderListItemDto {
  id: number;
  productId: number;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  amount: number;
  profit: number;
  status: OrderStatus;
  stageNumber: number | null;
  assignedAtUtc: string | null;
  acceptedAtUtc: string | null;
  expiresAtUtc: string | null;
  completedAtUtc: string | null;
  onTheWayAtUtc: string | null;
  outForDeliveryAtUtc: string | null;
  deliveredAtUtc: string | null;
  cancelledAtUtc: string | null;
  createdAt: string;
  maskedCustomerName: string | null;
  maskedAddressLine1: string | null;
  maskedAddressLine2: string | null;
  maskedCity: string | null;
  maskedZipCode: string | null;
  maskedPhone: string | null;
  isPaid: boolean;
}

export interface SellerOrderDetailDto {
  order: SellerOrderListItemDto;
  serverNowUtc: string;
}

/** Backs the seller Orders list's filter-tab counts (Unpaid=Assigned, Paid=Accepted, Pickup=Completed,
 * plus OnTheWay/OutForDelivery/Delivered/Cancelled mapping 1:1 to their own status) and, reused as-is,
 * the Admin Orders page's per-seller grid — same numbers there too, just displayed under the label
 * "Completed" instead of "Pickup". */
export interface SellerOrderStatusCounts {
  total: number;
  unpaid: number;
  paid: number;
  pickup: number;
  onTheWay: number;
  outForDelivery: number;
  delivered: number;
  cancelled: number;
}
