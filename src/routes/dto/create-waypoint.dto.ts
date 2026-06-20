import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, Min } from 'class-validator';
import { WaypointType } from '../routes.types';

export class CreateWaypointDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsNotEmpty()
    location!: { type: 'Point', coordinates: [number, number] };

    @IsEnum(WaypointType)
    @IsNotEmpty()
    type!: WaypointType;

    @IsString()
    @IsOptional()
    estimatedArrival?: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsNumber()
    @Min(0)
    sortOrder!: number;
}
