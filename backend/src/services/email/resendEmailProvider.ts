import { Resend } from 'resend';
import type { EmailProvider, EmailSendRequest } from './emailProvider.js';
import { getConfiguredSender } from './emailProvider.js';

export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly client?: Resend) {}

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY?.trim() && getConfiguredSender());
  }

  async send(request: EmailSendRequest): Promise<{ ok: boolean; id?: string; skipped?: boolean; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = request.from ?? getConfiguredSender();
    if (!apiKey || !from) {
      return {
        ok: false,
        skipped: true,
        error: 'Email provider is not configured. Set RESEND_API_KEY and EMAIL_FROM.',
      };
    }

    const normalizedRecipients = request.to
      .filter((recipient) => Boolean(recipient?.email))
      .map((recipient) => recipient.email);

    if (normalizedRecipients.length === 0) {
      return {
        ok: false,
        skipped: true,
        error: 'No valid recipients supplied.',
      };
    }

    try {
      const client = this.client ?? new Resend(apiKey);
      const response = await client.emails.send({
        from,
        to: normalizedRecipients,
        subject: request.subject,
        html: request.html ?? request.text ?? '',
        text: request.text ?? request.html ?? '',
      }, request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : undefined);

      if (response.data === null) {
        return {
          ok: false,
          error: response.error.message,
        };
      }

      return {
        ok: true,
        id: response.data.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email provider error';
      return {
        ok: false,
        error: message,
      };
    }
  }
}

export const getResendEmailProvider = (): EmailProvider => new ResendEmailProvider();
