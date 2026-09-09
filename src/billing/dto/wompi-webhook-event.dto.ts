import { IsString, IsObject, IsArray, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class WompiTransactionDto {
    @ApiProperty({ description: 'Transaction ID' })
    @IsString()
    id!: string;

    @ApiProperty({ description: 'Transaction status' })
    @IsString()
    status!: string;

    @ApiProperty({ description: 'Transaction reference' })
    @IsString()
    reference!: string;

    @ApiPropertyOptional({ description: 'Status message' })
    @IsOptional()
    @IsString()
    status_message?: string;

    @ApiPropertyOptional({ description: 'Amount in cents' })
    @IsOptional()
    @IsNumber()
    amount_in_cents?: number;

    @ApiPropertyOptional({ description: 'Payment method type' })
    @IsOptional()
    @IsString()
    payment_method_type?: string;

    @ApiPropertyOptional({ description: 'Payment source ID' })
    @IsOptional()
    payment_source_id?: string | number | null;
}

class WompiWebhookDataDto {
    @ApiProperty({ type: WompiTransactionDto })
    @IsObject()
    @Type(() => WompiTransactionDto)
    transaction!: WompiTransactionDto;
}

class WompiSignatureDto {
    @ApiProperty({ description: 'Signature properties (paths to signed fields)' })
    @IsArray()
    @IsString({ each: true })
    properties!: string[];

    @ApiProperty({ description: 'Signature checksum' })
    @IsString()
    checksum!: string;
}

export class WompiWebhookEventDto {
    @ApiProperty({ description: 'Event type (e.g. transaction.updated)' })
    @IsString()
    event!: string;

    @ApiProperty({ type: WompiWebhookDataDto })
    @IsObject()
    @Type(() => WompiWebhookDataDto)
    data!: WompiWebhookDataDto;

    @ApiPropertyOptional({ description: 'Environment (sandbox/production)' })
    @IsOptional()
    @IsString()
    environment?: string;

    @ApiProperty({ type: WompiSignatureDto })
    @IsObject()
    @Type(() => WompiSignatureDto)
    signature!: WompiSignatureDto;

    @ApiProperty({ description: 'Event timestamp (unix seconds)' })
    @IsNumber()
    timestamp!: number;

    @ApiPropertyOptional({ description: 'Sent at (ISO 8601)' })
    @IsOptional()
    @IsString()
    sent_at?: string;
}
