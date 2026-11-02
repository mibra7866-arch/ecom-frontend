import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { PagedResult } from '../models/paged-result.model';
import { WithdrawalActionRequest, WithdrawalDeclineRequest, WithdrawalListItemDto, WithdrawalStatus } from '../models/withdrawal.model';
import { ApiService } from './api.service';

/** Matches NotificationTemplates.WithdrawalRequested's Type string — the admin-facing "a seller
 * requested a withdrawal" event. */
const WITHDRAWAL_NOTIFICATION_TYPE = 'WithdrawalRequested';

@Injectable({ providedIn: 'root' })
export class WithdrawalsService {
  private readonly api = inject(ApiService);

  /** Backs the "Withdrawals" sidebar badge — unread count of WITHDRAWAL_NOTIFICATION_TYPE
   * notifications, same shared-signal pattern as every other module badge. Distinct from the dashboard's
   * "Pending Withdrawals" stat, which stays a true business-status count unaffected by whether anyone
   * has looked at the module yet. */
  readonly unreadCount = signal(0);

  refreshUnreadCount(): void {
    firstValueFrom(this.api.get<number>('notifications/unread-count', { type: WITHDRAWAL_NOTIFICATION_TYPE }))
      .then((count) => this.unreadCount.set(count))
      .catch(() => {});
  }

  /** Marks every WITHDRAWAL_NOTIFICATION_TYPE notification read — called once the Withdrawals list has
   * loaded so opening the module is what clears the badge, independent of whether any request gets
   * reviewed in this visit. */
  markRead(): void {
    if (this.unreadCount() === 0) {
      return;
    }
    this.unreadCount.set(0);
    firstValueFrom(this.api.post('notifications/mark-all-read', {}, { type: WITHDRAWAL_NOTIFICATION_TYPE })).catch(() => {});
  }

  list(status: WithdrawalStatus | null, page: number, pageSize: number): Observable<PagedResult<WithdrawalListItemDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status) {
      params['status'] = status;
    }
    return this.api.get<PagedResult<WithdrawalListItemDto>>('admin/withdrawals', params);
  }

  /** Multipart, not JSON — the only review action that can carry an optional payment-receipt file. */
  accept(id: number, comment: string | null, receipt: File | null): Observable<WithdrawalListItemDto> {
    const formData = new FormData();
    if (comment) {
      formData.append('comment', comment);
    }
    if (receipt) {
      formData.append('receipt', receipt);
    }
    return this.api.postFormData<WithdrawalListItemDto>(`admin/withdrawals/${id}/accept`, formData);
  }

  decline(id: number, comment: string): Observable<WithdrawalListItemDto> {
    const body: WithdrawalDeclineRequest = { comment };
    return this.api.post<WithdrawalListItemDto, WithdrawalDeclineRequest>(`admin/withdrawals/${id}/decline`, body);
  }

  setPending(id: number, comment: string | null): Observable<WithdrawalListItemDto> {
    const body: WithdrawalActionRequest = { comment };
    return this.api.post<WithdrawalListItemDto, WithdrawalActionRequest>(`admin/withdrawals/${id}/set-pending`, body);
  }
}
