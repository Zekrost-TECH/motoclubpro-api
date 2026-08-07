import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerDataDto {
    @ApiPropertyOptional({ description: 'Nombre completo (requerido para NEQUI/PSE)' })
    @IsOptional()
    @IsString()
    fullName?: string;

    @ApiPropertyOptional({ description: 'Número de teléfono (requerido para NEQUI)' })
    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @ApiPropertyOptional({ description: 'Documento de identidad (requerido para NEQUI/PSE)' })
    @IsOptional()
    @IsString()
    legalId?: string;

    @ApiPropertyOptional({ description: 'Tipo de documento: CC | CE | NIT | PPN' })
    @IsOptional()
    @IsString()
    legalIdType?: string;
}

export class CreatePaymentSourceDto {
    @ApiProperty({ description: 'Tipo de método de pago', enum: ['CARD', 'NEQUI', 'PSE'] })
    @IsIn(['CARD', 'NEQUI', 'PSE'])
    type!: 'CARD' | 'NEQUI' | 'PSE';

    @ApiProperty({ description: 'Token generado por Wompi (tok_...) del cliente' })
    @IsString()
    @IsNotEmpty()
    token!: string;

    @ApiPropertyOptional({ description: 'Email del club (fallback: billing_contact_email del club)' })
    @IsOptional()
    @IsString()
    customerEmail?: string;

    @ApiPropertyOptional({ description: 'Acceptance token de términos (requerido para CARD)' })
    @IsOptional()
    @IsString()
    acceptanceToken?: string;

    @ApiPropertyOptional({ type: CustomerDataDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CustomerDataDto)
    customerData?: CustomerDataDto;
}
