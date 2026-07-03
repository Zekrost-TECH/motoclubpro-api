import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertType } from '../sos.types';

export class CreateSosDto {
    @ApiProperty({ description: 'Alert type', enum: AlertType })
    @IsEnum(AlertType)
    type!: AlertType;

    @ApiPropertyOptional({ description: 'Associated event ID' })
    @IsOptional()
    @IsUUID()
    event_id?: string;

    @ApiProperty({ description: 'Latitude' })
    @IsNumber()
    lat!: number;

    @ApiProperty({ description: 'Longitude' })
    @IsNumber()
    lng!: number;

    @ApiPropertyOptional({ description: 'Description' })
    @IsOptional()
    @IsString()
    description?: string;
}
