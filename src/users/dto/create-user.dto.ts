import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../users.types';

export class CreateUserDto {
    @ApiProperty({ description: 'Full name of the user' })
    @IsString()
    name!: string;

    @ApiProperty({ description: 'Email address' })
    @IsEmail()
    email!: string;

    @ApiPropertyOptional({ description: 'Password (required for creation)' })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiPropertyOptional({ description: 'Nickname or alias' })
    @IsOptional()
    @IsString()
    nickname?: string;

    @ApiPropertyOptional({ description: 'User role', enum: UserRole, default: UserRole.rider })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional({ description: 'Rider experience level' })
    @IsOptional()
    @IsString()
    riderLevel?: string;
}
