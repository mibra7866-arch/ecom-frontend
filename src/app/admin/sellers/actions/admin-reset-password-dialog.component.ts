import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AdminSellerActionsService } from '../../../core/services/admin-seller-actions.service';

export interface AdminResetPasswordDialogData {
  sellerId: number;
  sellerName: string;
}

/**
 * POST admin/sellers/{id}/reset-password — sets a NEW login password for a seller with no
 * old-password check (that's the whole point of a reset — e.g. a locked-out seller who can't use
 * their own ChangePassword flow, which requires knowing the current one). The seller signs in with
 * this value and, from then on, it IS their current password — ChangePassword afterward treats it
 * exactly like any other current password.
 */
@Component({
  selector: 'app-admin-reset-password-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatIconModule],
  templateUrl: './admin-reset-password-dialog.component.html',
  styleUrl: './action-dialog.scss'
})
export class AdminResetPasswordDialogComponent {
  private readonly actionsService = inject(AdminSellerActionsService);
  readonly dialogRef = inject(MatDialogRef<AdminResetPasswordDialogComponent>);
  readonly data = inject<AdminResetPasswordDialogData>(MAT_DIALOG_DATA);

  readonly newPassword = signal('');
  readonly confirmNewPassword = signal('');
  readonly showNew = signal(false);
  readonly showConfirm = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly touched = signal(false);

  readonly tooShort = computed(() => this.touched() && this.newPassword().length > 0 && this.newPassword().length < 8);
  readonly mismatch = computed(() => this.touched() && this.confirmNewPassword().length > 0 && this.newPassword() !== this.confirmNewPassword());

  readonly canSave = () => this.newPassword().length >= 8 && this.newPassword() === this.confirmNewPassword() && !this.saving();

  save(): void {
    this.touched.set(true);
    if (!this.canSave()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.actionsService.resetPassword(this.data.sellerId, { newPassword: this.newPassword(), confirmNewPassword: this.confirmNewPassword() }).subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.error ?? 'Failed to reset password.');
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
