import { OrderListItemDto } from './order.model';
import { TopUpListItemDto } from './topup.model';
import { WithdrawalListItemDto } from './withdrawal.model';

/** The admin's consolidated "Store Monitoring" view of one seller — product setup progress, order-stage progression, and recent activity. */
export interface StoreMonitoringDto {
  productsInStore: number;
  requiredProductCount: number;
  currentStageNumber: number;
  stageMinAmount: number | null;
  stageMaxAmount: number | null;
  completedInCurrentStage: number;
  requiredCompletions: number | null;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  paidOrders: number;
  unpaidOrders: number;
  recentOrders: OrderListItemDto[];
  recentTopUps: TopUpListItemDto[];
  recentWithdrawals: WithdrawalListItemDto[];
}
