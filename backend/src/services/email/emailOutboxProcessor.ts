import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';
import type { EmailProvider, EmailRecipient } from './emailProvider.js';
import { getResendEmailProvider } from './resendEmailProvider.js';

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 10_000;
const LOCK_LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

type ClaimedJob = {
  id: string;
  eventKey: string;
  attemptCount: number;
  payload: unknown;
};

type OutboxEmail = {
  to: EmailRecipient[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
};

const parsePayload = (value: unknown): OutboxEmail => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Email outbox payload must be an object');
  }

  const payload = value as Record<string, unknown>;
  if (
    typeof payload.subject !== 'string' ||
    !Array.isArray(payload.to) ||
    !payload.to.every(
      (recipient) =>
        recipient !== null &&
        typeof recipient === 'object' &&
        'email' in recipient &&
        typeof recipient.email === 'string',
    ) ||
    (payload.html !== undefined && typeof payload.html !== 'string') ||
    (payload.text !== undefined && typeof payload.text !== 'string') ||
    (payload.from !== undefined && typeof payload.from !== 'string')
  ) {
    throw new Error('Email outbox payload has an invalid shape');
  }

  return {
    to: payload.to as EmailRecipient[],
    from: payload.from as string | undefined,
    subject: payload.subject,
    html: payload.html as string | undefined,
    text: payload.text as string | undefined,
  };
};

export class EmailOutboxProcessor {
  private running = false;
  private readonly workerId = randomUUID();

  constructor(
    private readonly database: PrismaClient = prisma,
    private readonly provider: EmailProvider = getResendEmailProvider(),
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.provider.isConfigured()) {
      console.warn(
        '[EmailOutboxProcessor] Not started: RESEND_API_KEY and EMAIL_FROM must be configured.',
      );
      return;
    }

    this.running = true;
    console.log('[EmailOutboxProcessor] Started');
    while (this.running) {
      try {
        const claimed = await this.claimBatch();
        for (const job of claimed) {
          if (!this.running) break;
          await this.deliver(job);
        }
        if (claimed.length === 0) await this.pause(POLL_INTERVAL_MS);
      } catch (error) {
        console.error('[EmailOutboxProcessor] Batch failed:', error);
        await this.pause(POLL_INTERVAL_MS);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private async claimBatch(): Promise<ClaimedJob[]> {
    return this.database.$transaction((tx) =>
      tx.$queryRaw<ClaimedJob[]>`
        WITH eligible AS (
          SELECT "id"
          FROM "email_outbox"
          WHERE (
            "status" = 'PENDING'::"EmailOutboxStatus"
            AND "availableAt" <= CURRENT_TIMESTAMP
          ) OR (
            "status" = 'PROCESSING'::"EmailOutboxStatus"
            AND "lockedAt" <= CURRENT_TIMESTAMP - (${LOCK_LEASE_MS} * INTERVAL '1 millisecond')
          )
          ORDER BY "availableAt", "createdAt"
          FOR UPDATE SKIP LOCKED
          LIMIT ${BATCH_SIZE}
        )
        UPDATE "email_outbox" AS jobs
        SET
          "status" = 'PROCESSING'::"EmailOutboxStatus",
          "attemptCount" = jobs."attemptCount" + 1,
          "lockedAt" = CURRENT_TIMESTAMP,
          "lockedBy" = ${this.workerId},
          "updatedAt" = CURRENT_TIMESTAMP
        FROM eligible
        WHERE jobs."id" = eligible."id"
        RETURNING jobs."id", jobs."eventKey", jobs."attemptCount", jobs."payload"
      `,
    );
  }

  private async deliver(job: ClaimedJob): Promise<void> {
    try {
      const payload = parsePayload(job.payload);
      const response = await this.provider.send({
        ...payload,
        idempotencyKey: job.eventKey,
      });

      if (!response.ok) {
        await this.recordFailure(job, response.error ?? 'Email provider returned an unspecified failure');
        return;
      }

      await this.database.emailOutbox.updateMany({
        where: { id: job.id, status: 'PROCESSING', lockedBy: this.workerId },
        data: {
          status: 'SENT',
          providerMessageId: response.id,
          sentAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
    } catch (error) {
      await this.recordFailure(
        job,
        error instanceof Error ? error.message : 'Unknown email dispatch error',
      );
    }
  }

  private async recordFailure(job: ClaimedJob, error: string): Promise<void> {
    const isTerminal = job.attemptCount >= MAX_ATTEMPTS;
    const backoffMs = Math.min(
      30_000 * 2 ** Math.max(job.attemptCount - 1, 0),
      MAX_BACKOFF_MS,
    );

    await this.database.emailOutbox.updateMany({
      where: { id: job.id, status: 'PROCESSING', lockedBy: this.workerId },
      data: {
        status: isTerminal ? 'FAILED' : 'PENDING',
        availableAt: new Date(Date.now() + backoffMs),
        lockedAt: null,
        lockedBy: null,
        lastError: error.slice(0, 4000),
      },
    });

    if (isTerminal) {
      console.error(
        `[EmailOutboxProcessor] Job ${job.id} moved to FAILED after ${job.attemptCount} attempts: ${error}`,
      );
    }
  }

  private pause(durationMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
  }
}
