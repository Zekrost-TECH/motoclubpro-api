import { IsString, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({ description: 'User email address' })
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @ApiProperty({ description: 'User password' })
    @IsString()
    @IsNotEmpty()
    password!: string;

    @ApiPropertyOptional({ description: 'Cloudflare Turnstile token' })
    @IsString()
    @IsOptional()
    turnstileToken?: string;
}
