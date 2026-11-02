import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { SellerWithdrawService } from '../../../core/services/seller-withdraw.service';
import { WithdrawalMethod } from '../../../core/models/withdrawal.model';

export interface WithdrawModalData {
  availableBalance: number;
  creditScore: number;
}

/**
 * Amount (required) + Note (optional) only — no receipt/proof upload. That requirement is specific
 * to Top-Up (SellerTopUpModalComponent); a receipt field was briefly added here to mirror it but was
 * wrong for this flow and has been removed. Client-side caps the amount at the seller's available
 * balance for UX; the server re-checks this authoritatively (and the IsWithdrawalsBlocked flag)
 * regardless.
 */
@Component({
  selector: 'app-withdraw-modal',
  standalone: true,
  imports: [CurrencyPipe, MatIconModule],
  templateUrl: './withdraw-modal.component.html',
  styleUrl: './withdraw-modal.component.scss'
})
export class WithdrawModalComponent {
  private readonly withdrawService = inject(SellerWithdrawService);
  private readonly dialogRef = inject(MatDialogRef<WithdrawModalComponent>);
  private readonly router = inject(Router);
  readonly data = inject<WithdrawModalData>(MAT_DIALOG_DATA);

  readonly amount = signal<number | null>(null);
  readonly note = signal('');
  readonly transactionPassword = signal('');
  readonly hideTransactionPassword = signal(true);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly transactionPasswordNotSet = signal(false);
  readonly bankDetailsNotSet = signal(false);
  readonly method = signal<WithdrawalMethod>('BankTransfer');
  readonly walletProvider = signal('');
  readonly walletAccountId = signal('');

  readonly creditScoreTooLow = () => this.data.creditScore < 90;

  readonly isValid = () => {
    if (this.creditScoreTooLow()) {
      return false;
    }
    const amount = this.amount();
    if (amount === null || amount <= 0 || amount > this.data.availableBalance || this.transactionPassword().trim().length === 0) {
      return false;
    }
    if (this.method() === 'Wallet') {
      return this.walletProvider().trim().length > 0 && this.walletAccountId().trim().length > 0;
    }
    return true;
  };

  onAmountInput(value: string): void {
    const parsed = Number(value);
    this.amount.set(Number.isFinite(parsed) && value.trim() !== '' ? parsed : null);
  }

  submit(): void {
    const amount = this.amount();
    if (!amount || !this.isValid() || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.transactionPasswordNotSet.set(false);
    this.bankDetailsNotSet.set(false);

    this.withdrawService
      .submit(
        amount,
        this.note(),
        this.transactionPassword(),
        this.method(),
        this.method() === 'Wallet' ? this.walletProvider() : null,
        this.method() === 'Wallet' ? this.walletAccountId() : null
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.submitted.set(true);
        },
        error: (err) => {
          this.submitting.set(false);
          this.transactionPasswordNotSet.set(err.error?.errorCode === 'TRANSACTION_PASSWORD_NOT_SET');
          this.bankDetailsNotSet.set(err.error?.errorCode === 'BANK_DETAILS_NOT_SET');
          this.errorMessage.set(this.extractErrorMessage(err));
        }
      });
  }

  goToBankDetails(): void {
    this.dialogRef.close(false);
    void this.router.navigateByUrl('/seller/home');
  }

  close(): void {
    this.dialogRef.close(this.submitted());
  }

  /**
   * Surfaces the real backend message instead of a hardcoded generic string. Checks this app's own
   * error shape ({ error: string }) first, then falls back to ASP.NET's automatic model-validation
   * shape (ValidationProblemDetails: { title, errors }) so a future request-shape mismatch is
   * debuggable here instead of silently showing "Failed to submit withdrawal request" again.
   */
  private extractErrorMessage(err: { error?: { error?: string; title?: string; errors?: Record<string, string[]> } }): string {
    if (err.error?.error) {
      return err.error.error;
    }
    if (err.error?.errors) {
      const firstError = Object.values(err.error.errors)[0]?.[0];
      if (firstError) {
        return firstError;
      }
    }
    if (err.error?.title) {
      return err.error.title;
    }
    return 'Failed to submit withdrawal request.';
  }
}
