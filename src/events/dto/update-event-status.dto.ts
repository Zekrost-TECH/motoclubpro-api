import { IsEnum } from 'class-validator';
import type { EventStatus } from '../events.types';

export class UpdateEventStatusDto {
    @IsEnum(['borrador', 'proximo', 'en-curso', 'completado', 'cancelado'])
    status!: EventStatus;
}
