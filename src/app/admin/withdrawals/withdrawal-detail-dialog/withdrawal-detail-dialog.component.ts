import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../../environments/environment';
import { WithdrawalsService } from '../../../core/services/withdrawals.service';
import { WithdrawalListItemDto } from '../../../core/models/withdrawal.model';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult } from '../../../shared/confirmation-modal/confirmation-modal.component';
import { isImageUrl } from '../../../shared/utils/file-type.util';

export interface WithdrawalDetailDialogData {
  withdrawal: WithdrawalListItemDto;
}

/**
 * Mirrors AdminTopUpDetailDialogComponent's receipt-viewer pattern exactly (image/PDF inline,
 * DomSanitizer.bypassSecurityTrustResourceUrl for the PDF iframe). Unlike that dialog's inline
 * "confirming" toggle for Approve, all three review actions here go through the shared
 * ConfirmationModalComponent (per this task's explicit instruction), which is also what Suspend/
 * Block Withdrawals/Delete Store already use — one confirm modal, not three bespoke ones.
 */
@Component({
  selector: 'app-withdrawal-detail-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatDialogModule, MatIconModule, StatusBadgeComponent],
  templateUrl: './withdrawal-detail-dialog.component.html',
  styleUrl: './withdrawal-detail-dialog.component.scss'
})
export class WithdrawalDetailDialogComponent {
  private readonly withdrawalsService = inject(WithdrawalsService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<WithdrawalDetailDialogComponent>);
  private readonly data = inject<WithdrawalDetailDialogData>(MAT_DIALOG_DATA);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly imagePreview = inject(ImagePreviewService);

  readonly withdrawal = signal(this.data.withdrawal);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly hasReceipt = !!this.data.withdrawal.receiptUrl;
  readonly isImage = this.hasReceipt && isImageUrl(this.data.withdrawal.receiptUrl!);
  readonly isPdf = this.hasReceipt && /\.pdf$/i.test(this.data.withdrawal.receiptUrl!);
  readonly receiptUrl = this.hasReceipt ? `${environment.filesBaseUrl}${this.data.withdrawal.receiptUrl}` : null;
  /** iframe[src] requires an explicitly-trusted resource URL — a plain string binding is blocked by Angular's sanitizer. */
  readonly safeReceiptUrl: SafeResourceUrl | null = this.receiptUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(this.receiptUrl) : null;

  close(): void {
    this.dialogRef.close();
  }

  openReceiptImage(): void {
    if (this.receiptUrl) {
      this.imagePreview.open(this.receiptUrl, 'Payout proof');
    }
  }

  private confirm(data: ConfirmationModalData) {
    return this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '460px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed();
  }

  accept(): void {
    const w = this.withdrawal();
    this.confirm({
      title: 'Accept Withdrawal',
      message: `Accept this withdrawal of ${this.currency(w.amount)} for ${w.sellerName}? This will deduct the amount from their balance.`,
      variant: 'green',
      confirmLabel: 'Accept',
      icon: 'check_circle',
      showReason: true,
      reasonLabel: 'Comment (optional)',
      showFileUpload: true,
      fileUploadLabel: 'Attach payment receipt (optional)'
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.submitting.set(true);
      this.errorMessage.set(null);
      this.withdrawalsService.accept(this.withdrawal().id, result.reason || null, result.file).subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (err) => {
          this.submitting.set(false);
          this.errorMessage.set(this.extractErrorMessage(err, 'Failed to accept this withdrawal.'));
        }
      });
    });
  }

  decline(): void {
    this.confirm({
      title: 'Decline Withdrawal',
      message: 'The seller will be notified with your reason. If this withdrawal was already accepted, the deducted amount will be refunded to their balance.',
      variant: 'red',
      confirmLabel: 'Decline',
      icon: 'block',
      requireReason: true,
      reasonLabel: 'Reason for declining'
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.submitting.set(true);
      this.errorMessage.set(null);
      this.withdrawalsService.decline(this.withdrawal().id, result.reason).subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (err) => {
          this.submitting.set(false);
          this.errorMessage.set(this.extractErrorMessage(err, 'Failed to decline this withdrawal.'));
        }
      });
    });
  }

  setPending(): void {
    this.confirm({
      title: 'Set to Pending',
      message: 'This puts the request back under review. If it was already accepted, the deducted amount will be refunded to the seller until it’s reviewed again.',
      variant: 'amber',
      confirmLabel: 'Set to Pending',
      icon: 'undo',
      showReason: true,
      reasonLabel: 'Comment (optional)'
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.submitting.set(true);
      this.errorMessage.set(null);
      this.withdrawalsService.setPending(this.withdrawal().id, result.reason || null).subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (err) => {
          this.submitting.set(false);
          this.errorMessage.set(this.extractErrorMessage(err, 'Failed to set this withdrawal back to pending.'));
        }
      });
    });
  }

  private currency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  /**
   * Surfaces the real backend message instead of a hardcoded generic string — same fix already
   * applied to WithdrawModalComponent. Checks this app's own error shape ({ error: string }) first,
   * then ASP.NET's automatic model-validation shape (ValidationProblemDetails: { title, errors }),
   * so a future mismatch/exception is debuggable here instead of showing a generic fallback again.
   */
  private extractErrorMessage(err: { error?: { error?: string; title?: string; errors?: Record<string, string[]> } }, fallback: string): string {
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
    return fallback;
  }
}
