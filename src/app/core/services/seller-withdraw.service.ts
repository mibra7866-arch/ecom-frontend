import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PagedResult } from '../models/paged-result.model';
import { WithdrawalListItemDto, WithdrawalMethod } from '../models/withdrawal.model';
import { ApiService } from './api.service';

export interface WithdrawSubmitRequest {
  amount: number;
  note: string | null;
  transactionPassword: string;
  method: WithdrawalMethod;
  walletProvider: string | null;
  walletAccountId: string | null;
}

/** No seller-facing withdrawal service existed — only the admin-side WithdrawalsService (list/review). Same ApiService pattern as SellerTopUpService/every other seller service. */
@Injectable({ providedIn: 'root' })
export class SellerWithdrawService {
  private readonly api = inject(ApiService);

  list(page: number, pageSize: number): Observable<PagedResult<WithdrawalListItemDto>> {
    return this.api.get<PagedResult<WithdrawalListItemDto>>('seller/withdraw', { page, pageSize });
  }

  /**
   * JSON, not multipart — amount + optional note + transaction password + method, no receipt field
   * (that's specific to Top-Up). walletProvider/walletAccountId are only required when method is
   * 'Wallet' — BankTransfer destination details are snapshotted server-side from the seller's own
   * profile, never sent from here.
   */
  submit(
    amount: number,
    note: string,
    transactionPassword: string,
    method: WithdrawalMethod,
    walletProvider: string | null,
    walletAccountId: string | null
  ): Observable<WithdrawalListItemDto> {
    const body: WithdrawSubmitRequest = {
      amount,
      note: note.trim() || null,
      transactionPassword,
      method,
      walletProvider: walletProvider?.trim() || null,
      walletAccountId: walletAccountId?.trim() || null
    };
    return this.api.post<WithdrawalListItemDto, WithdrawSubmitRequest>('seller/withdraw', body);
  }
}
