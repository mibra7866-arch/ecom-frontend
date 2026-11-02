import { Component, OnInit, WritableSignal, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminProfileService } from '../../core/services/admin-profile.service';
import { AdminBankAccount, AdminProfile, BankAccountType } from '../../core/models/admin-profile.model';
import { BankDetails } from '../../core/models/seller-action.model';
import {
  AdminProfileModalComponent,
  AdminProfileModalData,
  AdminProfileModalResult
} from '../../shared/admin-profile-modal/admin-profile-modal.component';
import {
  BankDetailsModalComponent,
  BankDetailsModalData,
  BankDetailsModalResult
} from '../../shared/bank-details-modal/bank-details-modal.component';

/** Wording/labels that differ between the Bank and E Vault sections — everything else about the
 * add/edit/set-default flow is identical, driven off this one table instead of duplicating the flow
 * per type. E Vault has no IBAN equivalent, so its form hides that field entirely. */
const ACCOUNT_TYPE_CONFIG: Record<
  BankAccountType,
  {
    noun: string;
    addTitle: string;
    editTitle: string;
    subtitle?: string;
    providerLabel?: string;
    accountNumberLabel?: string;
    showIban?: boolean;
    accountNumberDigitsOnly?: boolean;
  }
> = {
  Bank: { noun: 'bank account', addTitle: 'Add Bank Account', editTitle: 'Edit Bank Account' },
  EVault: {
    noun: 'E Vault',
    addTitle: 'Add E Vault',
    editTitle: 'Edit E Vault',
    subtitle: 'This is where E Vault payout details are saved.',
    providerLabel: 'E Vault Provider',
    accountNumberLabel: 'Wallet / Mobile Number',
    showIban: false,
    // A wallet address (e.g. a TRC20 address) is alphanumeric, not digits-only like a bank account/
    // phone number — Bank keeps the original digits-only requirement (default, omitted here).
    accountNumberDigitsOnly: false
  }
};

/**
 * Admin Portal → Profile: the admin's own information, payout accounts (multiple, with an
 * independent default per type — see AdminBankAccount/BankAccountType), login password, and
 * transaction password. Bank Accounts and E Vault are the same underlying record shape/endpoints,
 * split into two sections purely by AdminBankAccount.accountType (see ACCOUNT_TYPE_CONFIG above) —
 * one fetch, one add/edit/set-default flow, reused for both rather than two parallel implementations.
 */
