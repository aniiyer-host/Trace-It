const SENSITIVE_ENV_NAME = /(PASSWORD|SECRET|TOKEN|PRIVATE|KEYPAIR|DATABASE_URL|RPC_URL|API_KEY|AUTH)/i;

/** Preserve the original message and stack while removing common credentials and PII. */
export function formatAnchorOperatorError(
  error: unknown,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const detail = error instanceof Error
    ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack.split("\n").slice(1).join("\n")}` : ""}`
    : `Anchor processing failed: ${String(error)}`;
  const secrets = Object.entries(environment)
    .filter(([name, value]) => SENSITIVE_ENV_NAME.test(name) && Boolean(value))
    .map(([, value]) => value!.trim())
    .filter((value) => value.length > 0)
    .sort((a, b) => b.length - a.length);

  let safeDetail = detail;
  for (const secret of secrets) safeDetail = safeDetail.split(secret).join("[redacted]");
  safeDetail = safeDetail
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\b\d{12,19}\b/g, "[number redacted]");

  return `Selected anchor batch failed; no success is reported.\n${safeDetail}`;
}
