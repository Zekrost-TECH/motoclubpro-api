import { IsString, IsNotEmpty, IsInt, Min, IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceType } from '../motorcycles.types';

export class CreateMaintenanceDto {
    @ApiProperty({ description: 'Maintenance type', enum: MaintenanceType })
    @IsEnum(MaintenanceType)
    @IsNotEmpty()
    type!: MaintenanceType;

    @ApiPropertyOptional({ description: 'Description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ description: 'Kilometers at maintenance', minimum: 0 })
    @IsInt()
    @Min(0)
    km!: number;

    @ApiProperty({ description: 'Date (ISO 8601)' })
    @IsDateString()
    @IsNotEmpty()
    date!: string;

    @ApiPropertyOptional({ description: 'Cost' })
    @IsNumber()
    @IsOptional()
    cost?: number;

    @ApiPropertyOptional({ description: 'Receipt URL' })
    @IsString()
    @IsOptional()
    receiptUrl?: string;
}
