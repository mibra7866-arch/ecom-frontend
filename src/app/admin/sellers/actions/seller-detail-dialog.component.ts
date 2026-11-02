import { DatePipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment } from '../../../../environments/environment';
import { AdminSellerActionsService } from '../../../core/services/admin-seller-actions.service';
import { KycAdminService } from '../../../core/services/kyc-admin.service';
import { KycSubmissionDto } from '../../../core/models/kyc.model';
import { BankDetails } from '../../../core/models/seller-action.model';
import { SellerListItemDto } from '../../../core/models/seller.model';
import { StoreMonitoringDto } from '../../../core/models/store-monitoring.model';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { RejectReasonDialogComponent } from '../../../shared/reject-reason-dialog/reject-reason-dialog.component';
import { BankDetailsModalComponent, BankDetailsModalData, BankDetailsModalResult } from '../../../shared/bank-details-modal/bank-details-modal.component';
import { ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult } from '../../../shared/confirmation-modal/confirmation-modal.component';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { FileUploadComponent } from '../../../shared/file-upload/file-upload.component';
import { VerifiedBadgeComponent } from '../../../shared/verified-badge/verified-badge.component';

const IMAGE_URL_PATTERN = /\.(jpe?g|png|webp|gif)$/i;

export interface SellerDetailDialogData {
  seller: SellerListItemDto;
  /** Set when opened from the Sellers list's "Pending KYC" status badge — scrolls straight to the KYC
   * Verification section (Approve/Reject) instead of leaving the admin to find it below Bank Details. */
  focusKyc?: boolean;
}

/**
 * The admin's view of one seller's payout details + KYC status/documents — Bank Details is unmasked
 * here (unlike the seller's own Profile page) since an admin legitimately needs full visibility for
 * withdrawal-processing/verification. KYC approve/reject calls KycAdminService.review — the exact same
 * service/endpoint the dedicated KYC Review screen already uses, not a second implementation — so
 * approving from here has identical effects (notification, login unblock) to approving from there.
 */
@Component({
  selector: 'app-seller-detail-dialog',
  standalone: true,
  imports: [DatePipe, FileUploadComponent, MatDialogModule, MatIconModule, MatProgressSpinnerModule, StatusBadgeComponent, VerifiedBadgeComponent],
  templateUrl: './seller-detail-dialog.component.html',
  styleUrl: './seller-detail-dialog.component.scss'
})
export class SellerDetailDialogComponent implements OnInit, AfterViewInit {
  private readonly dialogRef = inject(MatDialogRef<SellerDetailDialogComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly actionsService = inject(AdminSellerActionsService);
  private readonly kycService = inject(KycAdminService);
  private readonly imagePreview = inject(ImagePreviewService);
  readonly data = inject<SellerDetailDialogData>(MAT_DIALOG_DATA);

  @ViewChild('kycSection') private kycSection?: ElementRef<HTMLElement>;

  readonly bankDetails = signal<BankDetails | null>(null);
  readonly bankDetailsLoading = signal(true);
  readonly kyc = signal<KycSubmissionDto | null | undefined>(undefined);
  readonly kycLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly monitoring = signal<StoreMonitoringDto | null>(null);
  readonly monitoringLoading = signal(true);

  readonly kycHistory = signal<KycSubmissionDto[]>([]);
  readonly kycHistoryLoading = signal(true);
  readonly kycUploadFiles = signal<File[]>([]);
  readonly kycUploadSubmitting = signal(false);
  readonly kycUploadError = signal<string | null>(null);
  /** The one document URL currently being deleted, if any — disables just that row's Delete button
   * rather than the whole section, and blocks a duplicate delete click on the same document. */
  readonly deletingDocumentUrl = signal<string | null>(null);

  ngOnInit(): void {
    this.loadBankDetails();
    this.loadKyc();
    this.loadKycHistory();
    this.loadMonitoring();
  }

  ngAfterViewInit(): void {
    if (this.data.focusKyc) {
      // Runs after the initial render, so the section already has its real height (spinner, then
      // content once loadKyc() resolves) rather than scrolling against a collapsing/growing target.
      queueMicrotask(() => this.kycSection?.nativeElement.scrollIntoView({ block: 'start' }));
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  fileUrl(documentUrl: string): string {
    return `${environment.filesBaseUrl}${documentUrl}`;
  }

  isImageUrl(documentUrl: string): boolean {
    return IMAGE_URL_PATTERN.test(documentUrl);
  }

  openDocument(documentUrl: string): void {
    if (this.isImageUrl(documentUrl)) {
      this.imagePreview.open(this.fileUrl(documentUrl), 'KYC document');
    } else {
      window.open(this.fileUrl(documentUrl), '_blank', 'noopener');
    }
  }

  isAdminUploaded(documentUrl: string): boolean {
    return this.kyc()?.adminUploadedDocumentUrls.includes(documentUrl) ?? false;
  }

  /** Available for both seller- and admin-uploaded documents — the backend still independently
   * verifies seller ownership before deleting anything, regardless of who originally uploaded it. */
  deleteDocument(documentUrl: string): void {
    if (this.deletingDocumentUrl()) {
      return;
    }

    this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '420px',
        panelClass: 'seller-catalog-dialog-panel',
        data: {
          title: 'Delete Document',
          message: 'Are you sure you want to delete this document? This action cannot be undone.',
          variant: 'red',
          confirmLabel: 'Delete',
          icon: 'delete_forever'
        }
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }

        this.deletingDocumentUrl.set(documentUrl);
        this.kycService.deleteDocument(this.data.seller.id, documentUrl).subscribe({
          next: (updated) => {
            this.kyc.set(updated);
            this.deletingDocumentUrl.set(null);
          },
          error: () => {
            this.errorMessage.set('Failed to delete document.');
            this.deletingDocumentUrl.set(null);
          }
        });
      });
  }

