import nodemailer from 'nodemailer';
import type { EmailProvider, EmailSendRequest } from './emailProvider.js';
import { getConfiguredSender } from './emailProvider.js';

export class GmailSmtpProvider implements EmailProvider {
  isConfigured(): boolean {
    return Boolean(
      process.env.GMAIL_USER?.trim() &&
      process.env.GMAIL_APP_PASSWORD?.trim() &&
      getConfiguredSender(),
    );
  }

  async send(request: EmailSendRequest): Promise<{
    ok: boolean;
    id?: string;
    skipped?: boolean;
    error?: string;
    retryable?: boolean;
  }> {
    const user = process.env.GMAIL_USER?.trim();
    const pass = process.env.GMAIL_APP_PASSWORD?.trim();
    const from = request.from ?? getConfiguredSender();

    if (!user || !pass || !from) {
      return {
        ok: false,
        skipped: true,
        error: 'Gmail SMTP is not configured. Set GMAIL_USER, GMAIL_APP_PASSWORD and EMAIL_FROM.',
        retryable: false,
      };
    }

    const normalizedRecipients = request.to
      .filter((recipient) => Boolean(recipient?.email))
      .map((recipient) => recipient.email)
      .join(', ');

    if (!normalizedRecipients) {
      return {
        ok: false,
        skipped: true,
        error: 'No valid recipients supplied.',
        retryable: false,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });

      const info = await transporter.sendMail({
        from,
        to: normalizedRecipients,
        subject: request.subject,
        html: request.html ?? request.text ?? '',
        text: request.text ?? request.html ?? '',
      });

      return {
        ok: true,
        id: info.messageId,
      };
    } catch (error) {
      const smtpError = error && typeof error === 'object'
        ? error as { code?: unknown; responseCode?: unknown }
        : {};
      const code = typeof smtpError.code === 'string' ? smtpError.code : 'UNKNOWN';
      const responseCode = typeof smtpError.responseCode === 'number'
        ? smtpError.responseCode
        : undefined;
      const isAuthenticationFailure =
        code === 'EAUTH' || responseCode === 535 ||
        (error instanceof Error && /auth|credential|username|password/i.test(error.message));
      const isPermanentMessage = error instanceof Error && /invalid/i.test(error.message);
      const retryable = !isAuthenticationFailure && !isPermanentMessage &&
        (responseCode === undefined ? true : responseCode < 500);
      return {
        ok: false,
        error: `Gmail SMTP delivery failed (${code}${responseCode ? `/${responseCode}` : ''})`,
        retryable,
      };
    }
  }
}

export const getGmailSmtpProvider = (): EmailProvider => new GmailSmtpProvider();
