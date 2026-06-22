import { Controller, Post, Body, BadRequestException, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import type { WompiWebhookEvent } from './billing.types';

@Controller('webhooks/wompi')
@ApiTags('billing')
@Throttle({ default: { limit: 200, ttl: 60000 } })
export class WompiWebhookController {
  private readonly logger = new Logger(WompiWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly billingService: BillingService,
  ) { }

  @Post()
  async handleWebhook(@Body() event: WompiWebhookEvent): Promise<{ received: boolean }> {
    const secret = this.config.get<string>('WOMPI_EVENTS_SECRET');
    if (!secret) {
      this.logger.error('WOMPI_EVENTS_SECRET is not configured');
      throw new BadRequestException('Webhook secret not configured');
    }

    if (!this.verifyChecksum(event, secret)) {
      this.logger.warn('Invalid webhook checksum');
      throw new BadRequestException('Invalid checksum');
    }

    this.logger.log(`Received Wompi event: ${event.event}`);

    switch (event.event) {
      case 'transaction.updated':
        await this.handleTransactionUpdated(event.data.transaction);
        break;
      case 'nequi_token.updated':
        this.handleNequiTokenUpdated(event.data.transaction);
        break;
      default:
        this.logger.verbose(`Unhandled event type: ${event.event}`);
    }

    return { received: true };
  }

  private verifyChecksum(event: WompiWebhookEvent, secret: string): boolean {
    const { properties, timestamp } = event;

    const values = properties.map((prop: string) => {
      const parts = prop.split('.');
      let val: unknown = event;
      for (const p of parts) {
        val = (val as Record<string, unknown>)?.[p];
      }
      return typeof val === 'string' || typeof val === 'number' ? String(val) : '';
    });

    const payload = values.join('') + timestamp + secret;
    const computed = createHash('sha256').update(payload).digest('hex');
    return computed === event.checksum;
  }

  private async handleTransactionUpdated(data: WompiWebhookEvent['data']['transaction']) {
    const { id, status, reference, status_message } = data;

    if (status === 'APPROVED') {
      await this.billingService.confirmPayment(id, reference);
    } else if (status === 'DECLINED') {
      await this.billingService.markPaymentFailed(id, reference, status_message);
    } else if (status === 'VOIDED') {
      await this.billingService.handleVoidedTransaction(id, reference);
    }
  }

  private handleNequiTokenUpdated(data: WompiWebhookEvent['data']['transaction']) {
    this.logger.log(`Nequi token updated: ${data.id} — status ${data.status}`);
  }
}
