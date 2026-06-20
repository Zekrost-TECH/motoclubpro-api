import { IsString, IsNotEmpty, IsInt, Min, IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';
import { MaintenanceType } from '../motorcycles.types';

export class CreateMaintenanceDto {
    @IsEnum(MaintenanceType)
    @IsNotEmpty()
    type!: MaintenanceType;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @Min(0)
    km!: number;

    @IsDateString()
    @IsNotEmpty()
    date!: string;

    @IsNumber()
    @IsOptional()
    cost?: number;

    @IsString()
    @IsOptional()
    receiptUrl?: string;
}
