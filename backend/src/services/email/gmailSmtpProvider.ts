import nodemailer from 'nodemailer';
import type { EmailProvider, EmailSendRequest } from './emailProvider.js';
import { getConfiguredSender } from './emailProvider.js';
import { getEmailAddressIssue } from './recipientValidation.js';

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

    const recipientIssue = request.to.length === 0
      ? 'invalid'
      : request.to
        .map((recipient) => getEmailAddressIssue(recipient?.email))
        .find((issue) => issue !== undefined);
    if (recipientIssue) {
      return {
        ok: false,
        error: recipientIssue === 'placeholder'
          ? 'Placeholder recipient address; delivery was not attempted'
          : 'Invalid recipient address; delivery was not attempted',
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
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      });

      const info = await transporter.sendMail({
        from,
        to: normalizedRecipients,
        subject: request.subject,
        html: request.html ?? request.text ?? '',
        text: request.text ?? request.html ?? '',
      });

      const accepted = Array.isArray(info.accepted) ? info.accepted.length : 0;
      const rejected = Array.isArray(info.rejected) ? info.rejected.length : 0;
      const expectedRecipients = request.to.filter((recipient) => Boolean(recipient?.email)).length;
      if (accepted !== expectedRecipients || rejected > 0) {
        const responseCode = typeof info.response === "string"
          ? Number(info.response.match(/\b([245]\d\d)\b/)?.[1])
          : undefined;
        const retryable = accepted === 0 && responseCode !== undefined && responseCode >= 400 && responseCode < 500;
        return {
          ok: false,
          error: "Gmail SMTP did not confirm acceptance of every recipient",
          retryable,
        };
      }

      return {
        ok: true,
        id: info.messageId,
      };
    } catch (error) {
      const smtpError = error && typeof error === 'object'
        ? error as {
            code?: unknown;
            originalCode?: unknown;
            responseCode?: unknown;
            timeoutType?: unknown;
            command?: unknown;
          }
        : {};
      const safeCode = (value: unknown): string | undefined =>
        typeof value === 'string' && /^[A-Z][A-Z0-9_-]{0,31}$/i.test(value)
          ? value.toUpperCase()
          : undefined;
      const code = safeCode(smtpError.code) ?? 'UNKNOWN';
      const originalCode = safeCode(smtpError.originalCode);
      const responseCode = typeof smtpError.responseCode === 'number'
        && smtpError.responseCode >= 100 && smtpError.responseCode <= 599
        ? smtpError.responseCode
        : undefined;
      const timeoutType = [
        'CONNECT_TIMEOUT',
        'GREETING_TIMEOUT',
        'UPGRADE_TIMEOUT',
        'SOCKET_TIMEOUT',
      ].find((candidate) => candidate === smtpError.timeoutType);
      const command = typeof smtpError.command === 'string'
        ? smtpError.command.trim().split(/\s+/, 1)[0].toUpperCase()
        : undefined;
      const safeCommand = command && /^[A-Z]{2,12}$/.test(command) ? command : undefined;
      const isAuthenticationFailure =
        code === 'EAUTH' || responseCode === 535 ||
        (error instanceof Error && /auth|credential|username|password/i.test(error.message));
      const isPermanentMessage = error instanceof Error && /invalid/i.test(error.message);
      const networkFailure = [
        'ECONNABORTED',
        'ECONNRESET',
        'EPIPE',
        'ESOCKET',
        'ETIMEDOUT',
      ].includes(code);
      const ambiguousSubmission =
        safeCommand === 'DATA' && responseCode === undefined && networkFailure;
      const retryable = !ambiguousSubmission && !isAuthenticationFailure && !isPermanentMessage &&
        (responseCode === undefined ? true : responseCode < 500);
      const diagnostic = [
        `code=${code}`,
        originalCode ? `originalCode=${originalCode}` : undefined,
        responseCode !== undefined ? `responseCode=${responseCode}` : undefined,
        timeoutType ? `timeoutType=${timeoutType}` : undefined,
        safeCommand ? `command=${safeCommand}` : undefined,
        ambiguousSubmission ? 'submission=ambiguous' : undefined,
      ].filter(Boolean).join(' ');
      return {
        ok: false,
        error: `Gmail SMTP delivery failed (${diagnostic})`,
        retryable,
      };
    }
  }
}

export const getGmailSmtpProvider = (): EmailProvider => new GmailSmtpProvider();
