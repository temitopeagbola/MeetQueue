/**
 * The demo host's dashboard is shared by every visitor, so visitors' real email addresses
 * must not be readable there. Sample invitees (example.com) stay legible.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const domain = email.slice(at + 1);
  if (domain === 'example.com') return email;
  return `${email.slice(0, Math.min(2, at))}***@${domain}`;
}

/** Replaces every email address in free text with its masked form. */
export function maskEmailsIn(text: string): string {
  return text.replace(/[^\s<>()"',;:]+@[^\s<>()"',;:]+\.[a-z]{2,}/gi, (match) => maskEmail(match));
}
