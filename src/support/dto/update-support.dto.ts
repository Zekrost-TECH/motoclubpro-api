import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupportType } from './create-support.dto';

export class UpdateSupportDto {
    @ApiPropertyOptional({ description: 'Support point name' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Support type', enum: SupportType })
    @IsOptional()
    @IsEnum(SupportType)
    type?: SupportType;

    @ApiPropertyOptional({ description: 'City' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ description: 'Latitude' })
    @IsOptional()
    @IsNumber()
    lat?: number;

    @ApiPropertyOptional({ description: 'Longitude' })
    @IsOptional()
    @IsNumber()
    lng?: number;

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
