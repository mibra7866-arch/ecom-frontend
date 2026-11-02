import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BankDetails } from '../../core/models/seller-action.model';
import { ibanValidator } from '../validators/iban.validator';

export interface BankDetailsModalData {
  /** "Bank Account Details" for the seller's own edit, "Edit Bank Details" (or similar) for the admin correction — caller decides the wording. */
  title: string;
  initial: BankDetails;
  /** true for the admin-side edit (a correction to someone else's payout data needs justification); false for the seller editing their own. */
  requireReason: boolean;
  /** Everything below is optional and defaults to the original Bank Account wording/shape when
   * omitted, so every existing caller (seller's own edit, admin's correction) is completely
   * unaffected. Admin Profile's Add/Edit E Vault is the only caller that sets these, to reuse this
   * exact modal for a different payout method instead of building a near-identical one. */
  subtitle?: string;
  providerLabel?: string;
  accountNumberLabel?: string;
  showIban?: boolean;
  /** true (the default, matching Bank Account's original behavior) requires the account number to be
   * digits only. E Vault sets this false — a wallet address (e.g. a TRC20 address) is alphanumeric,
   * not a phone/account number. */
  accountNumberDigitsOnly?: boolean;
}

export interface BankDetailsModalResult {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  iban: string | null;
  /** Only populated when requireReason is true. */
  reason: string | null;
}

/**
 * One form reused for both the seller's own edit (Profile page) and the admin's correction (Sellers
 * module) — same fields and same validators as the signup wizard's Bank Account Details step (IBAN
 * optional via the same ibanValidator(), reused rather than reimplemented), with an optional reason
 * field toggled by requireReason, mirroring how ConfirmationModalComponent/FinancialAdjustmentModalComponent
 * already vary their own required fields per caller instead of existing as two near-identical modals.
 */
@Component({
  selector: 'app-bank-details-modal',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, MatDialogModule],
  templateUrl: './bank-details-modal.component.html',
  styleUrl: './bank-details-modal.component.scss'
})
export class BankDetailsModalComponent {
  private readonly fb = inject(FormBuilder);
  readonly dialogRef = inject(MatDialogRef<BankDetailsModalComponent, BankDetailsModalResult>);
  readonly data = inject<BankDetailsModalData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    accountHolderName: [this.data.initial.accountHolderName ?? '', Validators.required],
    bankName: [this.data.initial.bankName ?? '', Validators.required],
    accountNumber: [
      this.data.initial.accountNumber ?? '',
      (this.data.accountNumberDigitsOnly ?? true) ? [Validators.required, Validators.pattern(/^[0-9]+$/)] : [Validators.required]
    ],
    iban: [this.data.initial.iban ?? '', ibanValidator()]
  });

  readonly reason = signal('');

  readonly canSave = () => this.form.valid && (!this.data.requireReason || this.reason().trim().length > 0);

  save(): void {
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      return;
    }

    const { accountHolderName, bankName, accountNumber, iban } = this.form.getRawValue();
    this.dialogRef.close({
      accountHolderName,
      bankName,
      accountNumber,
      iban: iban || null,
      reason: this.data.requireReason ? this.reason().trim() : null
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
