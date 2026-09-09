import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RsvpDto {
    @ApiPropertyOptional({ description: 'Rider role for the event (e.g. rider, leader, sweeper)' })
    @IsOptional()
    @IsString()
    rideRole?: string;
}
