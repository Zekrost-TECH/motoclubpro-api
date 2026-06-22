import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/users.types';

export const CLUB_ROLES_KEY = 'club_roles';
export const ClubRoles = (...roles: UserRole[]) => SetMetadata(CLUB_ROLES_KEY, roles);
