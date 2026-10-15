export type EmailRecipient = {
  email: string;
  name?: string | null;
};

export type EmailSendRequest = {
  to: EmailRecipient[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  idempotencyKey?: string;
};

export interface EmailProvider {
  isConfigured(): boolean;
  send(request: EmailSendRequest): Promise<{
    ok: boolean;
    id?: string;
    skipped?: boolean;
    error?: string;
    retryable?: boolean;
  }>;
}

export const getConfiguredSender = (): string | undefined => {
  const sender = process.env.EMAIL_FROM?.trim();
  return sender || undefined;
};

export const isEmailConfigured = (): boolean => {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim();
  const sender = getConfiguredSender();
  return Boolean(gmailUser && gmailPass && sender);
};
