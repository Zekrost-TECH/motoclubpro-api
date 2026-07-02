import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface EventReportRow {
    total: number;
    km: number;
    avg_attendees: number;
}

interface SosReportRow {
    total: number;
    resolved: number;
    avg_resolution_minutes: number;
}

interface MemberReportRow {
    total: number;
    active_this_month: number;
    avg_skill: number;
}

interface FinancialReportRow {
    total_paid: number;
    total_pending: number;
    total_failed: number;
    transactions_count: number;
}

interface SupportPointsReportRow {
    total: number;
    verified: number;
    pending: number;
    avg_rating: number;
}

@Injectable()
export class ReportsService {
    constructor(private readonly db: DatabaseService) { }

    async eventsReport(clubId: string, from: string, to: string): Promise<EventReportRow> {
        const { rows } = await this.db.query<EventReportRow>(
            `SELECT
                COUNT(e.id)::int AS total,
                COALESCE(SUM(r.distance_km), 0)::numeric AS km,
                COALESCE(AVG(attendees.count), 0)::numeric AS avg_attendees
             FROM events e
             LEFT JOIN routes r ON r.id = e.route_id
             LEFT JOIN (
                 SELECT event_id, COUNT(*)::int AS count
                 FROM event_attendees
                 GROUP BY event_id
             ) attendees ON attendees.event_id = e.id
             WHERE e.club_id = $1
               AND e.date BETWEEN $2 AND $3`,
            [clubId, from, to],
        );
        return rows[0] ?? { total: 0, km: 0, avg_attendees: 0 };
    }

    async sosReport(clubId: string, from: string, to: string): Promise<SosReportRow> {
        const { rows } = await this.db.query<SosReportRow>(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'resuelta')::int AS resolved,
                COALESCE(AVG(
                    EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60
                ) FILTER (WHERE status = 'resuelta'), 0)::numeric AS avg_resolution_minutes
             FROM sos_alerts
             WHERE club_id = $1
               AND created_at BETWEEN $2 AND $3`,
            [clubId, from, to],
        );
        return rows[0] ?? { total: 0, resolved: 0, avg_resolution_minutes: 0 };
    }

    async membersReport(clubId: string): Promise<MemberReportRow> {
        const { rows } = await this.db.query<MemberReportRow>(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE joined_at >= DATE_TRUNC('month', CURRENT_DATE))::int AS active_this_month,
                COALESCE(AVG(
                    CASE rider_level
                        WHEN 'novato' THEN 1
                        WHEN 'basico' THEN 2
                        WHEN 'intermedio' THEN 3
                        WHEN 'avanzado' THEN 4
                        WHEN 'experto' THEN 5
                    END
                ), 0)::numeric AS avg_skill
             FROM club_members cm
             JOIN users u ON u.id = cm.user_id
             WHERE cm.club_id = $1 AND cm.is_active = TRUE`,
            [clubId],
        );
        return rows[0] ?? { total: 0, active_this_month: 0, avg_skill: 0 };
    }

    async financialReport(clubId: string, from: string, to: string): Promise<FinancialReportRow> {
        const { rows } = await this.db.query<FinancialReportRow>(
            `SELECT
                COALESCE(SUM(amount_cents) FILTER (WHERE status = 'approved'), 0)::numeric / 100 AS total_paid,
                COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0)::numeric / 100 AS total_pending,
                COALESCE(SUM(amount_cents) FILTER (WHERE status = 'failed'), 0)::numeric / 100 AS total_failed,
                COUNT(*)::int AS transactions_count
             FROM payment_transactions
             WHERE club_id = $1
               AND paid_at BETWEEN $2 AND $3`,
            [clubId, from, to],
        );
        return rows[0] ?? { total_paid: 0, total_pending: 0, total_failed: 0, transactions_count: 0 };
    }

    async supportPointsReport(clubId: string): Promise<SupportPointsReportRow> {
        const { rows } = await this.db.query<SupportPointsReportRow>(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE verified = TRUE)::int AS verified,
                COUNT(*) FILTER (WHERE verified = FALSE)::int AS pending,
                COALESCE(AVG(rating), 0)::numeric AS avg_rating
             FROM support_points
             WHERE club_id = $1`,
            [clubId],
        );
        return rows[0] ?? { total: 0, verified: 0, pending: 0, avg_rating: 0 };
    }
}
