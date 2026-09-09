import { IsNumber, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewSupportDto {
    @ApiProperty({ description: 'Calificacion del punto de soporte (1-5)', minimum: 1, maximum: 5 })
    @IsNumber()
    @Min(1)
    @Max(5)
    rating!: number;
}