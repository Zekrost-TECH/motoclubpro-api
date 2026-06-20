import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from "../users.types";

export class CreateUserDto {
    @IsString()
    name!: string;

    @IsEmail()
    email!: string;

    @IsString()
    password?: string;

    @IsOptional()
    @IsString()
    passwordHash?: string;

    @IsOptional()
    @IsString()
    password_hash?: string;

    @IsOptional()
    @IsString()
    nickname?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsString()
    riderLevel?: string;

    @IsOptional()
    @IsString()
    rider_level?: string;
}
