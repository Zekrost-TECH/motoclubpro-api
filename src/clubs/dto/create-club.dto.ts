import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClubDto {
    @ApiProperty({ description: 'Club name' })
    @IsString()
    name!: string;

    @ApiProperty({ description: 'URL-friendly slug' })
    @IsString()
    slug!: string;

    @ApiPropertyOptional({ description: 'City' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ description: 'Department/State' })
    @IsOptional()
    @IsString()
    department?: string;
}
