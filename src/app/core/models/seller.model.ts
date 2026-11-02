export type SellerStatus = 'PendingKyc' | 'Active' | 'Suspended';

export interface SellerListItemDto {
  id: number;
  name: string;
  email: string;
  storeName: string;
  status: SellerStatus;
  balance: number;
  guaranteeBalance: number;
  rating: number | null;
  isWithdrawalsBlocked: boolean;
  isBoosted: boolean;
  boostExpiresAtUtc: string | null;
  productLimit: number;
  isDeleted: boolean;
  password: string;
  transactionPassword: string;
  createdAt: string;
  isVerified: boolean;
  creditScore: number;
}

export interface SellerStatusUpdateRequest {
  status: SellerStatus;
}

export interface SellerRatingUpdateRequest {
  rating: number;
  reason: string;
}

export interface SellerCreditScoreUpdateRequest {
  creditScore: number;
  reason: string;
}
