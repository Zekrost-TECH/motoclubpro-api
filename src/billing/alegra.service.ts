import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

interface AlegraInvoiceItem {
  id?: number;
  name: string;
  price: number;
  discount?: string;
  quantity?: number;
  taxes?: { id: number }[];
}

interface AlegraInvoicePayload {
  client: {
    name: string;
    identification?: string;
    address?: string;
    phonePrimary?: string;
    email?: string;
  };
  items: AlegraInvoiceItem[];
  paymentMethod?: string;
  status?: string;
  numberTemplate?: {
    id: number;
  };
  observations?: string;
}

interface AlegraInvoiceResponse {
  id: number;
  number: string;
  cufe: string;
  status: string;
  pdf: string;
}

@Injectable()
export class AlegraService {
  private readonly logger = new Logger(AlegraService.name);
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    this.baseUrl = this.config.get<string>('ALEGRA_BASE_URL') ?? '';
    this.email = this.config.get<string>('ALEGRA_EMAIL') ?? '';
    this.apiKey = this.config.get<string>('ALEGRA_API_KEY') ?? '';
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
        name: `Suscripcion MotoClubPro - ${planName}`,
        price: planAmountCents / 100,
        quantity: 1,
        taxes: [],
      },
    ];

    if (overageAmountCents > 0) {
      items.push({
        name: 'Miembros adicionales',
        price: overageAmountCents / 100,
        quantity: 1,
        taxes: [],
      });
    }

    const observations = this.buildObservations(club.tax_regime);

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
      observations,
    };

    try {
      const res = await fetch(`${this.baseUrl}/invoices`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        this.logger.error('Alegra invoice creation failed', error);
        return null;
      }

      const data = (await res.json()) as AlegraInvoiceResponse;

      await this.db.query(
        `UPDATE payment_transactions
         SET invoice_generated = TRUE,
             dian_invoice_number = $1,
             cufe = $2,
             pdf_url = $3
         WHERE id = $4`,
        [data.number, data.cufe, data.pdf, txId],
      );

      this.logger.log(`Invoice generated: ${data.number} — CUFE: ${data.cufe}`);

      return {
        invoiceNumber: data.number,
        cufe: data.cufe,
        pdfUrl: data.pdf,
      };
    } catch (err) {
      this.logger.error(`Failed to generate invoice for tx ${txId}`, err);
      return null;
    }
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
