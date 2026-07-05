import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteDifficulty } from '../routes.types';

export class CreateRouteDto {
    @ApiProperty({ description: 'Route name' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiPropertyOptional({ description: 'Route description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ description: 'Route difficulty', enum: RouteDifficulty })
    @IsEnum(RouteDifficulty)
    @IsNotEmpty()
    difficulty!: RouteDifficulty;

    @ApiPropertyOptional({ description: 'Distance in kilometers', minimum: 0 })
    @IsNumber()
    @IsOptional()
    @Min(0)
    distanceKm?: number;

    @ApiPropertyOptional({ description: 'Estimated time' })
    @IsString()
    @IsOptional()
    estimatedTime?: string;

    @ApiPropertyOptional({ description: 'Minimum elevation' })
    @IsNumber()
    @IsOptional()
    elevationMin?: number;

    @ApiPropertyOptional({ description: 'Maximum elevation' })
    @IsNumber()
    @IsOptional()
    elevationMax?: number;

    @ApiPropertyOptional({ description: 'GeoJSON object' })
    @IsOptional()
    geojson?: Record<string, unknown>;

    @ApiPropertyOptional({ description: 'Start latitude', minimum: -90, maximum: 90 })
    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    start_lat?: number;

    @ApiPropertyOptional({ description: 'Start longitude', minimum: -180, maximum: 180 })
    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    start_lng?: number;

    @ApiPropertyOptional({ description: 'Start location name' })
    @IsOptional()
    @IsString()
    start_name?: string;
}
