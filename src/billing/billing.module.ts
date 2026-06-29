import { Module } from '@nestjs/common';
import { WompiService } from './wompi.service';
import { WompiWebhookController } from './wompi-webhook.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingCronService } from './billing-cron.service';
import { AlegraService } from './alegra.service';

@Module({
  controllers: [WompiWebhookController, BillingController],
  providers: [WompiService, BillingService, BillingCronService, AlegraService],
  exports: [WompiService, BillingService, AlegraService],
})
export class BillingModule { }
