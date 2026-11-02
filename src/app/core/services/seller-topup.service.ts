import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminBankAccount, BankAccountType } from '../models/admin-profile.model';
import { PagedResult } from '../models/paged-result.model';
import { TopUpListItemDto } from '../models/topup.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SellerTopUpService {
  private readonly api = inject(ApiService);

  /** The seller's own top-up history — the "Top Up" page's list. */
  list(page: number, pageSize: number): Observable<PagedResult<TopUpListItemDto>> {
    return this.api.get<PagedResult<TopUpListItemDto>>('seller/topup', { page, pageSize });
  }

  /** Read-only — the accounts (Bank or E Vault) an admin has configured in Admin Portal → Profile.
   * Reuses the same AdminBankAccount shape the Admin Profile page already has; this endpoint just
   * returns it without requiring admin auth. Sellers can view/select but never add, edit, or set a
   * default here. */
  listAccounts(type: BankAccountType): Observable<AdminBankAccount[]> {
    return this.api.get<AdminBankAccount[]>('seller/topup/bank-accounts', { type });
  }

  submit(amount: number, receipt: File, note: string): Observable<TopUpListItemDto> {
    const formData = new FormData();
    formData.append('amount', amount.toString());
    formData.append('receipt', receipt);
    if (note.trim()) {
      formData.append('note', note.trim());
    }

    return this.api.postFormData<TopUpListItemDto>('seller/topup', formData);
  }
}
