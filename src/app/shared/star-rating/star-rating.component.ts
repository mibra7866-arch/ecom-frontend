import { Component, Input, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** The one rating-display implementation, reused everywhere a seller's rating is shown — renders as
 * e.g. "★★★★½ 4.5" (5 icons at star/star_half/star_border per half-point, then the numeric value).
 * Purely a display; setting the rating is an admin-only action elsewhere (SellersService.updateRating). */
@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [MatIconModule],
  template: `
    @if (ratingSignal(); as r) {
      <span class="star-rating">
        @for (icon of icons(); track $index) {
          <mat-icon class="star-rating__star">{{ icon }}</mat-icon>
        }
        <span class="star-rating__value">{{ r }}</span>
      </span>
    } @else {
      <span class="star-rating star-rating--empty">Not rated</span>
    }
  `,
  styleUrl: './star-rating.component.scss'
})
export class StarRatingComponent {
  protected readonly ratingSignal = signal<number | null>(null);

  @Input({ required: true }) set rating(value: number | null) {
    this.ratingSignal.set(value);
  }

  readonly icons = computed<string[]>(() => {
    const value = this.ratingSignal() ?? 0;
    return Array.from({ length: 5 }, (_, i) => {
      const threshold = i + 1;
      if (value >= threshold) return 'star';
      if (value >= threshold - 0.5) return 'star_half';
      return 'star_border';
    });
  });
}
