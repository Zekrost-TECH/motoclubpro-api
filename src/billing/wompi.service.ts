import { Injectable, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  CreateWompiPaymentSourceDto,
  CreateWompiTransactionDto,
  WompiMerchantResponse,
  WompiPaymentSourceResponse,
  WompiTransactionResponse,
} from './billing.types';

@Injectable()
export class WompiService {
  private readonly logger = new Logger(WompiService.name);
  private readonly baseUrl: string;
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly integrityKey: string;
  readonly dryRun: boolean;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('WOMPI_BASE_URL') ?? '';
    this.privateKey = this.config.get<string>('WOMPI_PRIVATE_KEY') ?? '';
    this.publicKey = this.config.get<string>('WOMPI_PUBLIC_KEY') ?? '';
    this.integrityKey = this.config.get<string>('WOMPI_INTEGRITY_KEY') ?? '';
    this.dryRun = this.config.get<string>('BILLING_DRY_RUN') === 'true';
  }

  /** Config pública para tokenizar en el navegador (llave pública + base URL del ambiente). */
  getPublicConfig(): { publicKey: string; baseUrl: string } {
    return { publicKey: this.publicKey, baseUrl: this.baseUrl };
  }

  /**
   * Firma de integridad (verificada contra sandbox real):
   * SHA256(referencia + monto_en_centavos + moneda + secreto_integridad)
   * Obligatoria en el body para transacciones con método de pago guardado/token.
   */
  private buildIntegritySignature(reference: string, amountInCents: number, currency: string): string {
    const payload = `${reference}${amountInCents}${currency}${this.integrityKey}`;
    return createHash('sha256').update(payload).digest('hex');
  }

  async createTransaction(dto: CreateWompiTransactionDto): Promise<WompiTransactionResponse> {
    if (this.dryRun) {
      this.logger.warn(
        `[DRY-RUN] Transaccion simulada ${dto.reference} por ${dto.amount_in_cents} COP (${dto.payment_method.type})`,
      );
      return {
        data: { id: `dryrun-${Date.now()}`, status: 'APPROVED', reference: dto.reference },
      };
    }

    const acceptanceToken = await this.getAcceptanceToken();
    const signature = this.buildIntegritySignature(dto.reference, dto.amount_in_cents, dto.currency);

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
        signature,
        payment_method: dto.payment_method,
        payment_source_id: dto.payment_source_id,
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

  async createPaymentSource(dto: CreateWompiPaymentSourceDto): Promise<WompiPaymentSourceResponse> {
    if (this.dryRun) {
      this.logger.warn(`[DRY-RUN] Payment source simulada (${dto.type}) para ${dto.customer_email}`);
      return {
        data: {
          id: `src_dryrun_${Date.now()}`,
          type: dto.type,
          status: 'AVAILABLE',
          customer_email: dto.customer_email,
          public_data: { last_four: '4242' },
        },
      };
    }

    const res = await fetch(`${this.baseUrl}/payment_sources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.privateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: dto.type,
        token: dto.token,
        customer_email: dto.customer_email,
        acceptance_token: dto.acceptance_token,
        accept_personal_auth: dto.accept_personal_auth,
        customer_data: dto.customer_data,
      }),
    });

    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.error('Wompi payment source creation failed', error);
      throw new HttpException(error, res.status);
    }

    return (await res.json()) as WompiPaymentSourceResponse;
  }

  /**
   * Estado de un token NEQUI (docs: la fuente de pago solo se puede crear
   * cuando el token pasa a APPROVED, es decir, el usuario aceptó la
   * suscripción en la app Nequi). GET /tokens/nequi/{id} con llave pública.
   */
  async getNequiTokenStatus(tokenId: string): Promise<string | null> {
    if (this.dryRun) return 'APPROVED';

    const res = await fetch(`${this.baseUrl}/tokens/nequi/${tokenId}`, {
      headers: { Authorization: `Bearer ${this.publicKey}` },
    });

    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.error('Wompi get nequi token failed', error);
      throw new HttpException(error, res.status);
    }

    const data = (await res.json()) as { data?: { status?: string } };
    return data.data?.status ?? null;
  }

  /**
   * Consulta el estado real de una transacción (usado por el cron de
   * conciliación cuando el webhook no llegó). GET /transactions/{id}.
   */
  async getTransaction(
    transactionId: string,
  ): Promise<{ status: string; status_message?: string }> {
    if (this.dryRun) return { status: 'APPROVED' };

    const res = await fetch(`${this.baseUrl}/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${this.privateKey}` },
    });

    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.error('Wompi get transaction failed', error);
      throw new HttpException(error, res.status);
    }

    const data = (await res.json()) as { data?: { status?: string; status_message?: string } };
    return {
      status: data.data?.status ?? 'UNKNOWN',
      status_message: data.data?.status_message,
    };
  }

  /**
   * Config del Widget de Wompi (checkout modal del cliente). La firma de
   * integridad se calcula AQUÍ en el servidor — la integrity key nunca viaja
   * al navegador. Verificado contra la doc oficial (widget-checkout-web).
   */
  getCheckoutConfig(opts: {
    amountInCents: number;
    reference: string;
    customerEmail: string;
    redirectUrl?: string;
  }): {
    publicKey: string;
    currency: 'COP';
    amountInCents: number;
    reference: string;
    signature: { integrity: string };
    customerData: { email: string };
    redirectUrl?: string;
  } {
    return {
      publicKey: this.publicKey,
      currency: 'COP',
      amountInCents: opts.amountInCents,
      reference: opts.reference,
      signature: {
        integrity: this.buildIntegritySignature(opts.reference, opts.amountInCents, 'COP'),
      },
      customerData: { email: opts.customerEmail },
      redirectUrl: opts.redirectUrl,
    };
  }

  async getMerchantInfo(): Promise<WompiMerchantResponse['data']> {
    if (this.dryRun) {
      return {
        presigned_acceptance: { acceptance_token: 'acceptance_token_dry_run' },
        presigned_personal_data_auth: { acceptance_token: 'personal_data_auth_dry_run' },
        acceptance_policies: {},
      };
    }

    const res = await fetch(`${this.baseUrl}/merchants/${this.publicKey}`);

    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      this.logger.error('Wompi get merchant info failed', error);
      throw new HttpException(error, res.status);
    }

    const data = (await res.json()) as WompiMerchantResponse;
    return data.data;
  }

  async getAcceptanceToken(): Promise<string> {
    const merchant = await this.getMerchantInfo();
    return merchant.presigned_acceptance.acceptance_token;
  }

  async getPersonalDataAuthToken(): Promise<string> {
    const merchant = await this.getMerchantInfo();
    const token = merchant.presigned_personal_data_auth?.acceptance_token;
    if (!token) {
      throw new HttpException('Personal data auth token not available', 502);
    }
    return token;
  }
}
