import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminBankAccount,
  AdminBankAccountRequest,
  AdminChangePasswordRequest,
  AdminChangeTransactionPasswordRequest,
  AdminProfile,
  AdminProfileUpdateRequest,
  AdminSetTransactionPasswordRequest
} from '../models/admin-profile.model';
import { ApiService } from './api.service';

/** The admin's own view/edit of their profile, bank accounts, login password and transaction
 * password — the Admin-portal equivalent of SellerProfileService/SellerBankDetailsService. */
@Injectable({ providedIn: 'root' })
export class AdminProfileService {
  private readonly api = inject(ApiService);

  get(): Observable<AdminProfile> {
    return this.api.get<AdminProfile>('admin/profile');
  }

  update(request: AdminProfileUpdateRequest): Observable<AdminProfile> {
    return this.api.put<AdminProfile, AdminProfileUpdateRequest>('admin/profile', request);
  }

  changePassword(request: AdminChangePasswordRequest): Observable<void> {
    return this.api.put<void, AdminChangePasswordRequest>('admin/profile/password', request);
  }

  setTransactionPassword(request: AdminSetTransactionPasswordRequest): Observable<void> {
    return this.api.put<void, AdminSetTransactionPasswordRequest>('admin/profile/transaction-password', request);
  }

  changeTransactionPassword(request: AdminChangeTransactionPasswordRequest): Observable<void> {
    return this.api.put<void, AdminChangeTransactionPasswordRequest>('admin/profile/transaction-password/change', request);
  }

  listBankAccounts(): Observable<AdminBankAccount[]> {
    return this.api.get<AdminBankAccount[]>('admin/profile/bank-accounts');
  }

  addBankAccount(request: AdminBankAccountRequest): Observable<AdminBankAccount> {
    return this.api.post<AdminBankAccount, AdminBankAccountRequest>('admin/profile/bank-accounts', request);
  }

  updateBankAccount(id: number, request: AdminBankAccountRequest): Observable<AdminBankAccount> {
    return this.api.put<AdminBankAccount, AdminBankAccountRequest>(`admin/profile/bank-accounts/${id}`, request);
  }

  setDefaultBankAccount(id: number): Observable<AdminBankAccount[]> {
    return this.api.put<AdminBankAccount[], undefined>(`admin/profile/bank-accounts/${id}/default`, undefined);
  }
}
