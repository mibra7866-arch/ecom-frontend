import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MyInvitationCodeDto } from '../../core/models/invitation.model';
import { InvitationsService } from '../../core/services/invitations.service';
import {
  ConfirmationModalComponent,
  ConfirmationModalData,
  ConfirmationModalResult
} from '../../shared/confirmation-modal/confirmation-modal.component';

/**
 * Every admin has exactly one permanent, reusable invitation code (see AdminInvitationsController) —
 * this is a single-code card, not a list. Replaces the old multi-code generator table.
 */
@Component({
  selector: 'app-invitations-list',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatDialogModule, MatProgressSpinnerModule],
  templateUrl: './invitations-list.component.html',
  styleUrl: './invitations-list.component.scss'
})
export class InvitationsListComponent implements OnInit {
  private readonly invitationsService = inject(InvitationsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly invitation = signal<MyInvitationCodeDto | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.invitationsService.getMine().subscribe({
      next: (res) => {
        this.invitation.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load your invitation code.');
        this.loading.set(false);
      }
    });
  }

  copyCode(): void {
    const code = this.invitation()?.code;
    if (!code) {
      return;
    }
    navigator.clipboard.writeText(code);
    this.snackBar.open(`Copied "${code}"`, undefined, { duration: 2000 });
  }

  regenerate(): void {
    this.dialog
      .open<ConfirmationModalComponent, ConfirmationModalData, ConfirmationModalResult>(ConfirmationModalComponent, {
        width: '460px',
        data: {
          title: 'Regenerate invitation code',
          message:
            'This invalidates your current code for any future seller signups. Sellers who already registered using it stay permanently assigned to you — only the code string changes.',
          variant: 'amber',
          confirmLabel: 'Regenerate'
        }
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.invitationsService.regenerate().subscribe({
          next: (res) => {
            this.invitation.set(res);
            this.snackBar.open('LLC code regenerated.', undefined, { duration: 2500 });
          },
          error: () => this.snackBar.open('Failed to regenerate invitation code.', undefined, { duration: 3000 })
        });
      });
  }
}
