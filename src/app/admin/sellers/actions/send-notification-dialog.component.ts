import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AdminSellerActionsService } from '../../../core/services/admin-seller-actions.service';

export interface SendNotificationDialogData {
  sellerId: number;
  sellerName: string;
}

/** POST admin/sellers/{id}/notify — an ad-hoc admin message that flows through the same NotifyAsync pipeline/seller-side NotificationBellComponent as every other notification type. */
@Component({
  selector: 'app-send-notification-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule],
  templateUrl: './send-notification-dialog.component.html',
  styleUrl: './action-dialog.scss'
})
export class SendNotificationDialogComponent {
  private readonly actionsService = inject(AdminSellerActionsService);
  readonly dialogRef = inject(MatDialogRef<SendNotificationDialogComponent>);
  readonly data = inject<SendNotificationDialogData>(MAT_DIALOG_DATA);

  readonly title = signal('');
  readonly body = signal('');
  readonly linkUrl = signal('');
  readonly sending = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly canSend = () => this.title().trim().length > 0 && this.body().trim().length > 0 && !this.sending();

  send(): void {
    if (!this.canSend()) {
      return;
    }

    this.sending.set(true);
    this.errorMessage.set(null);
    this.actionsService.notify(this.data.sellerId, { title: this.title().trim(), body: this.body().trim(), linkUrl: this.linkUrl().trim() || null }).subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.sending.set(false);
        this.errorMessage.set(err.error?.error ?? 'Failed to send notification.');
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
