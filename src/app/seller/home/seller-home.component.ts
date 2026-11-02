import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BankDetails, SellerProfile } from '../../core/models/seller-action.model';
import { KycSubmissionDto } from '../../core/models/kyc.model';
import { KycService } from '../../core/services/kyc.service';
import { SellerBalanceService } from '../../core/services/seller-balance.service';
import { SellerBankDetailsService } from '../../core/services/seller-bank-details.service';
import { SellerKycStatusService } from '../../core/services/seller-kyc-status.service';
import { SellerProfileService } from '../../core/services/seller-profile.service';
import { TokenService } from '../../core/services/token.service';
import { BankDetailsModalComponent, BankDetailsModalData, BankDetailsModalResult } from '../../shared/bank-details-modal/bank-details-modal.component';
import { ChangePasswordModalComponent } from '../../shared/change-password-modal/change-password-modal.component';
import { ChangeTransactionPasswordModalComponent } from '../../shared/change-transaction-password-modal/change-transaction-password-modal.component';
import { FileUploadComponent } from '../../shared/file-upload/file-upload.component';
import { SellerProfileModalComponent, SellerProfileModalData, SellerProfileModalResult } from '../../shared/seller-profile-modal/seller-profile-modal.component';
import { TransactionPasswordModalComponent, TransactionPasswordModalResult } from '../../shared/transaction-password-modal/transaction-password-modal.component';

