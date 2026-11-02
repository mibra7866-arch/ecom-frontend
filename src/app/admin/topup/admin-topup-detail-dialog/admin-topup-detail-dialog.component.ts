import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../../environments/environment';
import { AdminTopUpService } from '../../../core/services/admin-topup.service';
import { TopUpListItemDto } from '../../../core/models/topup.model';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { RejectReasonDialogComponent } from '../../../shared/reject-reason-dialog/reject-reason-dialog.component';
import { isImageUrl } from '../../../shared/utils/file-type.util';

export interface AdminTopUpDetailDialogData {
  request: TopUpListItemDto;
}

/** Reuses the same MatDialog wrapper as the catalog modal and RejectReasonDialogComponent — the review action (reject-with-reason) is literally the same generic dialog KYC review already uses. */
@Component({
  selector: 'app-admin-topup-detail-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatDialogModule, MatIconModule, StatusBadgeComponent],
  templateUrl: './admin-topup-detail-dialog.component.html',
  styleUrl: './admin-topup-detail-dialog.component.scss'
})
export class AdminTopUpDetailDialogComponent {
  private readonly topUpService = inject(AdminTopUpService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<AdminTopUpDetailDialogComponent>);
  private readonly data = inject<AdminTopUpDetailDialogData>(MAT_DIALOG_DATA);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly imagePreview = inject(ImagePreviewService);

  readonly request = signal(this.data.request);
  readonly confirmingApprove = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly isImage = isImageUrl(this.data.request.receiptUrl);
  readonly isPdf = /\.pdf$/i.test(this.data.request.receiptUrl);
  readonly receiptUrl = `${environment.filesBaseUrl}${this.data.request.receiptUrl}`;
  /** iframe[src] requires an explicitly-trusted resource URL — a plain string binding is blocked by Angular's sanitizer. */
  readonly safeReceiptUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.receiptUrl);

  close(): void {
    this.dialogRef.close();
  }

  openReceiptImage(): void {
    this.imagePreview.open(this.receiptUrl, 'Payment receipt');
  }

  requestApprove(): void {
    this.confirmingApprove.set(true);
  }

  cancelApprove(): void {
    this.confirmingApprove.set(false);
  }

  confirmApprove(): void {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.topUpService.approve(this.request().id).subscribe({
      next: (updated) => this.dialogRef.close(updated),
      error: (err) => {
        this.submitting.set(false);
        this.confirmingApprove.set(false);
        this.errorMessage.set(err.error?.error ?? 'Failed to approve this request.');
      }
    });
  }

  reject(): void {
    const ref = this.dialog.open(RejectReasonDialogComponent, {
      width: '420px',
      data: {
        title: 'Reject top-up request',
        placeholder: 'Why is this top-up request being rejected?'
      }
    });

    ref.afterClosed().subscribe((reason?: string) => {
      if (!reason) {
        return;
      }

      this.submitting.set(true);
      this.errorMessage.set(null);
      this.topUpService.reject(this.request().id, reason).subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (err) => {
          this.submitting.set(false);
          this.errorMessage.set(err.error?.error ?? 'Failed to reject this request.');
        }
      });
    });
  }
}
