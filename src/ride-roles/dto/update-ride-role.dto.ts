import { PartialType } from '@nestjs/swagger';
import { CreateRideRoleDto } from './create-ride-role.dto';

export class UpdateRideRoleDto extends PartialType(CreateRideRoleDto) { }
