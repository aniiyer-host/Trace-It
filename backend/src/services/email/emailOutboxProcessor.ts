import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';
import type { EmailProvider, EmailRecipient } from './emailProvider.js';
import { getGmailSmtpProvider } from './gmailSmtpProvider.js';

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 10_000;
const LOCK_LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
const MAX_CONFIGURED_JOBS_PER_RUN = 10;

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
    private readonly provider: EmailProvider = getGmailSmtpProvider(),
  ) {}

  async start(maxJobsPerRun = 0): Promise<void> {
    if (this.running) return;
    if (!Number.isInteger(maxJobsPerRun) || maxJobsPerRun < 1 || maxJobsPerRun > MAX_CONFIGURED_JOBS_PER_RUN) {
      console.warn('[EmailOutboxProcessor] Not started: configure a per-run job cap from 1 to 10.');
      return;
    }
    if (!this.provider.isConfigured()) {
      console.warn(
        '[EmailOutboxProcessor] Not started: GMAIL_USER, GMAIL_APP_PASSWORD and EMAIL_FROM must be configured.',
      );
      return;
    }

    this.running = true;
    console.log('[EmailOutboxProcessor] Started');
    let processedJobs = 0;
    while (this.running && processedJobs < maxJobsPerRun) {
      try {
        const claimed = await this.claimBatch(Math.min(BATCH_SIZE, maxJobsPerRun - processedJobs));
        for (const job of claimed) {
          if (!this.running) break;
          await this.deliver(job);
          processedJobs += 1;
        }
        if (claimed.length === 0) await this.pause(POLL_INTERVAL_MS);
      } catch {
        console.error('[EmailOutboxProcessor] Batch failed; error details omitted.');
        break;
      }
    }
    this.running = false;
    console.log(`[EmailOutboxProcessor] Bounded run finished after ${processedJobs} job(s).`);
  }

  stop(): void {
    this.running = false;
  }

  /** Process exactly one due PENDING job when explicitly invoked for a known ID. */
  async processSelectedJob(jobId: string): Promise<boolean> {
    if (this.running) throw new Error('Cannot process a selected job while the worker is running');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      throw new Error('A valid email outbox job ID is required');
    }
    if (!this.provider.isConfigured()) throw new Error('Gmail SMTP is not configured');

    const jobs = await this.database.$transaction((tx) =>
      tx.$queryRaw<ClaimedJob[]>`
        WITH eligible AS (
          SELECT "id"
          FROM "email_outbox"
          WHERE "id" = ${jobId}
            AND "status" = 'PENDING'::"EmailOutboxStatus"
            AND "availableAt" <= CURRENT_TIMESTAMP
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "email_outbox" AS jobs
        SET "status" = 'PROCESSING'::"EmailOutboxStatus",
            "attemptCount" = jobs."attemptCount" + 1,
            "lockedAt" = CURRENT_TIMESTAMP,
            "lockedBy" = ${this.workerId},
            "updatedAt" = CURRENT_TIMESTAMP
        FROM eligible
        WHERE jobs."id" = eligible."id"
        RETURNING jobs."id", jobs."eventKey", jobs."attemptCount", jobs."payload"
      `,
    );
    if (jobs.length !== 1) return false;
    await this.deliver(jobs[0]);
    return true;
  }

  private async claimBatch(limit: number): Promise<ClaimedJob[]> {
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
          LIMIT ${limit}
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
        await this.recordFailure(
          job,
          response.error ?? 'Email provider returned an unspecified failure',
          response.retryable !== false,
        );
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
        true,
      );
    }
  }

  private async recordFailure(job: ClaimedJob, error: string, retryable: boolean): Promise<void> {
    const safeError = error
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/\bre_[A-Za-z0-9_-]+\b/g, '[credential redacted]');
    const isTerminal = !retryable || job.attemptCount >= MAX_ATTEMPTS;
    const backoffMs = Math.min(
      30_000 * 2 ** Math.max(job.attemptCount - 1, 0),
      MAX_BACKOFF_MS,
    );

    await this.database.emailOutbox.updateMany({
      where: { id: job.id, status: 'PROCESSING', lockedBy: this.workerId },
      data: {
        status: isTerminal ? 'FAILED' : 'PENDING',
        availableAt: isTerminal ? undefined : new Date(Date.now() + backoffMs),
        lockedAt: null,
        lockedBy: null,
        lastError: safeError.slice(0, 4000),
      },
    });

    if (isTerminal) {
      console.error(
        `[EmailOutboxProcessor] Job ${job.id} moved to FAILED (${retryable ? 'retry limit reached' : 'non-retryable provider error'}): ${safeError}`,
      );
    } else {
      console.warn(
        `[EmailOutboxProcessor] Job ${job.id} retry scheduled after attempt ${job.attemptCount}; diagnostic detail is stored in email_outbox.lastError.`,
      );
    }
  }

  private pause(durationMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
  }
}
