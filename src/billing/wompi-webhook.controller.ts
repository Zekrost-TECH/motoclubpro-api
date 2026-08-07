import { Controller, Post, Body, Headers, BadRequestException, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { DatabaseService } from '../database/database.service';
import type { WompiWebhookEvent } from './billing.types';

@Controller('webhooks/wompi')
@ApiTags('billing')
@Throttle({ default: { limit: 200, ttl: 60000 } })
export class WompiWebhookController {
  private readonly logger = new Logger(WompiWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly billingService: BillingService,
    private readonly db: DatabaseService,
  ) { }

  @Post()
  async handleWebhook(
    @Body() event: WompiWebhookEvent,
    @Headers('x-event-checksum') headerChecksum?: string,
  ): Promise<{ received: boolean }> {
    const secret = this.config.get<string>('WOMPI_EVENTS_SECRET');
    if (!secret) {
      this.logger.error('WOMPI_EVENTS_SECRET is not configured');
      throw new BadRequestException('Webhook secret not configured');
    }

    if (!this.verifyChecksum(event, secret, headerChecksum)) {
      this.logger.warn(`Invalid webhook checksum (event=${event.event}, tx=${event.data?.transaction?.id})`);
      throw new BadRequestException('Invalid checksum');
    }

    this.logger.log(`Received Wompi event: ${event.event}`);

    switch (event.event) {
      case 'transaction.updated':
        await this.handleTransactionUpdated(event.data.transaction);
        break;
      case 'nequi_token.updated':
        await this.handleNequiTokenUpdated(event.data.transaction);
        break;
      default:
        this.logger.verbose(`Unhandled event type: ${event.event}`);
    }

    return { received: true };
  }

  private verifyChecksum(
    event: WompiWebhookEvent,
    secret: string,
    headerChecksum?: string,
  ): boolean {
    const signature = event.signature;
    if (!signature?.properties || !signature?.checksum) {
      return false;
    }

    // Las rutas en properties apuntan a campos DENTRO de data (docs Wompi):
    // p.ej. "transaction.id" -> event.data.transaction.id
    const values = signature.properties.map((prop: string) => {
      const parts = prop.split('.');
      let val: unknown = event.data;
      for (const p of parts) {
        if (val === null || val === undefined) return '';
        val = (val as Record<string, unknown>)?.[p];
      }
      return typeof val === 'string' || typeof val === 'number' ? String(val) : '';
    });

    const payload = values.join('') + event.timestamp + secret;
    const computed = createHash('sha256').update(payload).digest('hex');

    // Wompi envía el checksum en el body (signature.checksum) y en el header
    // X-Event-Checksum; se valida contra cualquiera de los dos.
    const expected = (headerChecksum ?? signature.checksum).toLowerCase();
    const provided = Buffer.from(computed, 'hex');
    const incoming = Buffer.from(expected, 'hex');
    if (provided.length !== incoming.length) return false;
    return timingSafeEqual(provided, incoming);
  }

  private async handleTransactionUpdated(data: WompiWebhookEvent['data']['transaction']) {
    const { id, status, reference, status_message } = data;

    if (status === 'APPROVED') {
      await this.billingService.confirmPayment(id, reference);
    } else if (status === 'DECLINED') {
      await this.billingService.markPaymentFailed(id, reference, status_message);
    } else if (status === 'VOIDED') {
      await this.billingService.handleVoidedTransaction(id, reference);
    } else if (status === 'ERROR') {
      await this.billingService.markPaymentFailed(id, reference, status_message);
    }
  }

  private async handleNequiTokenUpdated(data: WompiWebhookEvent['data']['transaction']) {
    const { id, status, payment_source_id } = data;
    // El id del evento es el del payment source Nequi (verificado en sandbox).
    const sourceId = payment_source_id ?? id;
    if (!sourceId) {
      this.logger.warn('nequi_token.updated sin id de fuente de pago');
      return;
    }

    const { rowCount } = await this.db.query(
      `UPDATE clubs
       SET wompi_payment_source_status = $1, updated_at = NOW()
       WHERE wompi_payment_source_id = $2`,
      [status, String(sourceId)],
    );

    if (rowCount === 0) {
      this.logger.warn(`Nequi source ${sourceId} sin club asociado (status=${status})`);
    } else {
      this.logger.log(`Nequi source ${sourceId} actualizado a ${status}`);
    }
  }
}
