import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRideRoleDto {
    @ApiProperty({ description: 'Machine-friendly slug (e.g. puntero, barredora)' })
    @IsString()
    @IsNotEmpty()
    slug!: string;

    @ApiProperty({ description: 'Human-readable Spanish label' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({ description: 'Whether only one attendee can have this role per event', default: false })
    @IsOptional()
    @IsBoolean()
    is_unique?: boolean;

    @ApiProperty({ description: 'Display order', default: 0 })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(999)
    sort_order?: number;
}
