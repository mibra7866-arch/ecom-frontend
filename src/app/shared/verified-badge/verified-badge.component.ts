import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** The one blue-tick rendering, reused everywhere a seller's name is displayed — driven entirely by
 * Seller.IsVerified (set only by AdminKycController.Review), never seller-editable. Renders nothing
 * when not verified, so callers can drop it in unconditionally next to any seller name. */
@Component({
  selector: 'app-verified-badge',
  standalone: true,
  imports: [MatIconModule],
  template: `@if (verified) {
    <mat-icon class="verified-badge" title="Verified seller">verified</mat-icon>
  }`,
  styleUrl: './verified-badge.component.scss'
})
export class VerifiedBadgeComponent {
  @Input() verified = false;
}
