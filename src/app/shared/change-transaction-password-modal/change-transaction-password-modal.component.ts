import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { SellerBankDetailsService } from '../../core/services/seller-bank-details.service';
import { BankDetails } from '../../core/models/seller-action.model';
import { passwordsMatchValidator } from '../validators/password-match.validator';

/**
 * Seller-only — changes an ALREADY-SET transaction password. Unlike TransactionPasswordModalComponent
 * (first-time set, nothing to verify against — just collects values and lets the caller submit), this
 * modal requires and verifies the current transaction password, so it submits itself and stays open
 * on error (e.g. wrong current password), same shape as ChangePasswordModalComponent.
 */
@Component({
  selector: 'app-change-transaction-password-modal',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './change-transaction-password-modal.component.html',
  styleUrl: './change-transaction-password-modal.component.scss'
})
export class ChangeTransactionPasswordModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly bankDetailsService = inject(SellerBankDetailsService);
  readonly dialogRef = inject(MatDialogRef<ChangeTransactionPasswordModalComponent, BankDetails>);

  readonly form = this.fb.nonNullable.group(
    {
      oldPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmNewPassword: ['', Validators.required]
    },
    { validators: passwordsMatchValidator('newPassword', 'confirmNewPassword') }
  );

  readonly showOld = signal(false);
  readonly showNew = signal(false);
  readonly showConfirm = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { oldPassword, newPassword, confirmNewPassword } = this.form.getRawValue();
    this.saving.set(true);
    this.errorMessage.set(null);

    this.bankDetailsService.changeTransactionPassword({ oldPassword, newPassword, confirmNewPassword }).subscribe({
      next: (updated) => this.dialogRef.close(updated),
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to change transaction password.');
        this.saving.set(false);
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
