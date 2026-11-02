import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AdminListItemDto, CreateAdminRequest } from '../../core/models/admin.model';
import { AdminsService } from '../../core/services/admins.service';
import { CreateAdminDialogComponent } from './create-admin-dialog.component';

/**
 * SuperAdmin-only — creates scoped Admin accounts for the service-provider model, each with its own
 * permanent invitation code (see AdminsController). A plain Admin hitting this page gets a 403 from
 * every call here; the nav link itself is hidden for non-SuperAdmins in admin-shell.component.ts.
 */
@Component({
  selector: 'app-admins-list',
  standalone: true,
  imports: [DatePipe, MatTableModule, MatButtonModule, MatIconModule, MatDialogModule, MatProgressSpinnerModule],
  templateUrl: './admins-list.component.html',
  styleUrl: './admins-list.component.scss'
})
export class AdminsListComponent implements OnInit {
  private readonly adminsService = inject(AdminsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly admins = signal<AdminListItemDto[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly columns = ['username', 'contact', 'invitationCode', 'createdDate'];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.adminsService.list().subscribe({
      next: (res) => {
        this.admins.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load admins — this page is only available to a SuperAdmin.');
        this.loading.set(false);
      }
    });
  }

  copyCode(code: string): void {
    navigator.clipboard.writeText(code);
    this.snackBar.open(`Copied "${code}"`, undefined, { duration: 2000 });
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(CreateAdminDialogComponent, { width: '420px' });
    ref.afterClosed().subscribe((request?: CreateAdminRequest) => {
      if (!request) {
        return;
      }
      this.adminsService.create(request).subscribe({
        next: () => this.load(),
        error: (err) => {
          const message = err?.error?.error ?? 'Failed to create admin.';
          this.snackBar.open(message, undefined, { duration: 3000 });
        }
      });
    });
  }
}
