import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface RejectReasonDialogData {
  title?: string;
  reasonLabel?: string;
  placeholder?: string;
  confirmLabel?: string;
}

/** Generic "reject with a reason" confirmation dialog — used by KYC review and top-up review (and any future review-with-reason flow) so this modal only exists once. */
@Component({
  selector: 'app-reject-reason-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ reasonLabel }}</mat-label>
        <textarea matInput rows="3" [(ngModel)]="reason" [placeholder]="placeholder"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!reason.trim()" (click)="dialogRef.close(reason)">{{ confirmLabel }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .full-width {
      // No min-width here — this dialog is opened at a fixed desktop width (e.g. 420px) by its
      // callers, but Angular Material's CDK overlay caps that down on narrow viewports; a min-width
      // wider than that capped panel forced this field (and the dialog's own content box) to overflow
      // horizontally on mobile. width:100% alone already fills whatever width the dialog actually has.
      width: 100%;
    }
  `
})
export class RejectReasonDialogComponent {
  readonly dialogRef = inject(MatDialogRef<RejectReasonDialogComponent>);
  private readonly data = inject<RejectReasonDialogData>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  readonly title = this.data.title ?? 'Reject KYC submission';
  readonly reasonLabel = this.data.reasonLabel ?? 'Reason';
  readonly placeholder = this.data.placeholder ?? 'Why is this submission being rejected?';
  readonly confirmLabel = this.data.confirmLabel ?? 'Reject';

  reason = '';
}
