import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBillingDto {
    @ApiPropertyOptional({ description: 'NIT (tax ID)' })
    @IsOptional()
    @IsString()
    nit?: string;

    @ApiPropertyOptional({ description: 'Billing address' })
    @IsOptional()
    @IsString()
    billingAddress?: string;

    @ApiPropertyOptional({ description: 'Billing phone' })
    @IsOptional()
    @IsString()
    billingPhone?: string;

    @ApiPropertyOptional({ description: 'Billing contact name' })
    @IsOptional()
    @IsString()
    billingContactName?: string;

    @ApiPropertyOptional({ description: 'Billing contact email' })
    @IsOptional()
    @IsString()
    billingContactEmail?: string;

    @ApiPropertyOptional({ description: 'Tax regime' })
    @IsOptional()
    @IsString()
    taxRegime?: string;
}
