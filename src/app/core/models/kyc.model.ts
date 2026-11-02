export type KycStatus = 'AwaitingVerification' | 'Approved' | 'Rejected';

export interface KycSubmissionDto {
  id: number;
  sellerId: number;
  sellerName: string;
  documentUrls: string[];
  status: KycStatus;
  reviewedByAdminId: number | null;
  reviewedAt: string | null;
  createdAt: string;
  rejectionReason: string | null;
  /** The subset of documentUrls an admin added (via KycAdminService.updateDocuments) rather than the
   * seller — anything not in this list was seller-uploaded. */
  adminUploadedDocumentUrls: string[];
}

export interface KycReviewRequest {
  approve: boolean;
  reason: string | null;
}

export interface KycUploadResponse {
  documentUrls: string[];
  status: KycStatus;
}
