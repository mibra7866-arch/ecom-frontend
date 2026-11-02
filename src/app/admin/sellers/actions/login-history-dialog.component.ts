import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminSellerActionsService } from '../../../core/services/admin-seller-actions.service';
import { LoginHistoryItemDto } from '../../../core/models/seller-action.model';
import { PagerComponent } from '../../../shared/pager/pager.component';

export interface LoginHistoryDialogData {
  sellerId: number;
  sellerName: string;
}

const PAGE_SIZE = 10;

/** GET admin/sellers/{id}/login-history — reads the LoginHistory rows SellerAuthController.Login already writes on every attempt (success and failure). */
@Component({
  selector: 'app-login-history-dialog',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatProgressSpinnerModule, PagerComponent],
  templateUrl: './login-history-dialog.component.html',
  styleUrl: './action-dialog.scss'
})
export class LoginHistoryDialogComponent implements OnInit {
  private readonly actionsService = inject(AdminSellerActionsService);
  readonly dialogRef = inject(MatDialogRef<LoginHistoryDialogComponent>);
  readonly data = inject<LoginHistoryDialogData>(MAT_DIALOG_DATA);

  readonly items = signal<LoginHistoryItemDto[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.actionsService.loginHistory(this.data.sellerId, this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.totalPages.set(res.totalPages);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load login history.');
        this.loading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  /** Coarse device/browser hint parsed from the raw user-agent string — good enough for an admin glance, not a full UA-parsing library. */
  deviceLabel(userAgent: string | null): string {
    if (!userAgent) {
      return 'Unknown device';
    }
    const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser';
    const os = /Windows/.test(userAgent) ? 'Windows' : /Mac OS/.test(userAgent) ? 'macOS' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Linux/.test(userAgent) ? 'Linux' : '';
    return os ? `${browser} on ${os}` : browser;
  }

  close(): void {
    this.dialogRef.close();
  }
}
