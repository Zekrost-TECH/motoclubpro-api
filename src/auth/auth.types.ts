import { UserRole } from '../users/users.types';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  clubs?: { club_id: string; role: UserRole }[];
}

export interface AuthRequest {
  user: AuthUser;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: Omit<AuthUser, 'sub'> & { clubs: { club_id: string; role: UserRole }[] };
}
