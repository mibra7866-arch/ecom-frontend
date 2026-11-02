import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function passwordsMatchValidator(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;
    const confirmControl = group.get(confirmKey);

    if (confirmControl && password !== confirm) {
      confirmControl.setErrors({ ...confirmControl.errors, passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (confirmControl?.hasError('passwordMismatch')) {
      const { passwordMismatch, ...rest } = confirmControl.errors ?? {};
      confirmControl.setErrors(Object.keys(rest).length ? rest : null);
    }

    return null;
  };
}
