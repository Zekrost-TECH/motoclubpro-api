import { IsString, IsEnum, IsNumber, IsOptional } from 'class-validator';
import type { InventoryCategory } from '../events.types';

export class CreateInventoryItemDto {
    @IsString()
    name!: string;

    @IsEnum(['herramienta', 'seguridad', 'comida', 'otros'])
    category!: InventoryCategory;

    @IsOptional()
    @IsNumber()
    quantity?: number;

    @IsOptional()
    @IsString()
    icon?: string;
}
