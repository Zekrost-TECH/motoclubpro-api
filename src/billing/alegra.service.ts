import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

interface AlegraInvoiceItem {
  id?: number | string;
  name: string;
  price: number;
  discount?: string;
  quantity?: number;
  tax?: { id: number | string }[];
}

interface AlegraInvoicePayload {
  client: {
    id?: string | number;
    name: string;
    identification?: string;
    address?: string;
    phonePrimary?: string;
    email?: string;
  };
  items: AlegraInvoiceItem[];
  paymentMethod?: string;
  paymentForm?: string;
  status?: string;
  numberTemplate?: {
    id: number | string;
  };
  observations?: string;
  stamp?: {
    generateStamp: boolean;
  };
}

interface AlegraInvoiceResponse {
  id: number | string;
  number: string;
  cufe?: string;
  status: string;
  pdf?: string;
}

@Injectable()
export class AlegraService {
  private readonly logger = new Logger(AlegraService.name);
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly apiKey: string;
  private readonly numberTemplateId: string | null;
  private readonly itemPlanId: string | null;
  private readonly itemOverageId: string | null;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    this.baseUrl = this.config.get<string>('ALEGRA_BASE_URL') ?? '';
    this.email = this.config.get<string>('ALEGRA_EMAIL') ?? '';
    this.apiKey = this.config.get<string>('ALEGRA_API_KEY') ?? '';
    this.numberTemplateId = this.config.get<string>('ALEGRA_NUMBER_TEMPLATE_ID') ?? null;
    this.itemPlanId = this.config.get<string>('ALEGRA_ITEM_PLAN_ID') ?? null;
    this.itemOverageId = this.config.get<string>('ALEGRA_ITEM_OVERAGE_ID') ?? null;
  }

  async generateInvoice(
    clubId: string,
    txId: string,
    planName: string,
    planAmountCents: number,
    overageAmountCents: number,
  ): Promise<{ invoiceNumber: string; cufe: string; pdfUrl: string } | null> {
    if (!this.email || !this.apiKey) {
      this.logger.error('Alegra credentials not configured');
      return null;
    }

    const { rows: clubRows } = await this.db.query<{
      name: string;
      nit: string | null;
      billing_address: string | null;
      billing_phone: string | null;
      billing_contact_email: string | null;
      tax_regime: string | null;
    }>(
      `SELECT name, nit, billing_address, billing_phone,
              billing_contact_email, tax_regime
       FROM clubs
       WHERE id = $1`,
      [clubId],
    );

    if (clubRows.length === 0) {
      this.logger.warn(`Club ${clubId} not found for invoicing`);
      return null;
    }

    const club = clubRows[0];

    const items: AlegraInvoiceItem[] = [
      {
        id: this.itemPlanId ?? undefined,
        name: `Suscripcion BikerOS - ${planName}`,
        price: planAmountCents / 100,
        quantity: 1,
        tax: [],
      },
    ];

    if (overageAmountCents > 0) {
      items.push({
        id: this.itemOverageId ?? undefined,
        name: 'Miembros adicionales',
        price: overageAmountCents / 100,
        quantity: 1,
        tax: [],
      });
    }

    const observations = this.buildObservations(club.tax_regime);

    // Factura electrónica Colombia (docs Alegra 2025):
    // - stamp.generateStamp=true  → expide la factura ante la DIAN (genera CUFE)
    // - paymentForm/paymentMethod → obligatorios con facturación electrónica 2.1
    // - numberTemplate.id         → numeración electrónica (opcional si la empresa
    //                               tiene una numeración preferida configurada)
    const payload: AlegraInvoicePayload = {
      client: {
        name: club.name,
        identification: club.nit ?? undefined,
        address: club.billing_address ?? undefined,
        phonePrimary: club.billing_phone ?? undefined,
        email: club.billing_contact_email ?? undefined,
      },
      items,
      status: 'open',
      paymentForm: 'CASH',
      paymentMethod: 'CASH',
      observations,
      stamp: { generateStamp: true },
      ...(this.numberTemplateId ? { numberTemplate: { id: this.numberTemplateId } } : {}),
    };

    let data: AlegraInvoiceResponse;

    try {
      const res = await fetch(`${this.baseUrl}/invoices`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Si el timbre falla, Alegra crea la factura en borrador y responde 400
      // con la factura creada: se guarda la factura y se reintenta el timbre después.
      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        this.logger.error('Alegra invoice creation failed', error);
        return null;
      }

      data = (await res.json()) as AlegraInvoiceResponse;
    } catch (err) {
      this.logger.error(`Failed to generate invoice for tx ${txId}`, err);
      return null;
    }

    // pdf/cufe no vienen por defecto en la respuesta: se consultan con fields=pdf,xml
    let pdfUrl = data.pdf ?? null;
    if (!pdfUrl) {
      try {
        const detailRes = await fetch(`${this.baseUrl}/invoices/${data.id}?fields=pdf,xml,comments,events`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiKey}`).toString('base64')}`,
          },
        });
        if (detailRes.ok) {
          const detail = (await detailRes.json()) as { pdf?: string; cufe?: string };
          pdfUrl = detail.pdf ?? null;
          data.cufe = detail.cufe ?? data.cufe;
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch invoice detail ${data.id}`, err);
      }
    }

    await this.db.query(
      `UPDATE payment_transactions
       SET invoice_generated = TRUE,
           dian_invoice_number = $1,
           cufe = $2,
           pdf_url = $3
       WHERE id = $4`,
      [data.number, data.cufe ?? null, pdfUrl, txId],
    );

    this.logger.log(`Invoice generated: ${data.number} — CUFE: ${data.cufe ?? 'n/a'}`);

    return {
      invoiceNumber: data.number,
      cufe: data.cufe ?? '',
      pdfUrl: pdfUrl ?? '',
    };
  }

  private buildObservations(taxRegime: string | null): string {
    const lines: string[] = [
      'Operador: Zekrost — Persona natural comerciante',
      'Condicion fiscal: Exenta de IVA (tarifa 0%)',
    ];

    if (taxRegime === 'comun' || taxRegime === 'simplificado') {
      lines.push('Retencion en la fuente: El cliente debe practicar retencion del 11% conforme a la normativa vigente.');
    }

    return lines.join('. ');
  }
}
