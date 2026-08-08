import { IsString, IsEmail, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../users.types';

export class CreateUserDto {
    @ApiProperty({ description: 'Full name of the user' })
    @IsString()
    @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
    @MaxLength(120, { message: 'El nombre no puede superar 120 caracteres' })
    name!: string;

    @ApiProperty({ description: 'Email address' })
    @IsEmail({}, { message: 'Correo electrónico inválido' })
    email!: string;

    @ApiPropertyOptional({ description: 'Password (required for creation)' })
    @IsOptional()
    @IsString()
    @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
    @MaxLength(128, { message: 'La contraseña no puede superar 128 caracteres' })
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
