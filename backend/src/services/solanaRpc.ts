import { Connection, type Commitment } from "@solana/web3.js";

const RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 30_000;
const MAX_BACKOFF_MS = 8_000;

type RateLimitFetchOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export function createRateLimitAwareFetch({
  fetchImpl = globalThis.fetch,
  sleep = delay,
  random = Math.random,
}: RateLimitFetchOptions = {}): typeof fetch {
  return async (input, init) => {
    let retries = 0;
    while (true) {
      const response = await fetchImpl(input, init);
      if (response.status !== 429 || retries >= RATE_LIMIT_RETRIES) return response;

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      // If the provider asks us to wait longer than our bounded retry window,
      // return the 429 so the caller can schedule its normal durable retry.
      if (retryAfterMs !== null && retryAfterMs > MAX_RETRY_AFTER_MS) return response;

      await response.body?.cancel().catch(() => undefined);
      const backoffMs = Math.min(500 * 2 ** retries, MAX_BACKOFF_MS);
      const jitteredBackoff = Math.round(backoffMs * (0.8 + random() * 0.4));
      const providerMinimum = retryAfterMs ?? 0;
      const positiveJitter = retryAfterMs === null
        ? 0
        : Math.round(Math.min(retryAfterMs * 0.2, 1_000) * random());
      await sleep(Math.max(providerMinimum, jitteredBackoff) + positiveJitter);
      retries += 1;
    }
  };
}

export function createSolanaConnection(rpcUrl: string, commitment: Commitment): Connection {
  return new Connection(rpcUrl, {
    commitment,
    // Disable web3.js's fixed, immediate 429 retry loop. The fetch wrapper
    // below uses bounded jitter and honors the provider's Retry-After header.
    disableRetryOnRateLimit: true,
    fetch: createRateLimitAwareFetch(),
  });
}

export async function waitForSignatureConfirmation(
  connection: Connection,
  signature: string,
  commitment: Commitment,
  options: {
    pollIntervalMs?: number;
    timeoutMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
    random?: () => number;
    now?: () => number;
  } = {},
): Promise<{ err: unknown | null }> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const sleep = options.sleep ?? delay;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;

  do {
    const response = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = response.value[0];
    if (status?.err) return { err: status.err };
    if (status && meetsCommitment(status.confirmationStatus, commitment)) {
      return { err: null };
    }
    if (now() >= deadline) break;
    await sleep(Math.round(pollIntervalMs * (0.8 + random() * 0.4)));
  } while (now() <= deadline);

  throw new Error(`transaction ${signature} did not reach ${commitment} confirmation before timeout`);
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - Date.now());
}

function meetsCommitment(
  confirmationStatus: "processed" | "confirmed" | "finalized" | null | undefined,
  commitment: Commitment,
): boolean {
  if (commitment === "finalized") return confirmationStatus === "finalized";
  if (commitment === "confirmed" || commitment === "processed") {
    return confirmationStatus === "confirmed" || confirmationStatus === "finalized";
  }
  return confirmationStatus === "finalized";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
