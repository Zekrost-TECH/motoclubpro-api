import { OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from "../../users/dto/create-user.dto";

export class RegisterDto extends OmitType(CreateUserDto, ['role'] as const) {
    @ApiPropertyOptional({ description: 'Token de Turnstile (opcional para app movil)' })
    @IsOptional()
    @IsString()
    turnstileToken?: string;
}
