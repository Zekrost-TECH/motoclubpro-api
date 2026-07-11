import { IsString, IsNumber, IsOptional, IsUUID } from 'class-validator';
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
}
