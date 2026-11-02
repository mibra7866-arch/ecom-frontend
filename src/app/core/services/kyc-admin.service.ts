import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { KycReviewRequest, KycStatus, KycSubmissionDto } from '../models/kyc.model';
import { PagedResult } from '../models/paged-result.model';
import { ApiService } from './api.service';

/** KycSubmitted (new submission) + KycResubmitted (resubmission after rejection) — the two admin-facing
 * notification types that mean "a seller's KYC is now awaiting your review". Matches
 * NotificationTemplates.KycSubmitted/KycResubmitted server-side. */
const KYC_NOTIFICATION_TYPES = 'KycSubmitted,KycResubmitted';

@Injectable({ providedIn: 'root' })
export class KycAdminService {
  private readonly api = inject(ApiService);

  /** Backs the "KYC Review" sidebar badge — unread count of KYC_NOTIFICATION_TYPES notifications, same
   * shared-signal pattern as every other module badge (Withdrawals/Top-Up/Orders). Distinct from the
   * dashboard's "X sellers awaiting KYC review" banner, which stays a true business-status pending
   * count (admin/kyc/pending-count) unaffected by whether anyone has looked at the module yet. */
  readonly unreadCount = signal(0);

  refreshUnreadCount(): void {
    firstValueFrom(this.api.get<number>('notifications/unread-count', { type: KYC_NOTIFICATION_TYPES }))
      .then((count) => this.unreadCount.set(count))
      .catch(() => {});
  }

  /** Marks every KYC_NOTIFICATION_TYPES notification read — called once the KYC Review list has loaded
   * so opening the module is what clears the badge, independent of whether any submission gets
   * reviewed in this visit. */
  markRead(): void {
    if (this.unreadCount() === 0) {
      return;
    }
    this.unreadCount.set(0);
    firstValueFrom(this.api.post('notifications/mark-all-read', {}, { type: KYC_NOTIFICATION_TYPES })).catch(() => {});
  }

  list(status: KycStatus | null, search: string, page: number, pageSize: number): Observable<PagedResult<KycSubmissionDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status) {
      params['status'] = status;
    }
    if (search.trim()) {
      params['search'] = search.trim();
    }
    return this.api.get<PagedResult<KycSubmissionDto>>('admin/kyc', params);
  }

  review(id: number, request: KycReviewRequest): Observable<KycSubmissionDto> {
    return this.api.patch<KycSubmissionDto, KycReviewRequest>(`admin/kyc/${id}/review`, request);
  }

  /** The full audit trail for one seller — every submission they've ever made, newest first. */
  history(sellerId: number): Observable<KycSubmissionDto[]> {
    return this.api.get<KycSubmissionDto[]>(`admin/kyc/sellers/${sellerId}/history`);
  }

  /** Admin adding documents to a seller's KYC — appends to whatever the seller already has, never
   * changes status by itself; approve/reject still goes through review() above. */
  updateDocuments(sellerId: number, files: File[]): Observable<KycSubmissionDto> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return this.api.postFormData<KycSubmissionDto>(`admin/kyc/sellers/${sellerId}/documents`, formData);
  }

  /** Deletes one KYC document, seller- or admin-uploaded — the backend still verifies the document
   * belongs to this exact seller before deleting anything. */
  deleteDocument(sellerId: number, url: string): Observable<KycSubmissionDto> {
    return this.api.delete<KycSubmissionDto>(`admin/kyc/sellers/${sellerId}/documents`, { url });
  }
}
