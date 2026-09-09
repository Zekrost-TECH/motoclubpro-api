import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindEventsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filtrar por estado del evento' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Solo eventos proximos' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  upcoming?: boolean;
}
