import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ChangeSubscriptionDto {
    @ApiPropertyOptional({ description: 'Nuevo plan (esencial | basico | pro | empresarial)' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    planId?: string;

    @ApiPropertyOptional({ description: 'Nuevo ciclo de facturación', enum: ['monthly', 'yearly'] })
    @IsOptional()
    @IsIn(['monthly', 'yearly'])
    billingCycle?: 'monthly' | 'yearly';
}