@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin-profile.component.html',
  styleUrl: './admin-profile.component.scss'
})
export class AdminProfileComponent implements OnInit {
  private readonly profileService = inject(AdminProfileService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly profile = signal<AdminProfile | null>(null);
  readonly profileLoading = signal(true);
  readonly profileError = signal<string | null>(null);

  /** Both Bank and E Vault accounts, fetched together in one call — bankAccounts/eVaultAccounts below
   * are just this same list filtered by type. */
  readonly allAccounts = signal<AdminBankAccount[]>([]);
  readonly accountsLoading = signal(true);
  /** Set only when the shared list fetch itself fails — shown in both sections since neither loaded. */
  readonly accountsError = signal<string | null>(null);

  readonly bankAccounts = computed(() => this.allAccounts().filter((a) => a.accountType === 'Bank'));
  readonly eVaultAccounts = computed(() => this.allAccounts().filter((a) => a.accountType === 'EVault'));

  /** Add/edit/set-default failures, kept separate per section so an E Vault error never appears under
   * Bank Accounts and vice versa. */
  private readonly accountActionErrors: Record<BankAccountType, WritableSignal<string | null>> = {
    Bank: signal<string | null>(null),
    EVault: signal<string | null>(null)
  };
  readonly bankAccountsError = this.accountActionErrors.Bank;
  readonly eVaultAccountsError = this.accountActionErrors.EVault;

  // ---------- Change password (inline form) ----------
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmNewPassword = signal('');
  readonly passwordSaving = signal(false);
  readonly passwordError = signal<string | null>(null);

  // ---------- Transaction password (inline form; Set on first use, Change once one exists) ----------
  readonly currentTxnPassword = signal('');
  readonly newTxnPassword = signal('');
  readonly confirmNewTxnPassword = signal('');
  readonly txnPasswordSaving = signal(false);
  readonly txnPasswordError = signal<string | null>(null);

  readonly hasTransactionPassword = computed(() => this.profile()?.hasTransactionPassword ?? false);

  ngOnInit(): void {
    this.loadProfile();
    this.loadAccounts();
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
        this.profileError.set('Failed to load profile.');
        this.profileLoading.set(false);
      }
    });
  }

  editProfile(): void {
    const current = this.profile();
    if (!current) {
      return;
    }

    const data: AdminProfileModalData = { initial: current };

    this.dialog
      .open<AdminProfileModalComponent, AdminProfileModalData, AdminProfileModalResult>(AdminProfileModalComponent, {
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
          next: (updated) => {
            this.profile.set(updated);
            this.snackBar.open('Profile updated.', undefined, { duration: 3000 });
          },
          error: (err) => this.profileError.set(err.error?.error ?? 'Failed to update profile.')
        });
      });
  }

  // ---------- Bank accounts / E Vault (same records, same endpoints, split by accountType) ----------

  loadAccounts(): void {
    this.accountsLoading.set(true);
    this.accountsError.set(null);
    this.profileService.listBankAccounts().subscribe({
      next: (accounts) => {
        this.allAccounts.set(accounts);
        this.accountsLoading.set(false);
      },
      error: () => {
        this.accountsError.set('Failed to load accounts.');
        this.accountsLoading.set(false);
      }
    });
  }

  addAccount(type: BankAccountType): void {
    const config = ACCOUNT_TYPE_CONFIG[type];
    this.openAccountModal(type, config.addTitle, {
      accountHolderName: null,
      bankName: null,
      accountNumber: null,
      iban: null,
      hasTransactionPassword: false
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.accountActionErrors[type].set(null);
      this.profileService
        .addBankAccount({ accountHolderName: result.accountHolderName, bankName: result.bankName, accountNumber: result.accountNumber, iban: result.iban, accountType: type })
        .subscribe({
          next: (added) => {
            this.allAccounts.update((accounts) => [...accounts, added]);
            this.snackBar.open(`${config.noun[0].toUpperCase()}${config.noun.slice(1)} added.`, undefined, { duration: 3000 });
          },
          error: (err) => this.accountActionErrors[type].set(err.error?.error ?? `Failed to add ${config.noun}.`)
        });
    });
  }

  editAccount(account: AdminBankAccount): void {
    const type = account.accountType;
    const config = ACCOUNT_TYPE_CONFIG[type];
    this.openAccountModal(type, config.editTitle, {
      accountHolderName: account.accountHolderName,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      iban: account.iban,
      hasTransactionPassword: false
    }).subscribe((result) => {
      if (!result) {
        return;
      }
      this.accountActionErrors[type].set(null);
      this.profileService
        .updateBankAccount(account.id, { accountHolderName: result.accountHolderName, bankName: result.bankName, accountNumber: result.accountNumber, iban: result.iban, accountType: type })
        .subscribe({
          next: (updated) => {
            this.allAccounts.update((accounts) => accounts.map((a) => (a.id === updated.id ? updated : a)));
            this.snackBar.open(`${config.noun[0].toUpperCase()}${config.noun.slice(1)} updated.`, undefined, { duration: 3000 });
          },
          error: (err) => this.accountActionErrors[type].set(err.error?.error ?? `Failed to update ${config.noun}.`)
        });
    });
  }

  setDefaultAccount(account: AdminBankAccount): void {
    if (account.isDefault) {
      return;
    }
    const type = account.accountType;
    this.accountActionErrors[type].set(null);
    this.profileService.setDefaultBankAccount(account.id).subscribe({
      next: (accounts) => {
        // The response is every account for this admin (both types) — same shape as the initial list
        // fetch, so it can just replace allAccounts wholesale rather than merging.
        this.allAccounts.set(accounts);
        this.snackBar.open(`${account.bankName} set as default.`, undefined, { duration: 3000 });
      },
      error: (err) => this.accountActionErrors[type].set(err.error?.error ?? `Failed to set default ${ACCOUNT_TYPE_CONFIG[type].noun}.`)
    });
  }

  private openAccountModal(type: BankAccountType, title: string, initial: BankDetails) {
    const config = ACCOUNT_TYPE_CONFIG[type];
    const data: BankDetailsModalData = {
      title,
      initial,
      requireReason: false,
      subtitle: config.subtitle,
      providerLabel: config.providerLabel,
      accountNumberLabel: config.accountNumberLabel,
      showIban: config.showIban,
      accountNumberDigitsOnly: config.accountNumberDigitsOnly
    };
    return this.dialog
      .open<BankDetailsModalComponent, BankDetailsModalData, BankDetailsModalResult>(BankDetailsModalComponent, {
        width: '440px',
        panelClass: 'seller-catalog-dialog-panel',
        data
      })
      .afterClosed();
  }

  // ---------- Change password ----------

  readonly canSavePassword = () =>
    this.newPassword().length >= 8 && this.newPassword() === this.confirmNewPassword() && this.currentPassword().length > 0 && !this.passwordSaving();

  changePassword(): void {
    if (!this.canSavePassword()) {
      return;
    }
    this.passwordSaving.set(true);
    this.passwordError.set(null);
    this.profileService
      .changePassword({ oldPassword: this.currentPassword(), newPassword: this.newPassword(), confirmNewPassword: this.confirmNewPassword() })
      .subscribe({
        next: () => {
          this.passwordSaving.set(false);
          this.currentPassword.set('');
          this.newPassword.set('');
          this.confirmNewPassword.set('');
          this.snackBar.open('Password changed successfully.', undefined, { duration: 3000 });
        },
        error: (err) => {
          this.passwordSaving.set(false);
          this.passwordError.set(err.error?.error ?? 'Failed to change password.');
        }
      });
  }

  // ---------- Transaction password ----------

  readonly canSaveTxnPassword = () =>
    this.newTxnPassword().length >= 8 &&
    this.newTxnPassword() === this.confirmNewTxnPassword() &&
    (!this.hasTransactionPassword() || this.currentTxnPassword().length > 0) &&
    !this.txnPasswordSaving();

  saveTransactionPassword(): void {
    if (!this.canSaveTxnPassword()) {
      return;
    }
    this.txnPasswordSaving.set(true);
    this.txnPasswordError.set(null);

    const request$ = this.hasTransactionPassword()
      ? this.profileService.changeTransactionPassword({
          oldPassword: this.currentTxnPassword(),
          newPassword: this.newTxnPassword(),
          confirmNewPassword: this.confirmNewTxnPassword()
        })
      : this.profileService.setTransactionPassword({ password: this.newTxnPassword(), confirmPassword: this.confirmNewTxnPassword() });

    request$.subscribe({
      next: () => {
        this.txnPasswordSaving.set(false);
        this.currentTxnPassword.set('');
        this.newTxnPassword.set('');
        this.confirmNewTxnPassword.set('');
        this.profile.update((p) => (p ? { ...p, hasTransactionPassword: true } : p));
        this.snackBar.open('Transaction password saved.', undefined, { duration: 3000 });
      },
      error: (err) => {
        this.txnPasswordSaving.set(false);
        this.txnPasswordError.set(err.error?.error ?? 'Failed to save transaction password.');
      }
    });
  }
}
