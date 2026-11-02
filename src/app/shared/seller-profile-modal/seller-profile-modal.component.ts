import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { SellerProfile } from '../../core/models/seller-action.model';

export interface SellerProfileModalData {
  initial: SellerProfile;
}

export interface SellerProfileModalResult {
  name: string;
  email: string;
  storeName: string;
}

/** The seller's own edit of the identity fields collected at signup (Seller details + Store details steps) — same visual/structural pattern as BankDetailsModalComponent. */
@Component({
  selector: 'app-seller-profile-modal',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule],
  templateUrl: './seller-profile-modal.component.html',
  styleUrl: './seller-profile-modal.component.scss'
})
export class SellerProfileModalComponent {
  private readonly fb = inject(FormBuilder);
  readonly dialogRef = inject(MatDialogRef<SellerProfileModalComponent, SellerProfileModalResult>);
  readonly data = inject<SellerProfileModalData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.initial.name, Validators.required],
    email: [this.data.initial.email, [Validators.required, Validators.email]],
    storeName: [this.data.initial.storeName, Validators.required]
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, email, storeName } = this.form.getRawValue();
    this.dialogRef.close({ name, email, storeName });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
