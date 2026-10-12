export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Calendar invitation sent as a proper text/calendar part (and attachment). */
  ics?: { method: 'REQUEST' | 'CANCEL'; content: string };
}

export type EmailProviderName = 'smtp' | 'console';

export interface EmailProvider {
  readonly name: EmailProviderName;
  /** Resolves 'SENT' when handed to a mail server, 'LOGGED' when only logged. */
  send(message: EmailMessage): Promise<'SENT' | 'LOGGED'>;
}
