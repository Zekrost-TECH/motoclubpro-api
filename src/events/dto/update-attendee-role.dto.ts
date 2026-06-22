import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { RideRole } from '../events.types';

export class UpdateAttendeeRoleDto {
  @ApiProperty({ description: 'Ride role assigned to attendee', enum: ['puntero', 'barredora', 'capitan_ruta', 'bloqueador', 'cierre_seguridad', 'jefe_armas', 'primeros_auxilios', 'coordinador_logistico', 'comunicador', 'rider'] })
  @IsEnum([
    'puntero',
    'barredora',
    'capitan_ruta',
    'bloqueador',
    'cierre_seguridad',
    'jefe_armas',
    'primeros_auxilios',
    'coordinador_logistico',
    'comunicador',
    'rider',
  ])
  ride_role!: RideRole;
}
