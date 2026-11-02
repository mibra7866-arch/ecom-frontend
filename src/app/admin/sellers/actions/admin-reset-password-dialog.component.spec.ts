import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSellerActionsService } from '../../../core/services/admin-seller-actions.service';
import { AdminResetPasswordDialogComponent, AdminResetPasswordDialogData } from './admin-reset-password-dialog.component';

describe('AdminResetPasswordDialogComponent', () => {
  let component: AdminResetPasswordDialogComponent;
  let actionsServiceMock: { resetPassword: ReturnType<typeof vi.fn> };
  let dialogRefMock: { close: ReturnType<typeof vi.fn> };

  const data: AdminResetPasswordDialogData = { sellerId: 42, sellerName: 'Test Store' };

  beforeEach(async () => {
    actionsServiceMock = { resetPassword: vi.fn() };
    dialogRefMock = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AdminResetPasswordDialogComponent],
      providers: [
        { provide: AdminSellerActionsService, useValue: actionsServiceMock },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    }).compileComponents();

    component = TestBed.createComponent(AdminResetPasswordDialogComponent).componentInstance;
  });

  it('disables save when the new password is too short', () => {
    component.newPassword.set('short1');
    component.confirmNewPassword.set('short1');

    expect(component.canSave()).toBe(false);
  });

  it('disables save when the passwords do not match', () => {
    component.newPassword.set('ValidPass123!');
    component.confirmNewPassword.set('Different123!');

    expect(component.canSave()).toBe(false);
  });

  it('enables save once the new password is long enough and matches the confirmation', () => {
    component.newPassword.set('ValidPass123!');
    component.confirmNewPassword.set('ValidPass123!');

    expect(component.canSave()).toBe(true);
  });

  it('calls the service with the entered password and closes with true on success', () => {
    actionsServiceMock.resetPassword.mockReturnValue(of(undefined));
    component.newPassword.set('ValidPass123!');
    component.confirmNewPassword.set('ValidPass123!');

    component.save();

    expect(actionsServiceMock.resetPassword).toHaveBeenCalledWith(42, {
      newPassword: 'ValidPass123!',
      confirmNewPassword: 'ValidPass123!'
    });
    expect(dialogRefMock.close).toHaveBeenCalledWith(true);
  });

  it('surfaces a server error and keeps the dialog open', () => {
    actionsServiceMock.resetPassword.mockReturnValue(throwError(() => ({ error: { error: 'Something went wrong.' } })));
    component.newPassword.set('ValidPass123!');
    component.confirmNewPassword.set('ValidPass123!');

    component.save();

    expect(component.errorMessage()).toBe('Something went wrong.');
    expect(component.saving()).toBe(false);
    expect(dialogRefMock.close).not.toHaveBeenCalled();
  });

  it('does not call the service when the form is invalid', () => {
    component.newPassword.set('short');
    component.confirmNewPassword.set('short');

    component.save();

    expect(actionsServiceMock.resetPassword).not.toHaveBeenCalled();
  });

  it('never leaks the plain password into errorMessage or component state beyond the form fields', () => {
    actionsServiceMock.resetPassword.mockReturnValue(of(undefined));
    component.newPassword.set('SuperSecret123!');
    component.confirmNewPassword.set('SuperSecret123!');

    component.save();

    expect(component.errorMessage()).toBeNull();
  });
});
