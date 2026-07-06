import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

interface InviteMailContext {
    email: string;
    clubName: string;
    inviterName: string;
    tempPassword: string;
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

        const transporter = this.getTransporter();
        if (transporter) {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || 'noreply@biker-os.local',
                to: ctx.email,
                subject,
                text: body,
            });
            this.logger.log(`Invitation email sent to ${ctx.email}`);
        } else {
            this.logger.log(`\n--- EMAIL ---\nTo: ${ctx.email}\nSubject: ${subject}\n\n${body}\n--- END EMAIL ---\n`);
        }
    }
}
