import { Injectable, Logger } from '@nestjs/common';

interface InviteMailContext {
    email: string;
    clubName: string;
    inviterName: string;
    tempPassword: string;
    loginUrl: string;
}

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    async sendInvitation(ctx: InviteMailContext): Promise<void> {
        const subject = `Invitación a unirte a ${ctx.clubName} en MotoClub Pro`;
        const body = `
Hola,

${ctx.inviterName} te invitó a unirte a ${ctx.clubName} en MotoClub Pro.

Tu cuenta ha sido creada con la contraseña temporal: ${ctx.tempPassword}
Ingresa aquí: ${ctx.loginUrl}

Te recomendamos cambiar tu contraseña después de iniciar sesión.

Saludos,
Equipo MotoClub Pro
        `.trim();

        if (process.env.SMTP_HOST) {
            // Aquí se integraría nodemailer/resend/sendgrid con las credenciales de env.
            this.logger.log(`[SMTP not configured] Would send email to ${ctx.email}`);
        } else {
            this.logger.log(`\n--- EMAIL ---\nTo: ${ctx.email}\nSubject: ${subject}\n\n${body}\n--- END EMAIL ---\n`);
        }
    }
}
