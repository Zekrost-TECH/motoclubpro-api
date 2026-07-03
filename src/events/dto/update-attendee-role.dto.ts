import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { RideRole } from '../events.types';

export class UpdateAttendeeRoleDto {
  @ApiProperty({ description: 'Ride role slug (must exist in the club ride roles)' })
  @IsString()
  @IsNotEmpty()
  ride_role!: RideRole;
}
