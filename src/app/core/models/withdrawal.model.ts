export type WithdrawalStatus = 'Pending' | 'Paid' | 'Rejected';
export type WithdrawalMethod = 'BankTransfer' | 'Wallet';

export interface WithdrawalListItemDto {
  id: number;
  sellerId: number;
  sellerName: string;
  amount: number;
  note: string | null;
  receiptUrl: string | null;
  status: WithdrawalStatus;
  requestedAt: string;
  reviewComment: string | null;
  reviewedAtUtc: string | null;
  method: WithdrawalMethod;
  accountHolderName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIban: string | null;
  walletProvider: string | null;
  walletAccountId: string | null;
}

/** Comment optional — used for Accept and Set-to-Pending. */
export interface WithdrawalActionRequest {
  comment: string | null;
}

/** Comment required — used for Decline. */
export interface WithdrawalDeclineRequest {
  comment: string;
}
