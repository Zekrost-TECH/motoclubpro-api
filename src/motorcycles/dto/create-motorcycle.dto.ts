import { IsString, IsNotEmpty, IsInt, Min, Max, IsNumber, IsOptional, IsDateString, IsEnum } from 'class-validator';

export class CreateMotorcycleDto {
    @IsString()
    @IsNotEmpty()
    brand!: string;

    @IsString()
    @IsNotEmpty()
    model!: string;

    @IsInt()
    @Min(1900)
    year!: number;

    @IsInt()
    @IsOptional()
    @Min(50)
    cc?: number;

    @IsString()
    @IsNotEmpty()
    plate!: string;

    @IsString()
    @IsOptional()
    color?: string;

    @IsInt()
    @IsOptional()
    @Min(0)
    currentKm?: number;

    @IsInt()
    @IsOptional()
    @Min(0)
    nextServiceKm?: number;

    @IsDateString()
    @IsOptional()
    soatExpiry?: string;

    @IsDateString()
    @IsOptional()
    techReviewExpiry?: string;
}
