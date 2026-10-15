const REQUIRED_PRODUCTION_SECRETS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "EMAIL_FROM",
  "BENEFICIARY_HMAC_SECRET",
  "AES_DOCUMENT_KEY",
] as const;

const isValidSender = (value: string): boolean => {
  if (!/^(?:[^<>]*<[^<>]+>|[^<>]+)$/.test(value)) {
    return false;
  }
  const address = value.match(/<([^<>]+)>/)?.[1] ?? value;
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address);
};

const isValidEmailAddress = (value: string): boolean =>
  /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);

/**
 * Verifies configuration that must be supplied before the production server
 * accepts requests.
 */
export function validateEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.NODE_ENV !== "production") {
    return;
  }

  const missingVariables = REQUIRED_PRODUCTION_SECRETS.filter(
    (name) => !environment[name]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missingVariables.join(", ")}`,
    );
  }

  const emailFrom = environment.EMAIL_FROM?.trim() ?? '';
  const gmailUser = environment.GMAIL_USER?.trim() ?? "";
  if (!isValidEmailAddress(gmailUser)) {
    throw new Error("GMAIL_USER must be a valid email address for Gmail SMTP");
  }
  if (!environment.GMAIL_APP_PASSWORD?.trim()) {
    throw new Error("GMAIL_APP_PASSWORD must be configured for Gmail SMTP");
  }

  if (!isValidSender(emailFrom)) {
    throw new Error("EMAIL_FROM must contain a valid sender email address");
  }

  if (!/^[a-fA-F0-9]{64}$/.test(environment.AES_DOCUMENT_KEY?.trim() ?? "")) {
    throw new Error("AES_DOCUMENT_KEY must be a 64-character hex key");
  }
}

/**
 * Returns a configured environment value or fails before it can be used as a
 * security-sensitive key.
 */
export function requireEnvironmentVariable(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[name];

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
