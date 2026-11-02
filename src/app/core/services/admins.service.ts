import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminListItemDto, CreateAdminRequest } from '../models/admin.model';
import { ApiService } from './api.service';

/** SuperAdmin-only account management — see AdminsController. Any non-SuperAdmin call 403s server-side. */
@Injectable({ providedIn: 'root' })
export class AdminsService {
  private readonly api = inject(ApiService);

  list(): Observable<AdminListItemDto[]> {
    return this.api.get<AdminListItemDto[]>('admin/admins');
  }

  create(request: CreateAdminRequest): Observable<AdminListItemDto> {
    return this.api.post<AdminListItemDto, CreateAdminRequest>('admin/admins', request);
  }
}
