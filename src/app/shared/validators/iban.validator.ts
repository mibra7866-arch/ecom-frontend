import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const IBAN_FORMAT = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;

/**
 * Standard IBAN validation (ISO 13616 format + ISO 7064 MOD 97-10 checksum) — no external library is
 * used elsewhere in this app for structured input, so this is implemented directly rather than adding
 * a new dependency for one field.
 */
export function ibanValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = (control.value ?? '').toString().toUpperCase().replace(/\s+/g, '');
    if (!raw) {
      return null; // emptiness is Validators.required's concern, not this one's
    }

    if (!IBAN_FORMAT.test(raw)) {
      return { ibanFormat: true };
    }

    // Move the first 4 characters (country code + check digits) to the end, convert letters to
    // numbers (A=10 ... Z=35), then reduce mod 97 in chunks — the standard IBAN checksum algorithm.
    // A valid IBAN always leaves a remainder of 1.
    const rearranged = raw.slice(4) + raw.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, (letter: string) => (letter.charCodeAt(0) - 55).toString());

    let remainder = 0;
    for (let i = 0; i < numeric.length; i += 7) {
      remainder = Number(remainder.toString() + numeric.substring(i, i + 7)) % 97;
    }

    return remainder === 1 ? null : { ibanChecksum: true };
  };
}