  private loadBankDetails(): void {
    this.bankDetailsLoading.set(true);
    this.actionsService.getBankDetails(this.data.seller.id).subscribe({
      next: (details) => {
        this.bankDetails.set(details);
        this.bankDetailsLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load bank details.');
        this.bankDetailsLoading.set(false);
      }
    });
  }

  private loadMonitoring(): void {
    this.monitoringLoading.set(true);
    this.actionsService.getMonitoring(this.data.seller.id).subscribe({
      next: (data) => {
        this.monitoring.set(data);
        this.monitoringLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load store monitoring data.');
        this.monitoringLoading.set(false);
      }
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  private loadKyc(): void {
    this.kycLoading.set(true);
    this.actionsService.getKyc(this.data.seller.id).subscribe({
      next: (submission) => {
        this.kyc.set(submission);
        this.kycLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load KYC status.');
        this.kycLoading.set(false);
      }
    });
  }

  private loadKycHistory(): void {
    this.kycHistoryLoading.set(true);
    this.kycService.history(this.data.seller.id).subscribe({
      next: (history) => {
        this.kycHistory.set(history);
        this.kycHistoryLoading.set(false);
      },
      error: () => this.kycHistoryLoading.set(false)
    });
  }

  onKycUploadFilesSelected(files: File[]): void {
    this.kycUploadFiles.update((current) => [...current, ...files]);
  }

  onKycUploadFileRemoved(file: File): void {
    this.kycUploadFiles.update((current) => current.filter((f) => f !== file));
  }

  submitKycDocuments(): void {
    const files = this.kycUploadFiles();
    if (files.length === 0 || this.kycUploadSubmitting()) {
      return;
    }

    this.kycUploadSubmitting.set(true);
    this.kycUploadError.set(null);
    this.kycService.updateDocuments(this.data.seller.id, files).subscribe({
      next: (updated) => {
        this.kyc.set(updated);
        this.kycUploadFiles.set([]);
        this.kycUploadSubmitting.set(false);
        this.loadKycHistory();
      },
      error: (err) => {
        this.kycUploadError.set(err.error?.error ?? 'Failed to upload documents.');
        this.kycUploadSubmitting.set(false);
      }
    });
  }

  editBankDetails(): void {
    const current = this.bankDetails();
    const data: BankDetailsModalData = {
      title: `Edit Bank Details — ${this.data.seller.storeName}`,
      initial: current ?? { accountHolderName: null, bankName: null, accountNumber: null, iban: null, hasTransactionPassword: false },
      requireReason: true
    };

    this.dialog
      .open<BankDetailsModalComponent, BankDetailsModalData, BankDetailsModalResult>(BankDetailsModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.actionsService
          .updateBankDetails(this.data.seller.id, {
            accountHolderName: result.accountHolderName,
            bankName: result.bankName,
            accountNumber: result.accountNumber,
            iban: result.iban,
            reason: result.reason!
          })
          .subscribe({
            next: (updated) => this.bankDetails.set(updated),
            error: () => this.errorMessage.set('Failed to update bank details.')
          });
      });
  }

  /** Same zero-confirmation approve as KycReviewComponent.approve() — matching it exactly rather than adding a confirm step that doesn't exist on the source screen. */
  approveKyc(): void {
    const submission = this.kyc();
    if (!submission || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.kycService.review(submission.id, { approve: true, reason: null }).subscribe({
      next: (updated) => {
        this.kyc.set(updated);
        this.submitting.set(false);
        this.loadKycHistory();
      },
      error: () => {
        this.errorMessage.set('Failed to approve submission.');
        this.submitting.set(false);
      }
    });
  }

  /** Same RejectReasonDialogComponent KycReviewComponent.reject() already uses. */
  rejectKyc(): void {
    const submission = this.kyc();
    if (!submission) {
      return;
    }

    const ref = this.dialog.open(RejectReasonDialogComponent, { width: '420px' });
    ref.afterClosed().subscribe((reason?: string) => {
      if (!reason) {
        return;
      }
      this.submitting.set(true);
      this.errorMessage.set(null);
      this.kycService.review(submission.id, { approve: false, reason }).subscribe({
        next: (updated) => {
          this.kyc.set(updated);
          this.submitting.set(false);
          this.loadKycHistory();
        },
        error: () => {
          this.errorMessage.set('Failed to reject submission.');
          this.submitting.set(false);
        }
      });
    });
  }
}
