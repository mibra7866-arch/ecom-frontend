import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { OrderLimitConfigDto, OrderLimitConfigUpdateRequest } from '../models/order-limit-config.model';
import { ApiService } from './api.service';

/** The admin-configurable per-seller cap on how many orders can be created/assigned to one seller via Create Order for Seller — a single seeded row, edit-only. */
@Injectable({ providedIn: 'root' })
export class AdminOrderLimitConfigService {
  private readonly api = inject(ApiService);

  get(): Observable<OrderLimitConfigDto> {
    return this.api.get<OrderLimitConfigDto>('admin/order-limit-config');
  }

  update(request: OrderLimitConfigUpdateRequest): Observable<OrderLimitConfigDto> {
    return this.api.put<OrderLimitConfigDto, OrderLimitConfigUpdateRequest>('admin/order-limit-config', request);
  }
}
