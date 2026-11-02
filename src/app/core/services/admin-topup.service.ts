import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { PagedResult } from '../models/paged-result.model';
import { TopUpListItemDto, TopUpRejectRequest, TopUpStatus } from '../models/topup.model';
import { ApiService } from './api.service';

/** Matches NotificationTemplates.TopUpRequested's Type string — the admin-facing "a seller requested a
 * top-up" event. */
const TOPUP_NOTIFICATION_TYPE = 'TopUpRequested';

@Injectable({ providedIn: 'root' })
export class AdminTopUpService {
  private readonly api = inject(ApiService);

  /** Backs the "Top-Up Requests" sidebar badge — unread count of TOPUP_NOTIFICATION_TYPE notifications,
   * a shared signal (like ChatService/NotificationService's unread counts) so the shell and the list
   * screen both read the one instance. Distinct from any true business-status pending count — clears
   * the moment the module is opened, independent of whether any request gets reviewed in this visit. */
  readonly unreadCount = signal(0);

  refreshUnreadCount(): void {
    firstValueFrom(this.api.get<number>('notifications/unread-count', { type: TOPUP_NOTIFICATION_TYPE }))
      .then((count) => this.unreadCount.set(count))
      .catch(() => {});
  }

  markRead(): void {
    if (this.unreadCount() === 0) {
      return;
    }
    this.unreadCount.set(0);
    firstValueFrom(this.api.post('notifications/mark-all-read', {}, { type: TOPUP_NOTIFICATION_TYPE })).catch(() => {});
  }

  list(status: TopUpStatus | null, page: number, pageSize: number): Observable<PagedResult<TopUpListItemDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status) {
      params['status'] = status;
    }
    return this.api.get<PagedResult<TopUpListItemDto>>('admin/topup', params);
  }

  approve(id: number): Observable<TopUpListItemDto> {
    return this.api.post<TopUpListItemDto>(`admin/topup/${id}/approve`, {});
  }

  reject(id: number, reason: string): Observable<TopUpListItemDto> {
    const body: TopUpRejectRequest = { reason };
    return this.api.post<TopUpListItemDto, TopUpRejectRequest>(`admin/topup/${id}/reject`, body);
  }
}
