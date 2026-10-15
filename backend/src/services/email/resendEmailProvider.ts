import { Resend } from 'resend';
import type { EmailProvider, EmailSendRequest } from './emailProvider.js';
import { getConfiguredSender } from './emailProvider.js';

const redactSensitiveText = (value: string): string => value
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]')
  .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
  .replace(/\bre_[A-Za-z0-9_-]+\b/g, '[credential redacted]');

const errorMetadata = (error: unknown): { message: string; retryable: boolean } => {
  const providerError = error && typeof error === 'object'
    ? error as { message?: unknown; statusCode?: unknown }
    : undefined;
  const message = typeof providerError?.message === 'string'
    ? providerError.message
    : 'Unknown email provider error';
  const statusCode = typeof providerError?.statusCode === 'number'
    ? providerError.statusCode
    : undefined;
  return {
    message: redactSensitiveText(message),
    retryable: statusCode === undefined || statusCode === 429 || statusCode >= 500,
  };
};

export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly client?: Resend) {}

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY?.trim() && getConfiguredSender());
  }

  async send(request: EmailSendRequest): Promise<{
    ok: boolean;
    id?: string;
    skipped?: boolean;
    error?: string;
    retryable?: boolean;
  }> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = request.from ?? getConfiguredSender();
    if (!apiKey || !from) {
      return {
        ok: false,
        skipped: true,
        error: 'Email provider is not configured. Set RESEND_API_KEY and EMAIL_FROM.',
        retryable: false,
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
        retryable: false,
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
        const failure = errorMetadata(response.error);
        return {
          ok: false,
          error: failure.message,
          retryable: failure.retryable,
        };
      }

      return {
        ok: true,
        id: response.data.id,
      };
    } catch (error) {
      const failure = errorMetadata(error);
      return {
        ok: false,
        error: failure.message,
        retryable: failure.retryable,
      };
    }
  }
}

export const getResendEmailProvider = (): EmailProvider => new ResendEmailProvider();
