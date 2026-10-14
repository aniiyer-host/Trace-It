const REQUIRED_PRODUCTION_SECRETS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "AES_DOCUMENT_KEY",
] as const;

const isValidSender = (value: string): boolean => {
  if (!/^(?:[^<>]*<[^<>]+>|[^<>]+)$/.test(value)) {
    return false;
  }
  const address = value.match(/<([^<>]+)>/)?.[1] ?? value;
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address);
};

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

  const resendApiKey = environment.RESEND_API_KEY?.trim() ?? '';
  const emailFrom = environment.EMAIL_FROM?.trim() ?? '';
  if (!/^re_[A-Za-z0-9_-]+$/.test(resendApiKey)) {
    throw new Error("RESEND_API_KEY must be a valid Resend API key");
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
