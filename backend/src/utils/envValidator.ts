const REQUIRED_PRODUCTION_SECRETS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
] as const;

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
