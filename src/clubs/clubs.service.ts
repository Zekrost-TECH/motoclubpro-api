import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface ClubRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  city: string | null;
  department: string | null;
  nit: string | null;
  billing_address: string | null;
  billing_phone: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  tax_regime: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface MemberRow {
  id: string;
  user_id: string;
  club_id: string;
  role: string;
  joined_at: Date;
  is_active: boolean;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface PlanRow {
  id: string;
  name: string;
}

export interface SubscriptionRow {
  id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  current_period_end: Date | null;
}

@Injectable()
export class ClubsService {
  private readonly logger = new Logger(ClubsService.name);

  constructor(private readonly db: DatabaseService) { }

  async create(data: {
    name: string;
    slug: string;
    city?: string;
    department?: string;
    ownerUserId: string;
  }): Promise<ClubRow> {
    const client = await this.db.getPool().connect();

    try {
      await client.query('BEGIN');

      const { rows: clubRows } = await client.query<ClubRow>(
        `INSERT INTO clubs (name, slug, city, department)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug, logo_url, city, department, nit,
                   billing_address, billing_phone, billing_contact_name,
                   billing_contact_email, tax_regime, is_active, created_at`,
        [data.name, data.slug, data.city ?? null, data.department ?? null],
      );

      const club = clubRows[0];

      await client.query(
        `INSERT INTO club_members (club_id, user_id, role)
         VALUES ($1, $2, 'admin')`,
        [club.id, data.ownerUserId],
      );

      const { rows: planRows } = await client.query<PlanRow>(
        `SELECT id FROM plans WHERE id = 'prueba'`,
      );

      if (planRows.length > 0) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 21);

        await client.query(
          `INSERT INTO club_subscriptions
           (club_id, plan_id, status, billing_cycle, trial_ends_at, current_period_end)
           VALUES ($1, $2, 'trial', 'monthly', $3, $3)`,
          [club.id, planRows[0].id, trialEnd],
        );
      }

      await client.query('COMMIT');
      return club;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => { });
      throw err;
    } finally {
      client.release();
    }
  }

  async findBySlug(slug: string): Promise<ClubRow | null> {
    const { rows } = await this.db.query<ClubRow>(
      `SELECT id, name, slug, logo_url, city, department, nit,
              billing_address, billing_phone, billing_contact_name,
              billing_contact_email, tax_regime, is_active, created_at
       FROM clubs
       WHERE slug = $1 AND is_active = TRUE`,
      [slug],
    );
    return rows[0] ?? null;
  }

  async findMembers(clubId: string, page = 1, limit = 20): Promise<{ data: MemberRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const countQuery = `SELECT COUNT(*)::int as count FROM club_members WHERE club_id = $1 AND is_active = TRUE`;
    const query = `
      SELECT cm.id, cm.user_id, cm.club_id, cm.role, cm.joined_at, cm.is_active,
             u.name, u.email, u.avatar_url
      FROM club_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.club_id = $1 AND cm.is_active = TRUE
      ORDER BY cm.joined_at DESC
      LIMIT $2 OFFSET $3`;

    const offset = (page - 1) * limit;
    const [{ rows: countRows }, { rows }] = await Promise.all([
      this.db.query<{ count: number }>(countQuery, [clubId]),
      this.db.query<MemberRow>(query, [clubId, limit, offset]),
    ]);

    const total = countRows[0]?.count ?? 0;
    return {
      data: rows,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async inviteMember(clubId: string, userId: string, role: string): Promise<void> {
    await this.db.query(
      `INSERT INTO club_members (club_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (club_id, user_id) DO UPDATE
       SET role = $3, is_active = TRUE`,
      [clubId, userId, role],
    );
  }

  async joinClub(clubId: string, userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO club_members (club_id, user_id, role)
       VALUES ($1, $2, 'piloto')
       ON CONFLICT (club_id, user_id) DO UPDATE
       SET is_active = TRUE`,
      [clubId, userId],
    );
  }

  async removeMember(clubId: string, userId: string): Promise<void> {
    await this.db.query(
      `UPDATE club_members
       SET is_active = FALSE
       WHERE club_id = $1 AND user_id = $2`,
      [clubId, userId],
    );
  }

  async getSubscription(clubId: string): Promise<SubscriptionRow | null> {
    const { rows } = await this.db.query<SubscriptionRow>(
      `SELECT s.id, s.plan_id, s.status, s.billing_cycle, s.current_period_end
       FROM club_subscriptions s
       WHERE s.club_id = $1`,
      [clubId],
    );
    return rows[0] ?? null;
  }

  async update(
    clubId: string,
    data: {
      name?: string;
      city?: string;
      department?: string;
      description?: string;
    },
  ): Promise<ClubRow> {
    const { rows } = await this.db.query<ClubRow>(
      `UPDATE clubs
       SET name = COALESCE($1, name),
           city = COALESCE($2, city),
           department = COALESCE($3, department),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, slug, logo_url, city, department, nit,
                 billing_address, billing_phone, billing_contact_name,
                 billing_contact_email, tax_regime, is_active, created_at`,
      [data.name ?? null, data.city ?? null, data.department ?? null, clubId],
    );
    return rows[0];
  }

  async getBillingInfo(clubId: string): Promise<Pick<ClubRow, 'nit' | 'billing_address' | 'billing_phone' | 'billing_contact_name' | 'billing_contact_email' | 'tax_regime'> | null> {
    const { rows } = await this.db.query<ClubRow>(
      `SELECT nit, billing_address, billing_phone, billing_contact_name, billing_contact_email, tax_regime
       FROM clubs WHERE id = $1`,
      [clubId],
    );
    if (!rows[0]) return null;
    return {
      nit: rows[0].nit,
      billing_address: rows[0].billing_address,
      billing_phone: rows[0].billing_phone,
      billing_contact_name: rows[0].billing_contact_name,
      billing_contact_email: rows[0].billing_contact_email,
      tax_regime: rows[0].tax_regime,
    };
  }

  async updateBillingInfo(
    clubId: string,
    data: {
      nit?: string;
      billingAddress?: string;
      billingPhone?: string;
      billingContactName?: string;
      billingContactEmail?: string;
      taxRegime?: string;
    },
  ): Promise<void> {
    await this.db.query(
      `UPDATE clubs
       SET nit = COALESCE($1, nit),
           billing_address = COALESCE($2, billing_address),
           billing_phone = COALESCE($3, billing_phone),
           billing_contact_name = COALESCE($4, billing_contact_name),
           billing_contact_email = COALESCE($5, billing_contact_email),
           tax_regime = COALESCE($6, tax_regime),
           updated_at = NOW()
       WHERE id = $7`,
      [
        data.nit ?? null,
        data.billingAddress ?? null,
        data.billingPhone ?? null,
        data.billingContactName ?? null,
        data.billingContactEmail ?? null,
        data.taxRegime ?? null,
        clubId,
      ],
    );
  }
}
