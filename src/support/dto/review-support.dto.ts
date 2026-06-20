import { IsNumber, Max, Min } from 'class-validator';

export class ReviewSupportDto {
    @IsNumber()
    @Min(1)
    @Max(5)
    rating!: number;
}