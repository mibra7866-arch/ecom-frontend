import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthResponse } from '../models/auth.model';
import { CompleteSellerApplicationRequest, SellerOnboardingService } from './seller-onboarding.service';

describe('SellerOnboardingService', () => {
  let service: SellerOnboardingService;
  let httpMock: HttpTestingController;

  const request: CompleteSellerApplicationRequest = {
    name: 'Test Seller',
    email: 'test@example.com',
    password: 'Passw0rd!',
    storeName: 'Test Store',
    invitationCode: null,
    bankAccountHolderName: 'Test Seller',
    bankName: 'Test Bank',
    bankAccountNumber: '1234567890',
    bankIban: null,
    transactionPassword: 'TxnPass123!',
    transactionPasswordConfirm: 'TxnPass123!',
    idFrontFile: new File(['front'], 'id-front.png', { type: 'image/png' }),
    idBackFile: new File(['back'], 'id-back.png', { type: 'image/png' })
  };

  const authResponse: AuthResponse = {
    accessToken: 'token',
    accessTokenExpiresAt: '2026-01-01T00:00:00Z',
    role: 'Seller',
    userId: 1,
    displayName: 'Test Store'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(SellerOnboardingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts a multipart request to seller/auth/complete with the expected fields', () => {
    service.completeApplication(request).subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/seller/auth/complete'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);

    const body = req.request.body as FormData;
    expect(body.get('name')).toBe('Test Seller');
    expect(body.get('email')).toBe('test@example.com');
    expect(body.get('storeName')).toBe('Test Store');
    expect(body.has('invitationCode')).toBe(false); // null invitationCode should not be sent at all
    expect(body.has('bankIban')).toBe(false); // null bankIban should not be sent at all
    expect(body.get('bankAccountHolderName')).toBe('Test Seller');
    expect(body.get('idFrontFile')).toBeInstanceOf(File);
    expect(body.get('idBackFile')).toBeInstanceOf(File);

    req.flush(authResponse);
  });

  it('includes the invitation code and IBAN when provided', () => {
    service.completeApplication({ ...request, invitationCode: 'WELCOME2026', bankIban: 'GB29NWBK60161331926819' }).subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/seller/auth/complete'));
    const body = req.request.body as FormData;
    expect(body.get('invitationCode')).toBe('WELCOME2026');
    expect(body.get('bankIban')).toBe('GB29NWBK60161331926819');

    req.flush(authResponse);
  });

  // The seller is auto-logged-in after signup even though KYC is still pending — restrictions are
  // enforced elsewhere (the KycApproved policy server-side, the KYC-pending modal client-side), not
  // by withholding a session here. This just confirms the AuthResponse comes through untouched; the
  // component (not this service) is what calls AuthService.applyAuthResponse with it.
  it('resolves with the AuthResponse on success', () => {
    let result: AuthResponse | undefined;
    service.completeApplication(request).subscribe((res) => (result = res));

    const req = httpMock.expectOne((r) => r.url.endsWith('/seller/auth/complete'));
    req.flush(authResponse);

    expect(result).toEqual(authResponse);
  });

  it('propagates an error response', () => {
    let capturedError: HttpErrorResponse | undefined;

    service.completeApplication(request).subscribe({
      error: (err: HttpErrorResponse) => (capturedError = err)
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/seller/auth/complete'));
    req.flush({ error: 'A seller with this email already exists.', statusCode: 409 }, { status: 409, statusText: 'Conflict' });

    expect(capturedError?.status).toBe(409);
  });
});
