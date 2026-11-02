export type BalanceAdjustmentField = 'Balance' | 'Guarantee' | 'Salary';

export interface SendNotificationRequest {
  title: string;
  body: string;
  linkUrl: string | null;
}

export interface AdjustBalanceRequest {
  amount: number;
  reason: string;
  field: BalanceAdjustmentField;
}

export interface ReasonRequest {
  reason: string;
}

/** Sets the seller's absolute product-limit override — null-safe on the backend (Seller.ProductSlotOverride) so it always wins over the store-wide default once set. */
export interface ProductLimitUpdateRequest {
  limit: number;
}

export interface DeleteStoreRequest {
  reason: string;
}

export interface LoginHistoryItemDto {
  id: number;
  loginAtUtc: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
}

/** Same four fields collected at signup (Bank Account Details step) — the one payout-destination record for a seller, read/written identically by the seller's own Profile page and the admin's seller detail view. */
export interface BankDetails {
  accountHolderName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  /** Whether the seller has set a transaction password — the value itself is never returned. */
  hasTransactionPassword: boolean;
}

/** Seller-only — sets or replaces the transaction password. The plain value is only ever sent, never received back. */
export interface SetTransactionPasswordRequest {
  password: string;
  confirmPassword: string;
}

/** Seller's own edit — no reason required. */
export interface BankDetailsUpdateRequest {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  iban: string | null;
}

/** Admin's edit — Reason is required and audit-logged. */
export interface AdminBankDetailsUpdateRequest {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  iban: string | null;
  reason: string;
}

/** The identity fields collected at signup (Seller details + Store details steps) — the seller's own editable profile. isVerified/rating/creditScore are read-only: SellerProfileUpdateRequest below has no fields for them. */
export interface SellerProfile {
  name: string;
  email: string;
  storeName: string;
  isVerified: boolean;
  rating: number | null;
  creditScore: number;
  createdAt: string;
}

export interface SellerProfileUpdateRequest {
  name: string;
  email: string;
  storeName: string;
}

/** Seller's own login-password change — requires the current password, unlike signup which has none to check yet. */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/** Seller's own transaction-password change once one is already set — unlike SetTransactionPasswordRequest (first-time set), this requires the current transaction password. */
export interface ChangeTransactionPasswordRequest {
  oldPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/** Admin-initiated reset of a seller's login password — no "old password" field, since the seller may be locked out and unable to supply it. */
export interface AdminResetPasswordRequest {
  newPassword: string;
  confirmNewPassword: string;
}

/** Admin-initiated reset of a seller's transaction password — same reasoning as AdminResetPasswordRequest. */
export interface AdminResetTransactionPasswordRequest {
  newPassword: string;
  confirmNewPassword: string;
}