@Component({
  selector: 'app-seller-home',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FileUploadComponent,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    RouterLink
  ],
  templateUrl: './seller-home.component.html',
  styleUrl: './seller-home.component.scss'
})
export class SellerHomeComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly bankDetailsService = inject(SellerBankDetailsService);
  private readonly profileService = inject(SellerProfileService);
  private readonly kycService = inject(KycService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  readonly tokenService = inject(TokenService);
  readonly sellerBalanceService = inject(SellerBalanceService);
  readonly kycStatusService = inject(SellerKycStatusService);

  readonly profile = signal<SellerProfile | null>(null);
  readonly profileLoading = signal(true);
  readonly profileError = signal<string | null>(null);

  // Live-updating (SignalR "SellerProfileUpdated"), unlike `profile` above which is a one-time
  // fetch from SellerProfileService — an admin changing these should reflect here without a refresh.
  readonly isVerified = this.sellerBalanceService.isVerified;
  readonly rating = this.sellerBalanceService.rating;
  readonly creditScore = this.sellerBalanceService.creditScore;
  // Account Status pill (Active/Pending Kyc/Suspended) — same live signal the sidebar's lock icon
  // already reads, kept in sync by SellerKycStatusService's own SignalR listener.
  readonly accountStatus = this.kycStatusService.status;

  // Collapsed by default (matches the reference's settings-menu layout) — the "Verify" row toggles
  // this to reveal the existing KYC status/resubmission card below, in place, no new routing.
  readonly verifyExpanded = signal(false);

  readonly bankDetails = signal<BankDetails | null>(null);
  readonly bankDetailsLoading = signal(true);
  readonly bankDetailsError = signal<string | null>(null);
  readonly transactionPasswordError = signal<string | null>(null);

  readonly kycSubmission = signal<KycSubmissionDto | null>(null);
  readonly kycLoading = signal(true);
  readonly kycFrontFile = signal<File | null>(null);
  readonly kycBackFile = signal<File | null>(null);
  readonly kycSubmitting = signal(false);
  readonly kycError = signal<string | null>(null);
  readonly kycSuccessMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.loadProfile();
    this.loadBankDetails();
    this.loadKyc();
  }

  loadProfile(): void {
    this.profileLoading.set(true);
    this.profileError.set(null);
    this.profileService.get().subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.profileLoading.set(false);
      },
      error: () => {
        this.profileError.set('Failed to load seller details.');
        this.profileLoading.set(false);
      }
    });
  }

  editProfile(): void {
    const current = this.profile();
    if (!current) {
      return;
    }

    const data: SellerProfileModalData = { initial: current };

    this.dialog
      .open<SellerProfileModalComponent, SellerProfileModalData, SellerProfileModalResult>(SellerProfileModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.profileError.set(null);
        this.profileService.update(result).subscribe({
          next: (updated) => this.profile.set(updated),
          error: (err) => this.profileError.set(err.error?.error ?? 'Failed to update seller details.')
        });
      });
  }

  loadBankDetails(): void {
    this.bankDetailsLoading.set(true);
    this.bankDetailsError.set(null);
    this.bankDetailsService.get().subscribe({
      next: (details) => {
        this.bankDetails.set(details);
        this.bankDetailsLoading.set(false);
      },
      error: () => {
        this.bankDetailsError.set('Failed to load bank details.');
        this.bankDetailsLoading.set(false);
      }
    });
  }

  editBankDetails(): void {
    const current = this.bankDetails();
    const data: BankDetailsModalData = {
      title: 'Bank Account Details',
      initial: current ?? { accountHolderName: null, bankName: null, accountNumber: null, iban: null, hasTransactionPassword: false },
      requireReason: false
    };

    this.dialog
      .open<BankDetailsModalComponent, BankDetailsModalData, BankDetailsModalResult>(BankDetailsModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.bankDetailsService
          .update({ accountHolderName: result.accountHolderName, bankName: result.bankName, accountNumber: result.accountNumber, iban: result.iban })
          .subscribe({
            next: (updated) => this.bankDetails.set(updated),
            error: () => this.bankDetailsError.set('Failed to update bank details.')
          });
      });
  }

  /** Only for the first-time set (no transaction password on the account yet) — nothing to verify against. Once one is set, the "Change" button routes to changeTransactionPassword() instead, which requires the current one. */
  setTransactionPassword(): void {
    this.dialog
      .open<TransactionPasswordModalComponent, undefined, TransactionPasswordModalResult>(TransactionPasswordModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel'
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.transactionPasswordError.set(null);
        this.bankDetailsService.setTransactionPassword(result).subscribe({
          next: (updated) => {
            this.bankDetails.set(updated);
            this.snackBar.open('Transaction password set successfully.', undefined, { duration: 3000 });
          },
          error: (err) => this.transactionPasswordError.set(err.error?.error ?? 'Failed to update transaction password.')
        });
      });
  }

  changePassword(): void {
    this.dialog
      .open<ChangePasswordModalComponent, undefined, boolean>(ChangePasswordModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel'
      })
      .afterClosed()
      .subscribe((success) => {
        if (success) {
          this.snackBar.open('Password changed successfully.', undefined, { duration: 3000 });
        }
      });
  }

  /** The transaction password is already set — this requires and verifies the CURRENT one, unlike setTransactionPassword() above. The modal itself owns submission/error display (it needs a server round trip to know whether the current password was right), so it only ever closes with either the updated BankDetails (success) or undefined (cancelled). */
  changeTransactionPassword(): void {
    this.dialog
      .open<ChangeTransactionPasswordModalComponent, undefined, BankDetails>(ChangeTransactionPasswordModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel'
      })
      .afterClosed()
      .subscribe((updated) => {
        if (!updated) {
          return;
        }
        this.bankDetails.set(updated);
        this.snackBar.open('Transaction password changed successfully.', undefined, { duration: 3000 });
      });
  }

  logout(): void {
    this.authService.logout().subscribe(() => this.router.navigateByUrl('/seller/login'));
  }

  toggleVerify(): void {
    this.verifyExpanded.update((v) => !v);
  }

  statusLabel(status: string | null): string {
    if (!status) {
      return '';
    }
    return status.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  loadKyc(): void {
    this.kycLoading.set(true);
    this.kycService.getStatus().subscribe({
      next: (submission) => {
        this.kycSubmission.set(submission);
        this.kycLoading.set(false);
      },
      // A seller with no submission yet (shouldn't happen post-signup) gets a 404 — treat as "nothing to show" rather than an error.
      error: () => this.kycLoading.set(false)
    });
  }

  onKycFrontSelected(files: File[]): void {
    const file = files[0];
    if (file) {
      this.kycFrontFile.set(file);
    }
  }

  onKycFrontRemoved(): void {
    this.kycFrontFile.set(null);
  }

  onKycBackSelected(files: File[]): void {
    const file = files[0];
    if (file) {
      this.kycBackFile.set(file);
    }
  }

  onKycBackRemoved(): void {
    this.kycBackFile.set(null);
  }

  readonly kycResubmitValid = () => this.kycFrontFile() !== null && this.kycBackFile() !== null;

  submitKycResubmission(): void {
    if (!this.kycResubmitValid() || this.kycSubmitting()) {
      return;
    }

    this.kycSubmitting.set(true);
    this.kycError.set(null);
    this.kycSuccessMessage.set(null);

    this.kycService.upload([this.kycFrontFile()!, this.kycBackFile()!]).subscribe({
      next: () => {
        this.kycSubmitting.set(false);
        this.kycFrontFile.set(null);
        this.kycBackFile.set(null);
        this.kycSuccessMessage.set('Your documents were resubmitted and are now under review.');
        this.loadKyc();
      },
      error: (err) => {
        this.kycSubmitting.set(false);
        this.kycError.set(err.error?.error ?? 'Failed to resubmit KYC documents.');
      }
    });
  }
}
