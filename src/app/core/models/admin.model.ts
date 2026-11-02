export interface AdminListItemDto {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
  role: 'SuperAdmin' | 'Admin';
  createdDate: string;
  invitationCode: string;
}

export interface CreateAdminRequest {
  username: string;
  password: string;
  name: string | null;
  email: string | null;
}
