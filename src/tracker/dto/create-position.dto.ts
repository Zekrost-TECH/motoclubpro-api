import { IsString, IsNumber, IsOptional, IsUUID, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePositionDto {
    @ApiProperty({ description: 'ID del evento en curso' })
    @IsUUID()
    eventId!: string;

    @ApiProperty({ description: 'Latitud' })
    @IsNumber()
    lat!: number;

    @ApiProperty({ description: 'Longitud' })
    @IsNumber()
    lng!: number;

    @ApiPropertyOptional({ description: 'Velocidad en m/s' })
    @IsOptional()
    @IsNumber()
    speed?: number;

    @ApiPropertyOptional({ description: 'Dirección en grados' })
    @IsOptional()
    @IsNumber()
    heading?: number;

    @ApiPropertyOptional({ description: 'Timestamp en ms desde epoch' })
    @IsOptional()
    @IsNumber()
    timestamp?: number;

    @ApiPropertyOptional({ description: 'Nombre del rider (opcional)' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Nivel de batería del dispositivo (0-100)' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    battery?: number;

    @ApiPropertyOptional({ description: 'Si el dispositivo está cargando' })
    @IsOptional()
    @IsBoolean()
    is_charging?: boolean;
}
