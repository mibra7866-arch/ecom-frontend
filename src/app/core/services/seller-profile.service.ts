import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChangePasswordRequest, SellerProfile, SellerProfileUpdateRequest } from '../models/seller-action.model';
import { ApiService } from './api.service';

/** The seller's own view/edit of their identity fields — same record every admin-facing seller row reads from. */
@Injectable({ providedIn: 'root' })
export class SellerProfileService {
  private readonly api = inject(ApiService);

  get(): Observable<SellerProfile> {
    return this.api.get<SellerProfile>('seller/profile');
  }

  update(request: SellerProfileUpdateRequest): Observable<SellerProfile> {
    return this.api.put<SellerProfile, SellerProfileUpdateRequest>('seller/profile', request);
  }

  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.api.put<void, ChangePasswordRequest>('seller/profile/password', request);
  }
}
