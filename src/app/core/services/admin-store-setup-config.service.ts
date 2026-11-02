import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { StoreSetupConfigDto, StoreSetupConfigUpdateRequest } from '../models/store-setup.model';
import { ApiService } from './api.service';

/** The admin-configurable target for how many catalog products a new store auto-populates to — a single seeded row, edit-only. */
@Injectable({ providedIn: 'root' })
export class AdminStoreSetupConfigService {
  private readonly api = inject(ApiService);

  get(): Observable<StoreSetupConfigDto> {
    return this.api.get<StoreSetupConfigDto>('admin/store-setup-config');
  }

  update(request: StoreSetupConfigUpdateRequest): Observable<StoreSetupConfigDto> {
    return this.api.put<StoreSetupConfigDto, StoreSetupConfigUpdateRequest>('admin/store-setup-config', request);
  }
}
