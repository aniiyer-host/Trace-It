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
  send(request: EmailSendRequest): Promise<{ ok: boolean; id?: string; skipped?: boolean; error?: string }>;
}

export const getConfiguredSender = (): string | undefined => {
  const sender = process.env.EMAIL_FROM?.trim();
  return sender || undefined;
};

export const isEmailConfigured = (): boolean => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const sender = getConfiguredSender();
  return Boolean(apiKey && sender);
};
