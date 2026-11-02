import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PreLoginChatDialogComponent } from '../../shared/pre-login-chat-dialog/pre-login-chat-dialog.component';

@Component({
  selector: 'app-seller-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatIconModule, MatDialogModule],
  templateUrl: './seller-login.component.html',
  styleUrl: './seller-login.component.scss'
})
export class SellerLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  readonly submitted = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** 'KYC_PENDING' | 'KYC_REJECTED' | null — drives the "Chat with support" prompt next to the error banner. */
  readonly errorCode = signal<string | null>(null);
  readonly hidePassword = signal(true);

  readonly features = [
    { icon: 'trending_up', title: 'Track earnings', subtitle: 'Real-time profit dashboard' },
    { icon: 'account_balance_wallet', title: 'Easy payouts', subtitle: 'Withdraw to your account anytime' },
    { icon: 'headset_mic', title: 'Direct support', subtitle: 'Chat with our Support team' }
  ];

  submit(): void {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);
    this.errorMessage.set(null);
    this.errorCode.set(null);

    if (this.form.invalid) {
      return;
    }

    this.loading.set(true);
    this.authService.sellerLogin(this.form.getRawValue()).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/seller/dashboard');
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 429) {
          this.errorMessage.set('Too many login attempts. Please wait a moment and try again.');
          return;
        }
        this.errorCode.set(err.error?.errorCode ?? null);
        this.errorMessage.set(err.error?.error ?? 'Invalid email or password.');
      }
    });
  }

  openSupportChat(): void {
    this.dialog.open(PreLoginChatDialogComponent, {
      panelClass: 'pre-login-chat-dialog-panel',
      autoFocus: false
    });
  }
}
