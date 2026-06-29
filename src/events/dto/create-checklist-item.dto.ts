import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChecklistItemDto {
    @ApiProperty({ description: 'Checklist item label' })
    @IsString()
    label!: string;

    @ApiPropertyOptional({ description: 'Whether the item is required' })
    @IsOptional()
    @IsBoolean()
    required?: boolean;
}
