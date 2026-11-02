import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface SellerCreditScoreModalData {
  storeName: string;
  currentScore: number;
}

export interface SellerCreditScoreModalResult {
  creditScore: number;
  reason: string;
}

/** Sets the seller's absolute Credit Score (0-100) — a manual admin override, like the Rating action
 * next to it. Below 90 blocks the seller's withdrawals (enforced server-side in SellerWithdrawController). */
@Component({
  selector: 'app-seller-credit-score-modal',
  standalone: true,
  imports: [FormsModule, MatDialogModule],
  templateUrl: './seller-credit-score-modal.component.html',
  styleUrl: './seller-credit-score-modal.component.scss'
})
export class SellerCreditScoreModalComponent {
  readonly dialogRef = inject(MatDialogRef<SellerCreditScoreModalComponent, SellerCreditScoreModalResult>);
  readonly data = inject<SellerCreditScoreModalData>(MAT_DIALOG_DATA);

  readonly score = signal<number | null>(this.data.currentScore);
  readonly reason = signal('');

  readonly canApply = () => {
    const score = this.score();
    return score !== null && score >= 0 && score <= 100 && this.reason().trim().length > 0;
  };

  onScoreInput(value: string): void {
    const parsed = Number(value);
    this.score.set(Number.isFinite(parsed) && value.trim() !== '' ? Math.trunc(parsed) : null);
  }

  apply(): void {
    if (!this.canApply()) {
      return;
    }
    this.dialogRef.close({ creditScore: this.score()!, reason: this.reason().trim() });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
