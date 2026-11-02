import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepperModule } from '@angular/material/stepper';
import { Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { SellerOnboardingService } from '../../core/services/seller-onboarding.service';
import { FileUploadComponent } from '../../shared/file-upload/file-upload.component';
import { passwordsMatchValidator } from '../../shared/validators/password-match.validator';

type InviteStatus = 'idle' | 'checking' | 'valid' | 'invalid';

@Component({
  selector: 'app-seller-signup',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FileUploadComponent
  ],
  templateUrl: './seller-signup.component.html',
  styleUrl: './seller-signup.component.scss'
})
export class SellerSignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly sellerOnboardingService = inject(SellerOnboardingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);

  // A horizontal mat-stepper's step-icon/label header overflows/crops on 320-430px screens —
  // Material's own vertical mode is the built-in fix, so switch to it below the tablet breakpoint
  // rather than fighting the horizontal header's layout with custom CSS.
  readonly stepperOrientation = toSignal(
    this.breakpointObserver.observe('(max-width: 640px)').pipe(map((r) => (r.matches ? 'vertical' : 'horizontal'))),
    { initialValue: 'horizontal' as const }
  );

  readonly accountForm = this.fb.nonNullable.group(
    {
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      invitationCode: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    },
    { validators: passwordsMatchValidator('password', 'confirmPassword') }
  );

  readonly storeForm = this.fb.nonNullable.group({
    storeName: ['', Validators.required]
  });

  readonly inviteStatus = signal<InviteStatus>('idle');
  readonly inviteMessage = signal<string | null>(null);
  readonly hidePassword = signal(true);
  readonly hideConfirmPassword = signal(true);

  readonly idFrontFile = signal<File | null>(null);
  readonly idBackFile = signal<File | null>(null);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly features = [
    { icon: 'local_shipping', text: 'Zero inventory dropshipping' },
    { icon: 'payments', text: 'Fast, on-demand payouts' },
    { icon: 'insights', text: 'Live order and revenue analytics' }
  ];

  constructor() {
    this.accountForm.controls.invitationCode.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        tap((code) => this.inviteStatus.set(code ? 'checking' : 'idle')),
        switchMap((code) => {
          if (!code) {
            return of(null);
          }
          return this.authService
            .validateInvite(code)
            .pipe(catchError(() => of({ valid: false, message: 'Could not validate this code right now.' })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        const control = this.accountForm.controls.invitationCode;

        if (res === null) {
          this.inviteStatus.set('idle');
          this.inviteMessage.set(null);
          this.clearInviteError(control);
          return;
        }

        this.inviteStatus.set(res.valid ? 'valid' : 'invalid');
        this.inviteMessage.set(res.message);

        if (res.valid) {
          this.clearInviteError(control);
        } else {
          // Set a real form-control error (not just the `inviteStatus` signal) so
          // mat-form-field's own errorState recognizes it and actually renders the
          // <mat-error> — otherwise Material silently hides it and the disabled
          // Continue button has no visible explanation.
          control.setErrors({ ...control.errors, inviteInvalid: true });
          control.markAsTouched();
        }
      });
  }

  private clearInviteError(control: FormControl<string>): void {
    if (control.hasError('inviteInvalid')) {
      const { inviteInvalid, ...rest } = control.errors ?? {};
      control.setErrors(Object.keys(rest).length ? rest : null);
    }
  }

  onFrontFileSelected(files: File[]): void {
    const file = files[0];
    if (file) {
      this.idFrontFile.set(file);
    }
  }

  onFrontFileRemoved(): void {
    this.idFrontFile.set(null);
  }

  onBackFileSelected(files: File[]): void {
    const file = files[0];
    if (file) {
      this.idBackFile.set(file);
    }
  }

  onBackFileRemoved(): void {
    this.idBackFile.set(null);
  }

  /** Both sides are mandatory — KYC upload can no longer be skipped, so this gates the Finish button the same way the other steps gate Continue. */
  readonly kycFilesValid = () => this.idFrontFile() !== null && this.idBackFile() !== null;

  finish(): void {
    const inviteBlocking = this.inviteStatus() === 'checking' || this.inviteStatus() === 'invalid';
    if (this.accountForm.invalid || this.storeForm.invalid || inviteBlocking || !this.kycFilesValid()) {
      this.accountForm.markAllAsTouched();
      this.storeForm.markAllAsTouched();
      return;
    }

    if (this.submitting()) {
      return; // a request is already in flight — ignore extra Finish clicks
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { name, email, password, invitationCode } = this.accountForm.getRawValue();
    const { storeName } = this.storeForm.getRawValue();

    this.sellerOnboardingService
      .completeApplication({
        name,
        email,
        password,
        storeName,
        invitationCode: invitationCode || null,
        idFrontFile: this.idFrontFile()!,
        idBackFile: this.idBackFile()!
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          // Logged in immediately even though KYC is still pending — the seller portal shell
          // shows a blocking KYC-pending modal and the backend's KycApproved policy rejects any
          // write action until an admin approves, so a working session here is safe.
          this.authService.applyAuthResponse(res);
          this.router.navigateByUrl('/seller/dashboard');
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(err.error?.error ?? 'Something went wrong. Please try again.');
        }
      });
  }
}
