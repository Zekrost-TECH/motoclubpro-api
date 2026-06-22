import { IsString, IsOptional, IsDateString, IsEnum, IsNumber, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RouteDifficulty, RiderLevel, EventStatus } from '../events.types';

export class CreateEventDto {
    @ApiProperty({ description: 'Event title' })
    @IsString()
    title!: string;

    @ApiPropertyOptional({ description: 'Event description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ description: 'Event date (ISO 8601)' })
    @IsDateString()
    date!: string;

    @ApiProperty({ description: 'Event time' })
    @IsString()
    time!: string;

    @ApiProperty({ description: 'Route difficulty', enum: ['suave', 'moderada', 'expertos', 'off_road', 'viaje_largo'] })
    @IsEnum(['suave', 'moderada', 'expertos', 'off_road', 'viaje_largo'])
    difficulty!: RouteDifficulty;

    @ApiPropertyOptional({ description: 'Associated route ID' })
    @IsOptional()
    @IsUUID()
    route_id?: string;

    @ApiPropertyOptional({ description: 'Event status', enum: ['borrador', 'próximo', 'en-curso', 'completado', 'cancelado'] })
    @IsOptional()
    @IsEnum(['borrador', 'próximo', 'en-curso', 'completado', 'cancelado'])
    status?: EventStatus;

    @ApiPropertyOptional({ description: 'Maximum attendees' })
    @IsOptional()
    @IsNumber()
    max_attendees?: number;

    @ApiPropertyOptional({ description: 'Minimum rider level', enum: ['novato', 'basico', 'intermedio', 'avanzado', 'experto'] })
    @IsOptional()
    @IsEnum(['novato', 'basico', 'intermedio', 'avanzado', 'experto'])
    min_rider_level?: RiderLevel;

    @ApiPropertyOptional({ description: 'Meeting point address' })
    @IsOptional()
    @IsString()
    meeting_point?: string;
}
