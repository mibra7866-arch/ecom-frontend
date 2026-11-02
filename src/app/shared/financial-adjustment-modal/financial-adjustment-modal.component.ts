import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface FinancialAdjustmentModalData {
  title: string;
  fieldLabel: string;
  currentValue: number;
}

export interface FinancialAdjustmentModalResult {
  amount: number;
  reason: string;
}

/** One modal reused for both "Adjust Balance" and "Guarantee Money" — same add/deduct + amount + reason pattern, only the title/fieldLabel/currentValue differ per caller. */
@Component({
  selector: 'app-financial-adjustment-modal',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, MatDialogModule],
  templateUrl: './financial-adjustment-modal.component.html',
  styleUrl: './financial-adjustment-modal.component.scss'
})
export class FinancialAdjustmentModalComponent {
  readonly dialogRef = inject(MatDialogRef<FinancialAdjustmentModalComponent, FinancialAdjustmentModalResult>);
  readonly data = inject<FinancialAdjustmentModalData>(MAT_DIALOG_DATA);

  readonly direction = signal<'add' | 'deduct'>('add');
  readonly amount = signal<number | null>(null);
  readonly reason = signal('');

  readonly canApply = () => (this.amount() ?? 0) > 0 && this.reason().trim().length > 0;

  readonly resultingValue = () => {
    const delta = (this.amount() ?? 0) * (this.direction() === 'add' ? 1 : -1);
    return this.data.currentValue + delta;
  };

  onAmountInput(value: string): void {
    const parsed = Number(value);
    this.amount.set(Number.isFinite(parsed) && value.trim() !== '' ? parsed : null);
  }

  apply(): void {
    if (!this.canApply()) {
      return;
    }

    const signedAmount = (this.amount() ?? 0) * (this.direction() === 'add' ? 1 : -1);
    this.dialogRef.close({ amount: signedAmount, reason: this.reason().trim() });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
