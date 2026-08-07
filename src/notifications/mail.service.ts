import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

interface InviteMailContext {
    email: string;
    clubName: string;
    inviterName: string;
    tempPassword: string;
}

interface SuspensionMailContext {
    email: string;
    clubName: string;
    reason?: string | null;
}

interface WelcomeClubMailContext {
    email: string;
    clubName: string;
}

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    private getTransporter(): nodemailer.Transporter | null {
        const host = process.env.SMTP_HOST;
        if (!host) return null;
        return nodemailer.createTransport({
            host,
            port: Number(process.env.SMTP_PORT) || 587,
            auth: process.env.SMTP_USER
                ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
                : undefined,
        });
    }

    async sendInvitation(ctx: InviteMailContext): Promise<void> {
        const subject = `Invitación a unirte a ${ctx.clubName} en BikerOS`;
        const body = `
Hola,

${ctx.inviterName} te invitó a unirte a ${ctx.clubName} en BikerOS.

Tu cuenta ha sido creada con la contraseña temporal: ${ctx.tempPassword}
Descarga la app BikerOS e inicia sesión con tu correo y esta contraseña.

Te recomendamos cambiar tu contraseña después de iniciar sesión.

Saludos,
Equipo BikerOS
        `.trim();

        await this.send(ctx.email, subject, body);
    }

    async sendSubscriptionSuspended(ctx: SuspensionMailContext): Promise<void> {
        const subject = `Suscripción de ${ctx.clubName} suspendida`;
        const body = `
Hola,

La suscripción de ${ctx.clubName} en BikerOS fue suspendida después de 3 intentos de cobro fallidos${ctx.reason ? ` (motivo: ${ctx.reason})` : ''}.

Para reactivarla, actualiza el método de pago en el panel de administración de tu club.

Saludos,
Equipo BikerOS
        `.trim();

        await this.send(ctx.email, subject, body);
    }

    async sendWelcomeClub(ctx: WelcomeClubMailContext): Promise<void> {
        const adminUrl = process.env.ADMIN_WEB_URL ?? 'https://admin.bikeros.co';
        const subject = `Tu club ${ctx.clubName} en BikerOS está listo 🏍️`;
        const body = `
Hola,

Tu club "${ctx.clubName}" fue creado en BikerOS y tu prueba gratis de 21 días ya está activa.

Para comenzar:
1. Ingresa a ${adminUrl} con el correo y la contraseña que registraste.
2. Invita a los miembros de tu club desde el panel.
3. Cuando quieras quedarte, elige un plan y paga con tarjeta, Nequi o PSE.

Si recibiste este correo sin haber creado el club, ignóralo: nadie más podrá usar tu correo.

Saludos,
Equipo BikerOS
        `.trim();

        await this.send(ctx.email, subject, body);
    }

    private async send(email: string, subject: string, body: string): Promise<void> {
        const transporter = this.getTransporter();
        if (transporter) {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || 'noreply@biker-os.local',
                to: email,
                subject,
                text: body,
            });
            this.logger.log(`Email sent to ${email}: ${subject}`);
        } else {
            this.logger.log(`\n--- EMAIL ---\nTo: ${email}\nSubject: ${subject}\n\n${body}\n--- END EMAIL ---\n`);
        }
    }
}
