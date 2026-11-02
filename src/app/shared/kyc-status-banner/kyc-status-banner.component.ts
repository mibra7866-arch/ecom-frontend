import { Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { KycService } from '../../core/services/kyc.service';
import { KycSubmissionDto } from '../../core/models/kyc.model';

/**
 * Non-blocking status card — replaces the old full-screen KycPendingModalComponent now that only
 * Products/Orders are actually restricted, not the whole portal. Self-contained (fetches its own data)
 * so it can be dropped onto Dashboard without the host needing to know KYC details, but the host still
 * decides WHETHER to render it at all (only when SellerKycStatusService.status() !== 'Active') so an
 * approved seller never even sees the fetch happen.
 */
@Component({
  selector: 'app-kyc-status-banner',
  standalone: true,
  imports: [MatIconModule, RouterLink],
  templateUrl: './kyc-status-banner.component.html',
  styleUrl: './kyc-status-banner.component.scss'
})
export class KycStatusBannerComponent implements OnInit {
  private readonly kycService = inject(KycService);

  readonly submission = signal<KycSubmissionDto | null>(null);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.kycService.getStatus().subscribe({
      next: (submission) => {
        this.submission.set(submission);
        this.loading.set(false);
      },
      // A 404 (no submission at all) shouldn't happen post-signup, but degrade quietly rather than
      // showing an error banner for something the seller can't act on from here anyway.
      error: () => this.loading.set(false)
    });
  }
}
