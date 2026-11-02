import { Injectable, computed, signal } from '@angular/core';

interface DecodedClaims {
  role: 'Admin' | 'Seller' | null;
  userId: number | null;
  name: string | null;
}

const NAME_IDENTIFIER_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
const NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly tokenSignal = signal<string | null>(null);
  private readonly expiresAtSignal = signal<string | null>(null);

  readonly accessToken = this.tokenSignal.asReadonly();
  readonly expiresAt = this.expiresAtSignal.asReadonly();
  /** computed() (not a plain method) so effects that depend on it only re-fire on a true login/logout
   * transition, not on every silent token refresh (which changes the token string but not the
   * true/false auth status). */
  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);

  readonly claims = computed<DecodedClaims>(() => {
    const token = this.tokenSignal();
    if (!token) {
      return { role: null, userId: null, name: null };
    }

    const payload = decodeJwtPayload(token);
    const userIdRaw = payload?.[NAME_IDENTIFIER_CLAIM];
    return {
      role: (payload?.[ROLE_CLAIM] as 'Admin' | 'Seller' | undefined) ?? null,
      userId: userIdRaw ? Number(userIdRaw) : null,
      name: (payload?.[NAME_CLAIM] as string | undefined) ?? null
    };
  });

  readonly role = computed(() => this.claims().role);

  setToken(accessToken: string, expiresAt: string): void {
    this.tokenSignal.set(accessToken);
    this.expiresAtSignal.set(expiresAt);
  }

  clear(): void {
    this.tokenSignal.set(null);
    this.expiresAtSignal.set(null);
  }

  hasToken(): boolean {
    return this.tokenSignal() !== null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
