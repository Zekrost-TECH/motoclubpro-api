import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class VerifySupportPointDto {
    @ApiPropertyOptional({ description: 'Mark support point as verified or unverified', default: true })
    @IsOptional()
    @IsBoolean()
    verified?: boolean;
}
