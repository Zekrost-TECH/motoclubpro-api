import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum SupportType {
    TALLER = 'taller',
    LLANTERIA = 'llantería',
    GASOLINERA = 'gasolinera',
    GRUA = 'grúa',
    DESCANSO = 'descanso',
    HOSPITAL = 'hospital',
}

export class CreateSupportDto {
    @IsString()
    name!: string;

    @IsEnum(SupportType)
    type!: SupportType;

    @IsNumber()
    lat!: number;

    @IsNumber()
    lng!: number;
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    hours?: string;
}
