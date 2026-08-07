import { OmitType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from "../../users/dto/create-user.dto";

export class RegisterDto extends OmitType(CreateUserDto, ['role'] as const) {
    @IsOptional()
    @IsString()
    turnstileToken?: string;
}
