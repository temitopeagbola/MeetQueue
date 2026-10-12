import type { EmailMessage, EmailProvider } from './types';

type Log = (obj: object, msg: string) => void;

/** Mock provider: records the email in the server log instead of delivering it. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console' as const;
  readonly sent: EmailMessage[] = [];

  constructor(private readonly log: Log = () => {}) {}

  async send(message: EmailMessage): Promise<'LOGGED'> {
    this.sent.push(message);
    this.log(
      { to: message.to, subject: message.subject, ics: message.ics?.method ?? null },
      'email (console provider, not delivered)',
    );
    return 'LOGGED';
  }
}
