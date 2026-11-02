export type TopUpStatus = 'Pending' | 'Approved' | 'Rejected';

export interface TopUpListItemDto {
  id: number;
  sellerId: number;
  sellerName: string;
  amount: number;
  receiptUrl: string;
  note: string | null;
  status: TopUpStatus;
  requestedAtUtc: string;
  reviewedAtUtc: string | null;
  rejectionReason: string | null;
}

export interface TopUpRejectRequest {
  reason: string;
}
