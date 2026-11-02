import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ProductLimitModalData {
  storeName: string;
  currentLimit: number;
}

export interface ProductLimitModalResult {
  /** The absolute new limit (already resolved from the increase/decrease delta) — what ProductLimitUpdateRequest.Limit expects. */
  newLimit: number;
}

/**
 * Increase/decrease a single seller's product limit — an admin override on top of the store-wide
 * default (StoreSetupConfig.RequiredProductCount). Same add/deduct + resulting-value-preview shape as
 * FinancialAdjustmentModalComponent, minus currency formatting and the required reason (the backend's
 * ProductLimitUpdateRequest has no reason field).
 */
@Component({
  selector: 'app-product-limit-modal',
  standalone: true,
  imports: [FormsModule, MatDialogModule],
  templateUrl: './product-limit-modal.component.html',
  styleUrl: './product-limit-modal.component.scss'
})
export class ProductLimitModalComponent {
  readonly dialogRef = inject(MatDialogRef<ProductLimitModalComponent, ProductLimitModalResult>);
  readonly data = inject<ProductLimitModalData>(MAT_DIALOG_DATA);

  readonly direction = signal<'increase' | 'decrease'>('increase');
  readonly amount = signal<number | null>(null);

  readonly resultingValue = () => {
    const delta = (this.amount() ?? 0) * (this.direction() === 'increase' ? 1 : -1);
    return this.data.currentLimit + delta;
  };

  readonly canApply = () => (this.amount() ?? 0) > 0 && this.resultingValue() >= 0;

  onAmountInput(value: string): void {
    const parsed = Number(value);
    this.amount.set(Number.isFinite(parsed) && value.trim() !== '' ? Math.trunc(parsed) : null);
  }

  apply(): void {
    if (!this.canApply()) {
      return;
    }
    this.dialogRef.close({ newLimit: this.resultingValue() });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
