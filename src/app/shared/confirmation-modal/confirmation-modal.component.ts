import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { FileUploadComponent } from '../file-upload/file-upload.component';

export interface ConfirmationModalData {
  title: string;
  message: string;
  /** amber = cautionary (Suspend, Block Withdrawals), red = destructive (Delete Store), green = affirmative (Accept Withdrawal) — same tone convention as StatusBadgeComponent. */
  variant: 'amber' | 'red' | 'green';
  confirmLabel: string;
  icon?: string;
  requireReason?: boolean;
  /** Shows the reason field without requiring it (e.g. Accept/Set-to-Pending's optional comment) — independent of requireReason so existing required-reason callers are unaffected. */
  showReason?: boolean;
  reasonLabel?: string;
  /** When set, the admin must type this exact value (e.g. the shop name) before confirming can be pressed — the standard "type to confirm" destructive-action pattern, used by Delete Store. */
  typeToConfirmValue?: string;
  /** Shows an optional single-file attach control (e.g. Accept Withdrawal's payment receipt) — reuses the same FileUploadComponent as Top-Up/KYC/signup, never required to confirm. */
  showFileUpload?: boolean;
  fileUploadLabel?: string;
}

export interface ConfirmationModalResult {
  reason: string;
  file: File | null;
}

/**
 * One shared modal for every destructive/cautionary confirm-with-reason action (Suspend, Block
 * Withdrawals, Delete Store) — `variant` swaps color/icon, `requireReason`/`typeToConfirmValue`
 * toggle the two optional fields, so this never needed a second near-identical component.
 */
@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatIconModule, FileUploadComponent],
  templateUrl: './confirmation-modal.component.html',
  styleUrl: './confirmation-modal.component.scss'
})
export class ConfirmationModalComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmationModalComponent, ConfirmationModalResult>);
  readonly data = inject<ConfirmationModalData>(MAT_DIALOG_DATA);

  readonly reason = signal('');
  readonly typedConfirmation = signal('');
  readonly file = signal<File | null>(null);

  // typeToConfirmValue (e.g. a store name) can carry stray leading/trailing whitespace from however
  // it was originally entered/imported — trimming only the admin's typed side left that whitespace
  // permanently unmatchable no matter how carefully they typed it, disabling Delete for any store
  // whose name wasn't already whitespace-clean. Trimming both sides fixes that generally, not just
  // for one specific store.
  readonly canConfirm = () =>
    (!this.data.requireReason || this.reason().trim().length > 0) &&
    (!this.data.typeToConfirmValue || this.typedConfirmation().trim() === this.data.typeToConfirmValue.trim());

  onFileSelected(files: File[]): void {
    const selected = files[0];
    if (selected) {
      this.file.set(selected);
    }
  }

  onFileRemoved(): void {
    this.file.set(null);
  }

  confirm(): void {
    if (!this.canConfirm()) {
      return;
    }
    this.dialogRef.close({ reason: this.reason().trim(), file: this.file() });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
