/** Pushed over the shared ChatHub connection as "BalanceUpdated" any time a seller's balance changes. */
export interface BalanceUpdatedEvent {
  sellerId: number;
  balance: number;
  guaranteeBalance: number;
}

/** Pushed over the shared ChatHub connection as "StageUpdated" whenever an order completion advances a seller's order-progression stage. */
export interface StageUpdatedEvent {
  sellerId: number;
  currentStageNumber: number;
  completedInCurrentStage: number;
}

/** Pushed over the shared ChatHub connection as "SellerProfileUpdated" any time IsVerified, Rating, or CreditScore changes (KYC review, admin rating/credit-score edit). */
export interface SellerProfileUpdatedEvent {
  sellerId: number;
  isVerified: boolean;
  rating: number | null;
  creditScore: number;
}
