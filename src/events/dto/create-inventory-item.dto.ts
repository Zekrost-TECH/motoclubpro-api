import { IsString, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { InventoryCategory } from '../events.types';

export class CreateInventoryItemDto {
    @ApiProperty({ description: 'Item name' })
    @IsString()
    name!: string;

    @ApiProperty({ description: 'Item category', enum: ['herramienta', 'seguridad', 'comida', 'otros'] })
    @IsEnum(['herramienta', 'seguridad', 'comida', 'otros'])
    category!: InventoryCategory;

    @ApiPropertyOptional({ description: 'Quantity' })
    @IsOptional()
    @IsNumber()
    quantity?: number;

    @ApiPropertyOptional({ description: 'Icon identifier' })
    @IsOptional()
    @IsString()
    icon?: string;
}
