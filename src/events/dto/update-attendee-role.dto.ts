import { IsEnum } from 'class-validator';
import type { RideRole } from '../events.types';

export class UpdateAttendeeRoleDto {
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
