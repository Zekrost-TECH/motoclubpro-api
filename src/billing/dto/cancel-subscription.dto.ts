import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelSubscriptionDto {
    @ApiPropertyOptional({ description: 'Motivo de cancelación' })
    @IsOptional()
    @IsString()
    reason?: string;
}
