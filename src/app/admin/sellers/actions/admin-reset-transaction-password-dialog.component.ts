import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AdminSellerActionsService } from '../../../core/services/admin-seller-actions.service';

export interface AdminResetTransactionPasswordDialogData {
  sellerId: number;
  sellerName: string;
}

/**
 * POST admin/sellers/{id}/reset-transaction-password — same reasoning as AdminResetPasswordDialogComponent,
 * for the separate transaction-password credential. No old-password check; the new value becomes the
 * seller's current transaction password, which their own ChangeTransactionPassword flow can then verify.
 */
@Component({
  selector: 'app-admin-reset-transaction-password-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatIconModule],
  templateUrl: './admin-reset-transaction-password-dialog.component.html',
  styleUrl: './action-dialog.scss'
})
export class AdminResetTransactionPasswordDialogComponent {
  private readonly actionsService = inject(AdminSellerActionsService);
  readonly dialogRef = inject(MatDialogRef<AdminResetTransactionPasswordDialogComponent>);
  readonly data = inject<AdminResetTransactionPasswordDialogData>(MAT_DIALOG_DATA);

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
    this.actionsService.resetTransactionPassword(this.data.sellerId, { newPassword: this.newPassword(), confirmNewPassword: this.confirmNewPassword() }).subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.error ?? 'Failed to reset transaction password.');
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
