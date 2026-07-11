import { IsString, IsEnum, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type GuestType = 'acompañante' | 'invitado';

export class CreateEventGuestDto {
    @ApiProperty({ description: 'Tipo de invitado', enum: ['acompañante', 'invitado'] })
    @IsEnum(['acompañante', 'invitado'])
    guest_type!: GuestType;

    @ApiProperty({ description: 'Nombre completo del invitado', minLength: 3, maxLength: 200 })
    @IsString()
    @MinLength(3)
    @MaxLength(200)
    full_name!: string;

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
}