import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UserRole } from '../users/users.types';

export interface Plan {
    id: string;
    name: string;
    maxMembers: number;
    maxEventsMonth: number;
    overageMemberCents: number;
    features: Record<string, boolean>;
}

export interface ClubLimits {
    planId: string;
    planName: string;
    maxMembers: number;
    maxEventsMonth: number;
    currentMembers: number;
    currentEventsMonth: number;
    overageMemberCents: number;
    features: Record<string, boolean>;
}

@Injectable()
export class PlansService {
    constructor(private readonly db: DatabaseService) { }

    async getClubLimits(clubId: string): Promise<ClubLimits> {
        const { rows: planRows } = await this.db.query<{
            plan_id: string;
            plan_name: string;
            max_members: number;
            max_events_month: number;
            overage_member_cents: number;
            features: Record<string, boolean>;
        }>(
            `SELECT s.plan_id,
                    p.name AS plan_name,
                    p.max_members,
                    p.max_events_month,
                    p.overage_member_cents,
                    COALESCE(p.features, '{}') AS features
             FROM club_subscriptions s
             JOIN plans p ON p.id = s.plan_id
             WHERE s.club_id = $1
             LIMIT 1`,
            [clubId],
        );

        const plan = planRows[0];
        if (!plan) {
            throw new BadRequestException('El club no tiene una suscripción activa');
        }

        const [{ rows: memberRows }, { rows: eventRows }] = await Promise.all([
            this.db.query<{ count: number }>(
                `SELECT COUNT(*)::int AS count FROM club_members WHERE club_id = $1 AND is_active = TRUE`,
                [clubId],
            ),
            this.db.query<{ count: number }>(
                `SELECT COUNT(*)::int AS count
                 FROM events
                 WHERE club_id = $1
                   AND created_at >= DATE_TRUNC('month', NOW())
                   AND created_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`,
                [clubId],
            ),
        ]);

        return {
            planId: plan.plan_id,
            planName: plan.plan_name,
            maxMembers: plan.max_members,
            maxEventsMonth: plan.max_events_month,
            currentMembers: memberRows[0]?.count ?? 0,
            currentEventsMonth: eventRows[0]?.count ?? 0,
            overageMemberCents: plan.overage_member_cents,
            features: plan.features ?? {},
        };
    }

    async checkFeature(clubId: string, feature: string): Promise<boolean> {
        const limits = await this.getClubLimits(clubId);
        return limits.features[feature] === true || limits.features.unlimited === true;
    }

    async assertCanAddMember(clubId: string, userRole?: UserRole): Promise<ClubLimits> {
        const limits = await this.getClubLimits(clubId);
        if (userRole === UserRole.superadmin || limits.maxMembers < 0 || limits.features.unlimited) {
            return limits;
        }
        if (limits.currentMembers >= limits.maxMembers) {
            throw new ForbiddenException(
                `Has alcanzado el límite de ${limits.maxMembers} miembros de tu plan ${limits.planName}. Actualiza tu plan para seguir invitando.`
            );
        }
        return limits;
    }

    async assertCanCreateEvent(clubId: string, userRole?: UserRole): Promise<ClubLimits> {
        const limits = await this.getClubLimits(clubId);
        if (userRole === UserRole.superadmin || limits.maxEventsMonth < 0 || limits.features.unlimited) {
            return limits;
        }
        if (limits.currentEventsMonth >= limits.maxEventsMonth) {
            throw new ForbiddenException(
                `Has alcanzado el límite de ${limits.maxEventsMonth} eventos mensuales de tu plan ${limits.planName}. Actualiza tu plan para crear más eventos.`
            );
        }
        return limits;
    }

    async assertFeature(clubId: string, feature: string, featureLabel: string): Promise<void> {
        const enabled = await this.checkFeature(clubId, feature);
        if (!enabled) {
            throw new ForbiddenException(
                `La funcionalidad "${featureLabel}" no está incluida en tu plan actual. Actualiza tu plan para habilitarla.`
            );
        }
    }
}
