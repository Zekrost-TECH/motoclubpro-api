import { Injectable, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateWompiTransactionDto,
  WompiMerchantResponse,
  WompiTransactionResponse,
} from './billing.types';

@Injectable()
export class WompiService {
  private readonly logger = new Logger(WompiService.name);
  private readonly baseUrl: string;
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('WOMPI_BASE_URL') ?? '';
    this.privateKey = this.config.get<string>('WOMPI_PRIVATE_KEY') ?? '';
    this.publicKey = this.config.get<string>('WOMPI_PUBLIC_KEY') ?? '';
  }

  async createTransaction(dto: CreateWompiTransactionDto): Promise<WompiTransactionResponse> {
    const acceptanceToken = await this.getAcceptanceToken();

    const res = await fetch(`${this.baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.privateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        acceptance_token: acceptanceToken,
        amount_in_cents: dto.amount_in_cents,
        currency: dto.currency,
        customer_email: dto.customer_email,
        reference: dto.reference,
        payment_method: dto.payment_method,
        redirect_url: dto.redirect_url,
      }),
    });

    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.error('Wompi transaction creation failed', error);
      throw new HttpException(error, res.status);
    }

    return (await res.json()) as WompiTransactionResponse;
  }

  async getTransaction(transactionId: string): Promise<WompiTransactionResponse> {
    const res = await fetch(`${this.baseUrl}/transactions/${transactionId}`, {
      headers: {
        Authorization: `Bearer ${this.publicKey}`,
      },
    });

    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.error('Wompi get transaction failed', error);
      throw new HttpException(error, res.status);
    }

    return (await res.json()) as WompiTransactionResponse;
  }

  private async getAcceptanceToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/merchants/${this.publicKey}`);

    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.error('Wompi get acceptance token failed', error);
      throw new HttpException(error, res.status);
    }

    const data = (await res.json()) as WompiMerchantResponse;
    return data.data.presigned_acceptance.acceptance_token;
  }
}
