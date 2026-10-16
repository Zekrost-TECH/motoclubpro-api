import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Punto individual dentro de un batch: igual que CreatePositionDto pero sin
// eventId (el batch entero pertenece a un solo evento).
export class PositionPointDto {
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

// Cola offline del servicio nativo: tras una zona sin cobertura se suben las
// posiciones acumuladas de una vez. Tope de 200 por request para acotar el
// payload; el cliente puede partir la cola en varios batches.
export class BatchPositionsDto {
    @ApiProperty({ description: 'ID del evento en curso' })
    @IsUUID()
    eventId!: string;

    @ApiProperty({ type: [PositionPointDto], description: 'Posiciones acumuladas (máx 200)' })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => PositionPointDto)
    positions!: PositionPointDto[];
}
