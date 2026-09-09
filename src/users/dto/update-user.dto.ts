import { IsString, IsOptional, IsArray, IsEnum, IsObject, ValidateNested, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../users.types';

class EmergencyContactDto {
    @ApiPropertyOptional() @IsOptional() @IsString()
    name?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    phone?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    relationship?: string;
}

export class UpdateUserDto {
    @ApiPropertyOptional() @IsOptional() @IsString()
    name?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    email?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    nickname?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    phone?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    avatarUrl?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    avatarInitials?: string;

    @ApiPropertyOptional({ enum: UserRole }) @IsOptional() @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional() @IsOptional() @IsString()
    riderLevel?: string;

    @ApiPropertyOptional({ description: 'New password (min 8 chars, will be hashed)' })
    @IsOptional()
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    password?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    bloodType?: string;

    @ApiPropertyOptional() @IsOptional() @IsArray()
    allergies?: string[];

    @ApiPropertyOptional() @IsOptional() @IsArray()
    medicalConditions?: string[];

    @ApiPropertyOptional() @IsOptional() @IsString()
    ecName?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    ecPhone?: string;

    @ApiPropertyOptional() @IsOptional() @IsString()
    ecRelationship?: string;

    @ApiPropertyOptional({ type: EmergencyContactDto })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => EmergencyContactDto)
    emergencyContact?: EmergencyContactDto;

    @ApiPropertyOptional() @IsOptional() @IsString()
    fcmToken?: string;
}