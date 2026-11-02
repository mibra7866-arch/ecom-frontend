import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { environment } from '../../../environments/environment';
import { KycAdminService } from '../../core/services/kyc-admin.service';
import { KycStatus, KycSubmissionDto } from '../../core/models/kyc.model';
import { ImagePreviewService } from '../../shared/image-preview/image-preview.service';
import { PagerComponent } from '../../shared/pager/pager.component';
import { ResultsPillComponent } from '../../shared/results-pill/results-pill.component';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { RejectReasonDialogComponent } from '../../shared/reject-reason-dialog/reject-reason-dialog.component';
import { isImageUrl } from '../../shared/utils/file-type.util';

const PAGE_SIZE = 10;

/** "Needs admin attention" default, same convention as AdminTopUpRequestsComponent defaulting its filter to 'Pending'. */
const DEFAULT_STATUS: KycStatus = 'AwaitingVerification';

@Component({
  selector: 'app-kyc-review',
  standalone: true,
  imports: [
    DatePipe,
    MatTableModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    PagerComponent,
    ResultsPillComponent,
    StatusBadgeComponent
  ],
  templateUrl: './kyc-review.component.html',
  styleUrl: './kyc-review.component.scss'
})
export class KycReviewComponent implements OnInit {
  private readonly kycService = inject(KycAdminService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imagePreview = inject(ImagePreviewService);
  private readonly searchInput$ = new Subject<string>();

  readonly submissions = signal<KycSubmissionDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly statusFilter = signal<KycStatus | null>(DEFAULT_STATUS);

  readonly statuses: KycStatus[] = ['AwaitingVerification', 'Approved', 'Rejected'];
  readonly columns = ['sellerName', 'documents', 'status', 'createdAt', 'actions'];
  readonly errorMessage = signal<string | null>(null);
  /** The submission currently mid-approve/reject — disables its row's buttons so a slow connection
   * shows immediate feedback instead of looking unresponsive, and can't be double-tapped into firing
   * a second request. */
  readonly processingId = signal<number | null>(null);

  ngOnInit(): void {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((term) => {
      this.search.set(term);
      this.page.set(1);
      this.load();
    });

    this.load();
    this.kycService.markRead();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.kycService.list(this.statusFilter(), this.search(), this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        this.submissions.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load KYC submissions.');
        this.loading.set(false);
      }
    });
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  setStatusFilter(status: KycStatus | null): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.load();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  fileUrl(documentUrl: string): string {
    return `${environment.filesBaseUrl}${documentUrl}`;
  }

  isImageDocument(documentUrl: string): boolean {
    return isImageUrl(documentUrl);
  }

  /** KYC documents are usually ID photos but PDF is also accepted (KycFileStorageService uses
   * FileValidationRules.Default — any image, plus PDF) — image documents open in the shared lightbox;
   * PDFs still open in a new tab since there's nothing to preview inline for those. */
  openDocument(documentUrl: string, label: string): void {
    this.imagePreview.open(this.fileUrl(documentUrl), label);
  }

  /** Same "space before each capital" formatting as StatusBadgeComponent — the raw enum value
   * ("AwaitingVerification") rendered as one unbroken 21-character word was by far the widest thing
   * in the filter row, forcing it to overflow on mobile. */
  statusLabel(status: KycStatus): string {
    return status.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  emptyMessage(): string {
    if (this.search().trim()) {
      return 'No KYC submissions match your search.';
    }
    switch (this.statusFilter()) {
      case 'AwaitingVerification':
        return 'No submissions awaiting review.';
      case 'Approved':
        return 'No approved KYC submissions.';
      case 'Rejected':
        return 'No rejected KYC submissions.';
      default:
        return 'No KYC submissions found.';
    }
  }

  approve(submission: KycSubmissionDto): void {
    if (this.processingId() !== null) {
      return;
    }
    this.processingId.set(submission.id);
    this.kycService.review(submission.id, { approve: true, reason: null }).subscribe({
      next: () => {
        this.processingId.set(null);
        this.submissions.update((list) => list.filter((s) => s.id !== submission.id));
        this.totalCount.update((count) => Math.max(0, count - 1));
      },
      error: () => {
        this.processingId.set(null);
        this.errorMessage.set('Failed to approve submission.');
      }
    });
  }

  reject(submission: KycSubmissionDto): void {
    const ref = this.dialog.open(RejectReasonDialogComponent, { width: '420px' });
    ref.afterClosed().subscribe((reason?: string) => {
      if (!reason || this.processingId() !== null) {
        return;
      }
      this.processingId.set(submission.id);
      this.kycService.review(submission.id, { approve: false, reason }).subscribe({
        next: () => {
          this.processingId.set(null);
          this.submissions.update((list) => list.filter((s) => s.id !== submission.id));
          this.totalCount.update((count) => Math.max(0, count - 1));
        },
        error: () => {
          this.processingId.set(null);
          this.errorMessage.set('Failed to reject submission.');
        }
      });
    });
  }
}
