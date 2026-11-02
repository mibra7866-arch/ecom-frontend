export interface StageDistributionDto {
  stageNumber: number;
  sellerCount: number;
}

export interface DashboardSummaryDto {
  totalSellerBalance: number;
  totalSellers: number;
  pendingKycSellers: number;
  activeSellers: number;
  pendingDeliveries: number;
  inTransitDeliveries: number;
  completedDeliveries: number;
  pendingWithdrawals: number;
  totalTickets: number;
  unreadTickets: number;
  totalProductsInStores: number;
  pendingRecharges: number;
  stageDistribution: StageDistributionDto[];
}

export interface RevenuePointDto {
  date: string;
  revenue: number;
  orderCount: number;
}
