/** Editable Name/Email alongside read-only Username/Role/CreatedDate; InvitationCodesCreated is a
 * count of codes this admin has generated for sellers (admins aren't themselves created via an
 * invitation code, so there's no "code used to create this admin" to show). */
export interface AdminProfile {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
  role: string;
  invitationCodesCreated: number;
  createdDate: string;
  hasTransactionPassword: boolean;
}

export interface AdminProfileUpdateRequest {
  name: string | null;
  email: string | null;
}

export interface AdminChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface AdminSetTransactionPasswordRequest {
  password: string;
  confirmPassword: string;
}

export interface AdminChangeTransactionPasswordRequest {
  oldPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/** Bank and E Vault are the same underlying record shape, distinguished only by this discriminator —
 * each keeps its own independent "default" (see AdminProfileController.SetDefaultBankAccount). */
export type BankAccountType = 'Bank' | 'EVault';

/** Unlike a seller's single bank-details record, an admin can hold multiple payout accounts —
 * isDefault marks which one is currently active (independently per accountType). */
export interface AdminBankAccount {
  id: number;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  iban: string | null;
  isDefault: boolean;
  accountType: BankAccountType;
}

export interface AdminBankAccountRequest {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  iban: string | null;
  accountType: BankAccountType;
}
