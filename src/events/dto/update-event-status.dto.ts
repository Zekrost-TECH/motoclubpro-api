import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { EventStatus } from '../events.types';

export class UpdateEventStatusDto {
    @ApiProperty({ description: 'New event status', enum: ['borrador', 'proximo', 'en-curso', 'completado', 'cancelado'] })
    @IsEnum(['borrador', 'proximo', 'en-curso', 'completado', 'cancelado'])
    status!: EventStatus;
}
