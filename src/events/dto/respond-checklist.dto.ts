import { IsString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RespondChecklistItemDto {
    @ApiProperty({ description: 'Checklist item ID' })
    @IsString()
    itemId!: string;

    @ApiProperty({ description: 'Whether the item is checked' })
    @IsBoolean()
    checked!: boolean;
}
