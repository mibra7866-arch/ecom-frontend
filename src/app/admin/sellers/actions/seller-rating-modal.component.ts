import { Component, inject, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface SellerRatingModalData {
  storeName: string;
  currentRating: number | null;
}

export interface SellerRatingModalResult {
  rating: number;
  reason: string;
}

/** Sets the seller's Shop Rating (1-5 stars, half-point increments) — a manual admin override, not a
 * computed average (SellersService.updateRating already existed; this is its first UI). Each star is
 * two half-width click targets so the seller can land on either a whole or half value directly. */
@Component({
  selector: 'app-seller-rating-modal',
  standalone: true,
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './seller-rating-modal.component.html',
  styleUrl: './seller-rating-modal.component.scss'
})
export class SellerRatingModalComponent {
  readonly dialogRef = inject(MatDialogRef<SellerRatingModalComponent, SellerRatingModalResult>);
  readonly data = inject<SellerRatingModalData>(MAT_DIALOG_DATA);

  readonly stars = [0, 1, 2, 3, 4];
  readonly rating = signal<number>(this.data.currentRating ?? 0);
  readonly reason = signal('');

  readonly icons = computed<string[]>(() => {
    const value = this.rating();
    return this.stars.map((i) => {
      const threshold = i + 1;
      if (value >= threshold) return 'star';
      if (value >= threshold - 0.5) return 'star_half';
      return 'star_border';
    });
  });

  readonly canApply = () => this.rating() > 0 && this.reason().trim().length > 0;

  setStar(index: number, half: 'left' | 'right'): void {
    this.rating.set(half === 'left' ? index + 0.5 : index + 1);
  }

  apply(): void {
    if (!this.canApply()) {
      return;
    }
    this.dialogRef.close({ rating: this.rating(), reason: this.reason().trim() });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
