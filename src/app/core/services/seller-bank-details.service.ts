import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BankDetails, BankDetailsUpdateRequest, ChangeTransactionPasswordRequest, SetTransactionPasswordRequest } from '../models/seller-action.model';
import { ApiService } from './api.service';

/** The seller's own view/edit of their payout details — same record AdminSellerActionsService's bank-details methods read/write from the admin side. */
@Injectable({ providedIn: 'root' })
export class SellerBankDetailsService {
  private readonly api = inject(ApiService);

  get(): Observable<BankDetails> {
    return this.api.get<BankDetails>('seller/bank-details');
  }

  update(request: BankDetailsUpdateRequest): Observable<BankDetails> {
    return this.api.put<BankDetails, BankDetailsUpdateRequest>('seller/bank-details', request);
  }

  setTransactionPassword(request: SetTransactionPasswordRequest): Observable<BankDetails> {
    return this.api.put<BankDetails, SetTransactionPasswordRequest>('seller/bank-details/transaction-password', request);
  }

  changeTransactionPassword(request: ChangeTransactionPasswordRequest): Observable<BankDetails> {
    return this.api.put<BankDetails, ChangeTransactionPasswordRequest>('seller/bank-details/transaction-password/change', request);
  }
}
