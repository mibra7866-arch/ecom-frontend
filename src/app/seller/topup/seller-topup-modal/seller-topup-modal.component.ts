import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminBankAccount } from '../../../core/models/admin-profile.model';
import { SellerTopUpService } from '../../../core/services/seller-topup.service';
import { FileUploadComponent } from '../../../shared/file-upload/file-upload.component';

/** Which payment info panel is currently shown — purely a display toggle, same as switching a status
 * filter tab. Neither value is sent with the actual top-up submission (submit() only ever cares about
 * amount/receipt/note, never which account the seller looked at), so switching this never touches the
 * existing submission flow. */
type PaymentMethod = 'Bank' | 'EVault';

/** Wording that differs between the Bank and E Vault panels — same account list/detail markup is reused
 * for both, driven off this table, mirroring ACCOUNT_TYPE_CONFIG in AdminProfileComponent. */
const PAYMENT_METHOD_CONFIG: Record<PaymentMethod, { icon: string; accountNumberLabel: string; emptyTitle: string; emptyMessage: string }> = {
  Bank: {
    icon: 'account_balance',
    accountNumberLabel: 'Account Number',
    emptyTitle: 'No Bank Account Available',
    emptyMessage: 'Bank transfer details are currently unavailable. Please contact support.'
  },
  EVault: {
    icon: 'account_balance_wallet',
    accountNumberLabel: 'Wallet / Mobile Number',
    emptyTitle: 'E Vault Not Available',
    emptyMessage: 'E Vault details are currently unavailable. Please contact support.'
  }
};

/**
 * The seller's Top Up submission form, now preceded by a read-only account selector sourced from
 * Admin Portal → Profile → Bank Accounts / E Vault (SellerTopUpService.listAccounts), one fetch per
 * type, cached and switched via the Bank/E Vault toggle. Sellers can only view/select an account here
 * — add/edit/set-default live exclusively in the Admin Profile page.
 */
@Component({
  selector: 'app-seller-topup-modal',
  standalone: true,
  imports: [MatButtonToggleModule, MatIconModule, FileUploadComponent],
  templateUrl: './seller-topup-modal.component.html',
  styleUrl: './seller-topup-modal.component.scss'
})
export class SellerTopUpModalComponent implements OnInit {
  private readonly topUpService = inject(SellerTopUpService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<SellerTopUpModalComponent>);

  readonly paymentMethod = signal<PaymentMethod>('Bank');
  readonly paymentMethodConfig = computed(() => PAYMENT_METHOD_CONFIG[this.paymentMethod()]);

  private readonly accountsByType = signal<Partial<Record<PaymentMethod, AdminBankAccount[]>>>({});
  private readonly loadedTypes = signal<ReadonlySet<PaymentMethod>>(new Set());
  private readonly selectedIdByType = signal<Partial<Record<PaymentMethod, number | null>>>({});

  readonly accountsLoading = signal(true);
  readonly accountsError = signal<string | null>(null);
  readonly accounts = computed(() => this.accountsByType()[this.paymentMethod()] ?? []);
  readonly selectedAccountId = computed(() => this.selectedIdByType()[this.paymentMethod()] ?? null);
  readonly selectedAccount = computed(() => this.accounts().find((a) => a.id === this.selectedAccountId()) ?? null);
  readonly copiedField = signal<'accountNumber' | 'iban' | null>(null);

  readonly amount = signal<number | null>(null);
  readonly receipt = signal<File | null>(null);
  readonly note = signal('');
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly isValid = () => (this.amount() ?? 0) > 0 && this.receipt() !== null;

  ngOnInit(): void {
    this.loadAccounts('Bank');
  }

  private loadAccounts(type: PaymentMethod): void {
    this.accountsLoading.set(true);
    this.accountsError.set(null);
    this.topUpService.listAccounts(type).subscribe({
      next: (accounts) => {
        this.accountsByType.update((map) => ({ ...map, [type]: accounts }));
        this.loadedTypes.update((set) => new Set(set).add(type));
        const initial = accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;
        this.selectedIdByType.update((map) => ({ ...map, [type]: initial?.id ?? null }));
        this.accountsLoading.set(false);
      },
      error: () => {
        this.accountsError.set(type === 'Bank' ? 'Failed to load bank accounts.' : 'Failed to load E Vault accounts.');
        this.accountsLoading.set(false);
      }
    });
  }

  selectAccount(account: AdminBankAccount): void {
    this.selectedIdByType.update((map) => ({ ...map, [this.paymentMethod()]: account.id }));
  }

  setPaymentMethod(method: PaymentMethod): void {
    this.paymentMethod.set(method);
    if (!this.loadedTypes().has(method)) {
      this.loadAccounts(method);
    }
  }

  maskAccountNumber(accountNumber: string): string {
    return accountNumber.length > 4 ? '•••• '.concat(accountNumber.slice(-4)) : accountNumber;
  }

  copy(value: string, field: 'accountNumber' | 'iban'): void {
    navigator.clipboard.writeText(value);
    this.copiedField.set(field);
    this.snackBar.open('Copied successfully.', undefined, { duration: 2000 });
    setTimeout(() => {
      if (this.copiedField() === field) {
        this.copiedField.set(null);
      }
    }, 1500);
  }

  onAmountInput(value: string): void {
    const parsed = Number(value);
    this.amount.set(Number.isFinite(parsed) && value.trim() !== '' ? parsed : null);
  }

  onReceiptSelected(files: File[]): void {
    const file = files[0];
    if (file) {
      this.receipt.set(file);
      this.errorMessage.set(null);
    }
  }

  onReceiptRemoved(): void {
    this.receipt.set(null);
  }

  submit(): void {
    const amount = this.amount();
    const receipt = this.receipt();
    if (!amount || amount <= 0 || !receipt || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.topUpService.submit(amount, receipt, this.note()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitted.set(true);
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.error ?? 'Failed to submit top-up request.');
      }
    });
  }

  close(): void {
    this.dialogRef.close(this.submitted());
  }
}
