import { IsString, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/users.types';

export class InviteMemberDto {
    @ApiProperty({ description: 'User ID to invite' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiPropertyOptional({ description: 'Email of the user to invite' })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({ description: 'Role to assign', enum: UserRole, default: UserRole.rider })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;
}
