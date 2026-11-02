export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  role: 'Admin' | 'Seller';
  userId: number;
  displayName: string;
}

export interface AdminLoginRequest {
  username: string;
  password: string;
}

export interface SellerLoginRequest {
  email: string;
  password: string;
}

export interface ValidateInviteRequest {
  code: string;
}

export interface ValidateInviteResponse {
  valid: boolean;
  message: string | null;
}

export interface SellerRegisterRequest {
  name: string;
  email: string;
  password: string;
  storeName: string;
  invitationCode: string;
}
