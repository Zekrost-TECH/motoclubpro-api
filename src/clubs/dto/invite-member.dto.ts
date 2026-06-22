import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InviteMemberDto {
    @ApiProperty({ description: 'User ID to invite' })
    @IsString()
    userId!: string;

    @ApiPropertyOptional({ description: 'Role to assign' })
    @IsOptional()
    @IsString()
    role?: string;
}
