import { IsString, IsOptional, IsEnum, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { GuestType } from '../events.types';

export class UpdateEventGuestDto {
    @ApiPropertyOptional({ description: 'Nombre completo del invitado', minLength: 3, maxLength: 200 })
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(200)
    full_name?: string;

    @ApiPropertyOptional({ description: 'Teléfono de contacto (opcional)' })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    @Matches(/^(\+?\d[\d\s-]{5,29})?$/, { message: 'Teléfono inválido' })
    phone?: string;

    @ApiPropertyOptional({ description: 'Notas (opcional, máx 500)' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;

    @ApiPropertyOptional({ description: 'Tipo de invitado', enum: ['acompañante', 'invitado'] })
    @IsOptional()
    @IsEnum(['acompañante', 'invitado'])
    guest_type?: GuestType;
}