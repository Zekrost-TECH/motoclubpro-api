import { IsString, IsOptional, IsDateString, IsEnum, IsNumber, IsUUID } from 'class-validator';
import type { RouteDifficulty, RiderLevel, EventStatus } from '../events.types';

export class CreateEventDto {
    @IsString()
    title!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsDateString()
    date!: string;

    @IsString()
    time!: string;

    @IsEnum(['suave', 'moderada', 'expertos', 'off_road', 'viaje_largo'])
    difficulty!: RouteDifficulty;

    @IsOptional()
    @IsUUID()
    route_id?: string;

    @IsOptional()
    @IsEnum(['borrador', 'próximo', 'en-curso', 'completado', 'cancelado'])
    status?: EventStatus;

    @IsOptional()
    @IsNumber()
    max_attendees?: number;

    @IsOptional()
    @IsEnum(['novato', 'basico', 'intermedio', 'avanzado', 'experto'])
    min_rider_level?: RiderLevel;

    @IsOptional()
    @IsString()
    meeting_point?: string;
}
