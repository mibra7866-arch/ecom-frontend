export interface SellerSalesStatsDto {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  thisMonthRevenue: number;
  thisMonthProfit: number;
  avgOrderValue: number;
  marginPercent: number;
}

export interface SellerCategoryBreakdownDto {
  category: string;
  count: number;
  percentage: number;
}

export interface SellerStageProgressDto {
  currentStageNumber: number;
  minAmount: number | null;
  maxAmount: number | null;
  completedInCurrentStage: number;
  requiredCompletions: number | null;
}

export interface SellerDashboardSummaryDto {
  storeName: string;
  sellerName: string;
  balance: number;
  guaranteeBalance: number;
  rating: number | null;
  isVerified: boolean;
  creditScore: number;
  totalOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  totalProducts: number;
  requiredProductCount: number;
  isBoosted: boolean;
  totalViews: number;
  todayViews: number;
  thisMonthOrders: number;
  unreadNotifications: number;
  salesStats: SellerSalesStatsDto;
  categoryBreakdown: SellerCategoryBreakdownDto[];
  stageProgress: SellerStageProgressDto;
  sellerStatus: 'PendingKyc' | 'Active' | 'Suspended';
  /** Live sum of Amount/Profit across every non-Cancelled order on this seller's books (Assigned
   * onward) — unlike salesStats.totalRevenue/totalProfit above (Completed-only, settled revenue), this
   * includes orders still in progress. Same underlying query as the admin per-seller financial-summary
   * endpoint, so the two portals always agree. */
  totalOrdersAmount: number;
  totalOrdersProfit: number;
}
