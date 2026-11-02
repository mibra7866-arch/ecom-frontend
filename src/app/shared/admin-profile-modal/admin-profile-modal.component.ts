import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AdminProfile } from '../../core/models/admin-profile.model';

export interface AdminProfileModalData {
  initial: AdminProfile;
}

export interface AdminProfileModalResult {
  name: string | null;
  email: string | null;
}

/** The admin's own edit of Name/Email — same visual/structural pattern as SellerProfileModalComponent. Both fields are optional, matching the nullable Admin.Name/Admin.Email columns (an admin created before this feature existed has neither set yet). Username/Role/invitation-code count stay read-only — this modal never touches them. */
@Component({
  selector: 'app-admin-profile-modal',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule],
  templateUrl: './admin-profile-modal.component.html',
  styleUrl: './admin-profile-modal.component.scss'
})
export class AdminProfileModalComponent {
  private readonly fb = inject(FormBuilder);
  readonly dialogRef = inject(MatDialogRef<AdminProfileModalComponent, AdminProfileModalResult>);
  readonly data = inject<AdminProfileModalData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.initial.name ?? ''],
    email: [this.data.initial.email ?? '', Validators.email]
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, email } = this.form.getRawValue();
    this.dialogRef.close({ name: name.trim() || null, email: email.trim() || null });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
