import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CreateAdminRequest } from '../../core/models/admin.model';

@Component({
  selector: 'app-create-admin-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Create admin</h2>
    <mat-dialog-content [formGroup]="form" class="form">
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Username</mat-label>
        <input matInput formControlName="username" />
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Password</mat-label>
        <input matInput type="password" formControlName="password" />
        @if (form.controls.password.invalid && form.controls.password.touched) {
          <mat-error>Password must be at least 8 characters</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Name (optional)</mat-label>
        <input matInput formControlName="name" />
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Email (optional)</mat-label>
        <input matInput type="email" formControlName="email" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid" (click)="submit()">Create</button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .full-width {
      width: 100%;
      min-width: 360px;
    }
  `
})
export class CreateAdminDialogComponent {
  readonly dialogRef = inject(MatDialogRef<CreateAdminDialogComponent>);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    name: [''],
    email: ['']
  });

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const request: CreateAdminRequest = {
      username: value.username.trim(),
      password: value.password,
      name: value.name.trim() ? value.name.trim() : null,
      email: value.email.trim() ? value.email.trim() : null
    };

    this.dialogRef.close(request);
  }
}
