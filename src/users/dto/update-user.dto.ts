import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { UserRole } from "../users.types";

export class UpdateUserDto {
    @IsOptional() @IsString()
    name?: string;

    @IsOptional() @IsString()
    email?: string;

    @IsOptional() @IsString()
    nickname?: string;

    @IsOptional() @IsString()
    phone?: string;

    @IsOptional() @IsString()
    avatar_url?: string;

    @IsOptional() @IsString()
    avatarInitials?: string;

    @IsOptional() @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional() @IsString()
    riderLevel?: string;

    @IsOptional() @IsString()
    rider_level?: string;

    @IsOptional() @IsString()
    passwordHash?: string;

    @IsOptional() @IsString()
    password_hash?: string;

    @IsOptional() @IsString()
    blood_type?: string;

    @IsOptional() @IsArray()
    allergies?: string[];

    @IsOptional() @IsArray()
    medical_conditions?: string[];

    @IsOptional() @IsString()
    ec_name?: string;

    @IsOptional() @IsString()
    ec_phone?: string;

    @IsOptional() @IsString()
    ec_relationship?: string;

    @IsOptional() @IsString()
    fcm_token?: string;

    @IsOptional() @IsString()
    fcmToken?: string;
}