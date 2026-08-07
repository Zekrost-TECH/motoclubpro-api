import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubscribeDto {
    @ApiProperty({ description: 'ID del plan (esencial | basico | pro | empresarial)' })
    @IsString()
    @IsNotEmpty()
    planId!: string;

    @ApiProperty({ description: 'Ciclo de facturación', enum: ['monthly', 'yearly'] })
    @IsIn(['monthly', 'yearly'])
    billingCycle: 'monthly' | 'yearly' = 'monthly';
}
