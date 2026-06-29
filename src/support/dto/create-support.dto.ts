import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SupportType {
    TALLER = 'taller',
    LLANTERIA = 'llantería',
    GASOLINERA = 'gasolinera',
    GRUA = 'grúa',
    DESCANSO = 'descanso',
    HOSPITAL = 'hospital',
}

export class CreateSupportDto {
    @ApiProperty({ description: 'Support point name' })
    @IsString()
    name!: string;

    @ApiProperty({ description: 'Support type', enum: SupportType })
    @IsEnum(SupportType)
    type!: SupportType;

    @ApiProperty({ description: 'Latitude' })
    @IsNumber()
    lat!: number;

    @ApiProperty({ description: 'Longitude' })
    @IsNumber()
    lng!: number;

    @ApiPropertyOptional({ description: 'City' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ description: 'Address' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ description: 'Phone number' })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional({ description: 'Opening hours' })
    @IsOptional()
    @IsString()
    hours?: string;
}
