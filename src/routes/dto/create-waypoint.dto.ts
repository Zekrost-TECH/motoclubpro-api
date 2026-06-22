import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WaypointType } from '../routes.types';

export class CreateWaypointDto {
    @ApiPropertyOptional({ description: 'Waypoint name' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ description: 'GeoJSON Point location' })
    @IsNotEmpty()
    location!: { type: 'Point', coordinates: [number, number] };

    @ApiProperty({ description: 'Waypoint type', enum: WaypointType })
    @IsEnum(WaypointType)
    @IsNotEmpty()
    type!: WaypointType;

    @ApiPropertyOptional({ description: 'Estimated arrival time' })
    @IsString()
    @IsOptional()
    estimatedArrival?: string;

    @ApiPropertyOptional({ description: 'Notes' })
    @IsString()
    @IsOptional()
    notes?: string;

    @ApiProperty({ description: 'Sort order', minimum: 0 })
    @IsNumber()
    @Min(0)
    sortOrder!: number;
}
