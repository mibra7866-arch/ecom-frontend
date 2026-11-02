import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { OrderStatus, SellerOrderDetailDto, SellerOrderListItemDto, SellerOrderStatusCounts } from '../models/order.model';
import { PagedResult } from '../models/paged-result.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SellerOrdersService {
  private readonly api = inject(ApiService);

  counts(): Observable<SellerOrderStatusCounts> {
    return this.api.get<SellerOrderStatusCounts>('seller/orders/counts');
  }

  list(status: OrderStatus | null, page: number, pageSize: number): Observable<PagedResult<SellerOrderListItemDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status) {
      params['status'] = status;
    }
    return this.api.get<PagedResult<SellerOrderListItemDto>>('seller/orders', params);
  }

  get(id: number): Observable<SellerOrderDetailDto> {
    return this.api.get<SellerOrderDetailDto>(`seller/orders/${id}`);
  }

  accept(id: number): Observable<SellerOrderDetailDto> {
    return this.api.post<SellerOrderDetailDto, object>(`seller/orders/${id}/accept`, {});
  }

  // Cancel / mark-on-the-way / out-for-delivery / delivered were removed from here — an admin now
  // changes delivery status from the Admin Orders seller-orders modal (see OrdersService). Sellers can
  // still view every status; they just can't change it anymore, and the backend endpoints these used
  // to call no longer exist either.
}
