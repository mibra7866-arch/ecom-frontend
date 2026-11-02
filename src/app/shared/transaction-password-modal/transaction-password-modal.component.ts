import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { passwordsMatchValidator } from '../validators/password-match.validator';

export interface TransactionPasswordModalResult {
  password: string;
  confirmPassword: string;
}

/**
 * Seller-only — sets or replaces their transaction password (a second credential, separate from
 * their login password, used to authorize transactions). Same field/validation shape as the signup
 * wizard's password step (min 8 chars, passwordsMatchValidator reused rather than reimplemented).
 * Never pre-fills a value — there's nothing to show, since the current password (even hashed) is
 * never sent to the client.
 */
@Component({
  selector: 'app-transaction-password-modal',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule],
  templateUrl: './transaction-password-modal.component.html',
  styleUrl: './transaction-password-modal.component.scss'
})
export class TransactionPasswordModalComponent {
  private readonly fb = inject(FormBuilder);
  readonly dialogRef = inject(MatDialogRef<TransactionPasswordModalComponent, TransactionPasswordModalResult>);

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    },
    { validators: passwordsMatchValidator('password', 'confirmPassword') }
  );

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { password, confirmPassword } = this.form.getRawValue();
    this.dialogRef.close({ password, confirmPassword });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
