import { IsString, IsNotEmpty, IsInt, Min, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMotorcycleDto {
    @ApiProperty({ description: 'Brand' })
    @IsString()
    @IsNotEmpty()
    brand!: string;

    @ApiProperty({ description: 'Model' })
    @IsString()
    @IsNotEmpty()
    model!: string;

    @ApiProperty({ description: 'Year', minimum: 1900 })
    @IsInt()
    @Min(1900)
    year!: number;

    @ApiPropertyOptional({ description: 'Engine displacement (cc)', minimum: 50 })
    @IsInt()
    @IsOptional()
    @Min(50)
    cc?: number;

    @ApiProperty({ description: 'License plate' })
    @IsString()
    @IsNotEmpty()
    plate!: string;

    @ApiPropertyOptional({ description: 'Color' })
    @IsString()
    @IsOptional()
    color?: string;

    @ApiPropertyOptional({ description: 'Current kilometers', minimum: 0 })
    @IsInt()
    @IsOptional()
    @Min(0)
    currentKm?: number;

    @ApiPropertyOptional({ description: 'Next service kilometers', minimum: 0 })
    @IsInt()
    @IsOptional()
    @Min(0)
    nextServiceKm?: number;

    @ApiPropertyOptional({ description: 'SOAT expiry date (ISO 8601)' })
    @IsDateString()
    @IsOptional()
    soatExpiry?: string;

    @ApiPropertyOptional({ description: 'Technical review expiry date (ISO 8601)' })
    @IsDateString()
    @IsOptional()
    techReviewExpiry?: string;
}
