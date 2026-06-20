import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, Min } from 'class-validator';
import { RouteDifficulty } from '../routes.types';

export class CreateRouteDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsEnum(RouteDifficulty)
    @IsNotEmpty()
    difficulty!: RouteDifficulty;

    @IsNumber()
    @IsOptional()
    @Min(0)
    distanceKm?: number;

    @IsString()
    @IsOptional()
    estimatedTime?: string;

    @IsNumber()
    @IsOptional()
    elevationMin?: number;

    @IsNumber()
    @IsOptional()
    elevationMax?: number;

    @IsOptional()
    geojson?: any;
}
