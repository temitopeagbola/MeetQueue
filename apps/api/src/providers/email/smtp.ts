import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailProvider } from './types';

/**
 * Real delivery over SMTP. Works with any free relay (Brevo, Resend SMTP, Gmail app password)
 * and with Mailpit in docker-compose.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp' as const;
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<'SENT'> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      icalEvent: message.ics
        ? {
            method: message.ics.method === 'CANCEL' ? 'cancel' : 'request',
            filename: message.ics.method === 'CANCEL' ? 'cancel.ics' : 'invite.ics',
            content: message.ics.content,
          }
        : undefined,
    });
    return 'SENT';
  }
}
