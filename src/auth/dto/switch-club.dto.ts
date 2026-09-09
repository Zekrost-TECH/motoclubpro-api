import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchClubDto {
    @ApiProperty({ description: 'Club ID to switch to' })
    @IsString()
    club_id!: string;
}
