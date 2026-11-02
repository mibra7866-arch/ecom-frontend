/** Type -> icon lookup, not a big if/else — adding a notification type means adding one entry here,
 * never a new template. Shared by every place that renders a notification list (the bell panel, and
 * Admin -> Sellers -> seller's All Notifications) so both agree on the same icon per type. */
const NOTIFICATION_ICONS: Record<string, string> = {
  SellerRegistered: 'person_add',
  KycSubmitted: 'fact_check',
  KycResubmitted: 'fact_check',
  KycApproved: 'verified',
  KycRejected: 'gpp_bad',
  OrderPlaced: 'shopping_cart',
  OrdersPlacedBatch: 'shopping_cart',
  OrderAccepted: 'task_alt',
  OrderAcceptedSeller: 'task_alt',
  VaultDeducted: 'account_balance_wallet',
  VaultRefunded: 'account_balance_wallet',
  OrderStatusUpdatedByAdmin: 'sync_alt',
  OrderCancelledByAdmin: 'cancel',
  ProductAdded: 'inventory_2',
  ProductRemoved: 'remove_shopping_cart',
  LowStock: 'production_quantity_limits',
  OutOfStock: 'report',
  ChatMessage: 'chat',
  WithdrawalRequested: 'payments',
  WithdrawalPaid: 'account_balance_wallet',
  WithdrawalRejected: 'money_off',
  WithdrawalSetPending: 'undo',
  TopUpRequested: 'add_card',
  TopUpApproved: 'add_card',
  TopUpRejected: 'money_off',
  PasswordChangedBySeller: 'lock_reset',
  TransactionPasswordChangedBySeller: 'password',
  PasswordResetByAdmin: 'lock_reset',
  TransactionPasswordResetByAdmin: 'password',
  System: 'campaign'
};
const DEFAULT_ICON = 'notifications';

export function notificationIcon(type: string): string {
  return NOTIFICATION_ICONS[type] ?? DEFAULT_ICON;
}
