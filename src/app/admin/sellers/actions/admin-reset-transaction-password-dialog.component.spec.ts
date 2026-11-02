import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSellerActionsService } from '../../../core/services/admin-seller-actions.service';
import {
  AdminResetTransactionPasswordDialogComponent,
  AdminResetTransactionPasswordDialogData
} from './admin-reset-transaction-password-dialog.component';

describe('AdminResetTransactionPasswordDialogComponent', () => {
  let component: AdminResetTransactionPasswordDialogComponent;
  let actionsServiceMock: { resetTransactionPassword: ReturnType<typeof vi.fn> };
  let dialogRefMock: { close: ReturnType<typeof vi.fn> };

  const data: AdminResetTransactionPasswordDialogData = { sellerId: 7, sellerName: 'Test Store' };

  beforeEach(async () => {
    actionsServiceMock = { resetTransactionPassword: vi.fn() };
    dialogRefMock = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AdminResetTransactionPasswordDialogComponent],
      providers: [
        { provide: AdminSellerActionsService, useValue: actionsServiceMock },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    }).compileComponents();

    component = TestBed.createComponent(AdminResetTransactionPasswordDialogComponent).componentInstance;
  });

  it('disables save when the new transaction password is too short', () => {
    component.newPassword.set('short1');
    component.confirmNewPassword.set('short1');

    expect(component.canSave()).toBe(false);
  });

  it('disables save when the passwords do not match', () => {
    component.newPassword.set('ValidTxn123!');
    component.confirmNewPassword.set('Different123!');

    expect(component.canSave()).toBe(false);
  });

  it('enables save once the new transaction password is long enough and matches the confirmation', () => {
    component.newPassword.set('ValidTxn123!');
    component.confirmNewPassword.set('ValidTxn123!');

    expect(component.canSave()).toBe(true);
  });

  it('calls the service with the entered password and closes with true on success', () => {
    actionsServiceMock.resetTransactionPassword.mockReturnValue(of(undefined));
    component.newPassword.set('ValidTxn123!');
    component.confirmNewPassword.set('ValidTxn123!');

    component.save();

    expect(actionsServiceMock.resetTransactionPassword).toHaveBeenCalledWith(7, {
      newPassword: 'ValidTxn123!',
      confirmNewPassword: 'ValidTxn123!'
    });
    expect(dialogRefMock.close).toHaveBeenCalledWith(true);
  });

  it('surfaces a server error and keeps the dialog open', () => {
    actionsServiceMock.resetTransactionPassword.mockReturnValue(throwError(() => ({ error: { error: 'Something went wrong.' } })));
    component.newPassword.set('ValidTxn123!');
    component.confirmNewPassword.set('ValidTxn123!');

    component.save();

    expect(component.errorMessage()).toBe('Something went wrong.');
    expect(component.saving()).toBe(false);
    expect(dialogRefMock.close).not.toHaveBeenCalled();
  });

  it('does not call the service when the form is invalid', () => {
    component.newPassword.set('short');
    component.confirmNewPassword.set('short');

    component.save();

    expect(actionsServiceMock.resetTransactionPassword).not.toHaveBeenCalled();
  });
});
