import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { SellerProfileService } from '../../core/services/seller-profile.service';
import { passwordsMatchValidator } from '../validators/password-match.validator';

/**
 * Seller-only — changes their login password. Unlike TransactionPasswordModalComponent (which just
 * collects values and lets the caller submit), this modal submits itself and stays open on error
 * (e.g. wrong current password) — same "submit inside the modal, close only on success" shape
 * ProductFormModalComponent uses, needed here because "is the current password correct" can only be
 * known after a server round trip.
 */
@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './change-password-modal.component.html',
  styleUrl: './change-password-modal.component.scss'
})
export class ChangePasswordModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly profileService = inject(SellerProfileService);
  readonly dialogRef = inject(MatDialogRef<ChangePasswordModalComponent, boolean>);

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

    this.profileService.changePassword({ oldPassword, newPassword, confirmNewPassword }).subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.errorMessage.set(err.error?.error ?? 'Failed to change password.');
        this.saving.set(false);
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
