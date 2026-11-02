import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult } from '../models/paged-result.model';
import {
  SellerCreditScoreUpdateRequest,
  SellerListItemDto,
  SellerRatingUpdateRequest,
  SellerStatus,
  SellerStatusUpdateRequest
} from '../models/seller.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SellersService {
  private readonly api = inject(ApiService);

  list(page: number, pageSize: number, includeDeleted = false, search = '', status: SellerStatus | null = null): Observable<PagedResult<SellerListItemDto>> {
    const params: Record<string, string | number | boolean> = { page, pageSize, includeDeleted };
    if (search.trim()) {
      params['search'] = search.trim();
    }
    if (status) {
      params['status'] = status;
    }
    return this.api.get<PagedResult<SellerListItemDto>>('admin/sellers', params);
  }

  updateStatus(id: number, status: SellerStatus): Observable<SellerListItemDto> {
    const body: SellerStatusUpdateRequest = { status };
    return this.api.patch<SellerListItemDto, SellerStatusUpdateRequest>(`admin/sellers/${id}/status`, body);
  }

  /** The "Shop Rating" seller action — a manual admin override, not a computed average. */
  updateRating(id: number, rating: number, reason: string): Observable<SellerListItemDto> {
    const body: SellerRatingUpdateRequest = { rating, reason };
    return this.api.patch<SellerListItemDto, SellerRatingUpdateRequest>(`admin/sellers/${id}/rating`, body);
  }

  /** Admin-only override — gates the seller's withdrawal eligibility below 90 (enforced server-side). */
  updateCreditScore(id: number, creditScore: number, reason: string): Observable<SellerListItemDto> {
    const body: SellerCreditScoreUpdateRequest = { creditScore, reason };
    return this.api.patch<SellerListItemDto, SellerCreditScoreUpdateRequest>(`admin/sellers/${id}/credit-score`, body);
  }
}
