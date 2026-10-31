import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import {
  DonationStatus,
  ProvenanceEventType,
  RefundOutboxStatus,
} from '../../generated/prisma/enums.js';
import { prisma } from '../db/prisma.js';
import { getRazorpayClient } from './donationService.js';
import { appendProvenanceEvent } from './provenanceChainService.js';

const POLL_INTERVAL_MS = 15_000;
const LEASE_MS = 2 * 60_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 60 * 60_000;

export type GatewayRefund = {
  id: string;
  amount: number;
  status?: string;
  payment_id?: string;
  receipt?: string | null;
  notes?: Record<string, string | undefined> | null;
};

export interface RefundGateway {
  fetchRefunds(paymentId: string): Promise<{ items: GatewayRefund[] }>;
  submitRefund(
    paymentId: string,
    body: { amount: number; receipt: string; notes: Record<string, string> },
    idempotencyKey: string,
  ): Promise<GatewayRefund>;
}

export const inspectProviderRefunds = (paymentId: string, gateway: RefundGateway = razorpayGateway) => gateway.fetchRefunds(paymentId);

export async function resolveRefundJob(
  jobId: string,
  resolution: 'RETRYABLE' | 'FAILED' | 'CONFIRMED',
  database: PrismaClient = prisma,
  gateway: RefundGateway = razorpayGateway,
): Promise<boolean> {
  const job = await database.refundOutbox.findUnique({ where: { id: jobId } });
  if (!job || job.status !== RefundOutboxStatus.RECONCILIATION_REQUIRED) return false;
  const refunds = await gateway.fetchRefunds(job.razorpayPaymentId);
  const matching = refunds.items.find((refund) =>
    refund.receipt === job.receipt || refund.notes?.donationId === job.donationId);
  if (resolution === 'RETRYABLE' && matching) throw new Error('Matching provider refund exists; retry is unsafe');
  if (resolution === 'FAILED' && matching?.status !== 'failed') throw new Error('Provider has not confirmed this refund failed');
  if (resolution === 'CONFIRMED' && matching?.status !== 'processed') throw new Error('Provider has not confirmed this refund processed');
  if (matching && matching.amount !== job.amountPaise) throw new Error('Provider refund amount differs from the outbox request; manual financial review is required');
  if (resolution === 'RETRYABLE' && !matching) {
    const updated = await database.refundOutbox.updateMany({
      where: { id: job.id, status: RefundOutboxStatus.RECONCILIATION_REQUIRED },
      data: { status: RefundOutboxStatus.PENDING, retryCount: 0, nextAttemptAt: new Date(), lastError: 'Operator verified no matching provider refund' },
    });
    return updated.count === 1;
  }
  if (!matching) return false;
  const evidence = { paymentId: job.razorpayPaymentId, refundId: matching.id,
    amountPaise: matching.amount, receipt: matching.receipt, notes: matching.notes };
  if (resolution === 'CONFIRMED') return recordProviderRefund({ ...evidence, status: 'processed', source: 'OPERATOR_RECONCILIATION' }, database);
  return failRefundFromGateway(evidence, database);
}

export function createRazorpayRefundGateway(
  client: ReturnType<typeof getRazorpayClient>,
): RefundGateway {
  return {
    async fetchRefunds(paymentId) {
      (client.api as unknown as { rq: { defaults: { timeout: number } } }).rq.defaults.timeout = 30_000;
      const items: GatewayRefund[] = [];
      let skip = 0;
      while (true) {
        const result = await client.payments.fetchMultipleRefund(paymentId, { count: 100, skip });
        const page = (result.items ?? []) as GatewayRefund[];
        items.push(...page);
        if (page.length < 100) break;
        skip += page.length;
      }
      return { items };
    },
    async submitRefund(paymentId, body, idempotencyKey) {
      // The installed Razorpay SDK only permits a small allowlist of global
      // headers and its refund helper cannot set per-request headers. Its
      // underlying Axios client is configured with the SDK's auth/base URL.
      const api = client.api as unknown as {
        rq: {
          defaults: { timeout: number };
          post<T>(url: string, data: unknown, config: { headers: Record<string, string> }): Promise<{ data: T }>;
        };
      };
      api.rq.defaults.timeout = 30_000;
      const response = await api.rq.post<GatewayRefund>(
        `/v1/payments/${encodeURIComponent(paymentId)}/refund`,
        body,
        { headers: { 'X-Refund-Idempotency': idempotencyKey } },
      );
      return response.data;
    },
  };
}

const razorpayGateway: RefundGateway = {
  fetchRefunds: (paymentId) => createRazorpayRefundGateway(getRazorpayClient()).fetchRefunds(paymentId),
  submitRefund: (paymentId, body, key) => createRazorpayRefundGateway(getRazorpayClient()).submitRefund(paymentId, body, key),
};

type RefundJob = {
  id: string;
  donationId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  reason: string;
  receipt: string;
  idempotencyKey: string;
  retryCount: number;
  requestStartedAt: Date | null;
};

export type RefundWebhookEvidence = {
  paymentId: string;
  refundId: string;
  amountPaise: number;
  status: string;
  receipt?: string | null;
  notes?: Record<string, string | undefined> | null;
};

/** Mark a refund settled only on definitive gateway confirmation. */
export async function confirmRefund(
  evidence: RefundWebhookEvidence,
  database: PrismaClient = prisma,
): Promise<boolean> {
  if (evidence.status !== 'processed') return false;
  const outboxMatch = await database.refundOutbox.findFirst({
    where: { razorpayPaymentId: evidence.paymentId, amountPaise: evidence.amountPaise,
      OR: [{ receipt: evidence.receipt ?? '__no_receipt__' },
        ...(evidence.notes?.donationId ? [{ donationId: evidence.notes.donationId }] : []),
        { razorpayRefundId: evidence.refundId }] },
    select: { donationId: true },
  });
  return recordProviderRefund({ ...evidence, source: outboxMatch ? 'APPLICATION' : 'RAZORPAY_DASHBOARD' }, database);
}

export async function recordProviderRefund(
  evidence: RefundWebhookEvidence & { source: string },
  database: PrismaClient = prisma,
): Promise<boolean> {
  return database.$transaction(async (tx) => {
    const existing = await tx.providerRefund.findUnique({ where: { razorpayRefundId: evidence.refundId } });
    if (existing) return false;
    const donationIdFromEvidence = evidence.notes?.donationId;
    const job = await tx.refundOutbox.findFirst({
      where: {
        razorpayPaymentId: evidence.paymentId,
        amountPaise: evidence.amountPaise,
        OR: [
          { receipt: evidence.receipt ?? '__no_receipt__' },
          ...(evidence.notes?.donationId
            ? [{ donationId: evidence.notes.donationId }]
            : []),
          ...(evidence.refundId ? [{ razorpayRefundId: evidence.refundId }] : []),
        ],
      },
      include: { donation: true },
    });
    const donation = job?.donation ?? await tx.donation.findFirst({ where: {
      razorpayPaymentId: evidence.paymentId,
      ...(donationIdFromEvidence ? { id: donationIdFromEvidence } : {}),
    }, include: { ngo: true } });
    if (!donation) return false;
    const occurredAt = new Date();
    const rows = donation.campaignId ? await tx.$queryRaw<Array<{id:string}>>`SELECT "id" FROM "campaigns" WHERE "id"=${donation.campaignId} FOR UPDATE` : [];
    if (donation.campaignId && !rows.length) throw new Error('Refund campaign missing');
    const lockedDonation = await tx.donation.findUniqueOrThrow({ where: { id: donation.id } });
    const refundInr = new Prisma.Decimal(evidence.amountPaise).div(100);
    const newRefunded = lockedDonation.refundedAmount.plus(refundInr);
    const exceedsContribution = newRefunded.greaterThan(lockedDonation.amount);
    const hasAllocation = lockedDonation.allocatedAmount.greaterThan(0);
    const status = hasAllocation || exceedsContribution
      ? DonationStatus.REFUND_RECONCILIATION_REQUIRED
      : newRefunded.greaterThanOrEqualTo(lockedDonation.amount)
        ? DonationStatus.REFUNDED
        : DonationStatus.SUCCESS;
    await tx.providerRefund.create({ data: {
      razorpayRefundId: evidence.refundId, donationId: donation.id,
      amountPaise: evidence.amountPaise, status: 'processed', source: evidence.source,
      processedAt: occurredAt,
    } });
    await tx.donation.update({ where: { id: donation.id }, data: { refundedAmount: newRefunded, status } });
    if (job && job.status !== RefundOutboxStatus.COMPLETED) {
      await tx.refundOutbox.update({ where: { id: job.id }, data: {
        status: RefundOutboxStatus.COMPLETED, razorpayRefundId: evidence.refundId,
        gatewayStatus: 'processed', confirmedAt: occurredAt, lockedAt: null, lockedBy: null, lastError: null,
      } });
    }
    // Only reduce campaign funds by the part of this refund that was still
    // unallocated. Any refunded value that overlaps existing allocations stays
    // in explicit reconciliation; it cannot be silently clawed back here.
    const remainingUnallocated = Prisma.Decimal.max(
      lockedDonation.amount.minus(lockedDonation.allocatedAmount).minus(lockedDonation.refundedAmount), 0,
    );
    const wasCountedInCampaign = ([
      DonationStatus.SUCCESS, DonationStatus.ALLOCATED, DonationStatus.DISBURSED,
      DonationStatus.DELIVERED, DonationStatus.REFUND_RECONCILIATION_REQUIRED,
    ] as DonationStatus[]).includes(lockedDonation.status);
    const campaignAdjustment = wasCountedInCampaign
      ? Prisma.Decimal.min(refundInr, remainingUnallocated)
      : new Prisma.Decimal(0);
    if (campaignAdjustment.greaterThan(0) && donation.campaignId) {
      await tx.campaign.update({ where: { id: donation.campaignId }, data: { raisedAmount: { decrement: campaignAdjustment } } });
    }
    await tx.attestation.updateMany({
      where: { donationId: donation.id, disbursementId: null, type: 'RECEIPT', status: { not: 'REVOKED' } },
      data: {
        status: 'REVOKED',
        allocatedAmount: Prisma.Decimal.max(lockedDonation.amount.minus(newRefunded), 0),
        rejectionReason: 'Refund recorded; original contribution receipt superseded',
      },
    });
    await tx.donation.update({ where: { id: donation.id }, data: { taxReceiptUrl: null, taxReceiptEmailed: false } });
    await appendProvenanceEvent(tx, {
      eventType: ProvenanceEventType.DONATION_REFUND_PROCESSED,
      entityType: 'Donation',
      entityId: donation.id,
      amountInr: refundInr.toFixed(2),
      ngoId: donation.ngoId,
      campaignId: donation.campaignId,
      occurredAt,
    }, evidence.refundId);
    return true;
  });
}

export async function failRefundFromGateway(
  evidence: Omit<RefundWebhookEvidence, 'status'>,
  database: PrismaClient = prisma,
): Promise<boolean> {
  return database.$transaction(async (tx) => {
    const job = await tx.refundOutbox.findFirst({
      where: {
        razorpayPaymentId: evidence.paymentId,
        amountPaise: evidence.amountPaise,
        OR: [
          { receipt: evidence.receipt ?? '__no_receipt__' },
          ...(evidence.notes?.donationId ? [{ donationId: evidence.notes.donationId }] : []),
          ...(evidence.refundId ? [{ razorpayRefundId: evidence.refundId }] : []),
        ],
      },
    });
    if (!job || job.status === RefundOutboxStatus.COMPLETED || job.status === RefundOutboxStatus.FAILED) return false;
    const changed = await tx.refundOutbox.updateMany({
      where: {
        id: job.id,
        status: { in: [RefundOutboxStatus.PENDING, RefundOutboxStatus.PROCESSING, RefundOutboxStatus.RECONCILIATION_REQUIRED] },
      },
      data: {
        status: RefundOutboxStatus.FAILED,
        razorpayRefundId: evidence.refundId,
        gatewayStatus: 'failed',
        lastError: 'Gateway reports this refund failed',
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (changed.count !== 1) return false;
    await tx.donation.updateMany({
      where: { id: job.donationId, status: DonationStatus.EXCESS_REFUND_PENDING },
      data: { status: DonationStatus.EXCESS_REFUND_FAILED },
    });
    return true;
  });
}

function backoffMs(attempt: number): number {
  return Math.min(15_000 * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
}

function safeError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Unknown Razorpay refund error';
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Razorpay refund request failed';
  return message.slice(0, 500);
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  if ('response' in error && error.response && typeof error.response === 'object'
    && 'status' in error.response && typeof error.response.status === 'number') return error.response.status;
  return undefined;
}

export async function processRefundJob(
  job: RefundJob,
  workerId: string,
  database: PrismaClient = prisma,
  gateway: RefundGateway = razorpayGateway,
): Promise<void> {
  try {
    const existing = await gateway.fetchRefunds(job.razorpayPaymentId);
    const matching = existing.items.find((refund) =>
      refund.receipt === job.receipt || refund.notes?.donationId === job.donationId,
    );

    if (matching) {
      if (matching.amount !== job.amountPaise) {
        await database.refundOutbox.updateMany({
          where: { id: job.id, status: RefundOutboxStatus.PROCESSING, lockedBy: workerId },
          data: { status: RefundOutboxStatus.RECONCILIATION_REQUIRED, lastError: 'Provider refund exists with an amount different from the outbox request', lockedAt: null, lockedBy: null },
        });
        return;
      }
      if (matching.status === 'processed') {
        await confirmRefund({
          paymentId: job.razorpayPaymentId,
          refundId: matching.id,
          amountPaise: matching.amount,
          status: matching.status,
          receipt: matching.receipt,
          notes: matching.notes,
        }, database);
      } else if (matching.status === 'failed') {
        await failRefundJob(job, workerId, 'Gateway reports this refund failed', database);
      } else {
        await retryRefundJob(job, workerId, `Gateway refund is ${matching.status ?? 'unresolved'}`, database, true);
      }
      return;
    }

    // Persist intent before crossing the network boundary. A crash after this
    // update will re-fetch and, if needed, repeat the exact request with the
    // same provider idempotency key and immutable request payload.
    const requestStartedAt = new Date();
    const marked = await database.refundOutbox.updateMany({
      where: { id: job.id, status: RefundOutboxStatus.PROCESSING, lockedBy: workerId },
      data: { requestStartedAt },
    });
    if (marked.count !== 1) return;

    const result = await gateway.submitRefund(job.razorpayPaymentId, {
      amount: job.amountPaise,
      receipt: job.receipt,
      notes: { donationId: job.donationId, reason: job.reason },
    }, job.idempotencyKey);

    if (result.status === 'processed') {
      await confirmRefund({
        paymentId: job.razorpayPaymentId,
        refundId: result.id,
        amountPaise: result.amount,
        status: result.status,
        receipt: result.receipt,
        notes: result.notes,
      }, database);
    } else if (result.status === 'failed') {
      await failRefundJob(job, workerId, 'Gateway reports this refund failed', database);
    } else {
      await retryRefundJob(job, workerId, `Gateway accepted refund with status ${result.status ?? 'unknown'}`, database, true);
    }
  } catch (error) {
    const code = statusCode(error);
    if (code !== undefined && code >= 400 && code < 500 && code !== 409 && code !== 429) {
      await failRefundJob(job, workerId, safeError(error), database);
      return;
    }
    await retryRefundJob(job, workerId, safeError(error), database, true);
  }
}

async function retryRefundJob(
  job: RefundJob,
  workerId: string,
  error: string,
  database: PrismaClient,
  incrementAttempt: boolean,
): Promise<void> {
  const nextCount = job.retryCount + (incrementAttempt ? 1 : 0);
  const exhausted = nextCount >= MAX_ATTEMPTS;
  await database.refundOutbox.updateMany({
    where: { id: job.id, status: RefundOutboxStatus.PROCESSING, lockedBy: workerId },
    data: {
      status: exhausted ? RefundOutboxStatus.RECONCILIATION_REQUIRED : RefundOutboxStatus.PENDING,
      retryCount: nextCount,
      lastError: error,
      nextAttemptAt: new Date(Date.now() + backoffMs(Math.max(1, nextCount))),
      lockedAt: null,
      lockedBy: null,
    },
  });
}

async function failRefundJob(
  job: RefundJob,
  workerId: string,
  error: string,
  database: PrismaClient,
): Promise<void> {
  await database.$transaction(async (tx) => {
    const changed = await tx.refundOutbox.updateMany({
      where: { id: job.id, status: RefundOutboxStatus.PROCESSING, lockedBy: workerId },
      data: {
        status: RefundOutboxStatus.FAILED,
        lastError: error,
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (changed.count !== 1) return;
    await tx.donation.updateMany({
      where: { id: job.donationId, status: DonationStatus.EXCESS_REFUND_PENDING },
      data: { status: DonationStatus.EXCESS_REFUND_FAILED },
    });
  });
}

export class RefundOutboxProcessor {
  private readonly workerId = randomUUID();
  private running = false;
  private tickInProgress = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly database: PrismaClient = prisma,
    private readonly gateway: RefundGateway = razorpayGateway,
    private readonly intervalMs = POLL_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    console.info('[RefundOutboxProcessor] Started');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Claim and process one explicitly selected job, primarily for reconciliation tooling. */
  async processSelectedJob(jobId: string): Promise<boolean> {
    const jobs = await this.database.$transaction((tx) => tx.$queryRaw<RefundJob[]>`
      WITH eligible AS (
        SELECT "id"
        FROM "refund_outbox"
        WHERE "id" = ${jobId}
          AND "status" IN ('PENDING'::"RefundOutboxStatus", 'PROCESSING'::"RefundOutboxStatus")
          AND "nextAttemptAt" <= NOW()
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${LEASE_MS} * INTERVAL '1 millisecond'))
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "refund_outbox" AS jobs
      SET "status" = 'PROCESSING'::"RefundOutboxStatus",
          "lockedAt" = NOW(),
          "lockedBy" = ${this.workerId},
          "updatedAt" = NOW()
      FROM eligible
      WHERE jobs."id" = eligible."id"
      RETURNING jobs."id", jobs."donationId", jobs."razorpayPaymentId", jobs."amountPaise",
        jobs."reason", jobs."receipt", jobs."idempotencyKey", jobs."retryCount", jobs."requestStartedAt"
    `);
    const job = jobs[0];
    if (!job) return false;
    await processRefundJob(job, this.workerId, this.database, this.gateway);
    return true;
  }

  async processBatch(): Promise<number> {
    const jobs = await this.database.$transaction((tx) => tx.$queryRaw<RefundJob[]>`
      WITH eligible AS (
        SELECT "id"
        FROM "refund_outbox"
        WHERE "status" IN ('PENDING'::"RefundOutboxStatus", 'PROCESSING'::"RefundOutboxStatus")
          AND "nextAttemptAt" <= NOW()
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${LEASE_MS} * INTERVAL '1 millisecond'))
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "refund_outbox" AS jobs
      SET "status" = 'PROCESSING'::"RefundOutboxStatus",
          "lockedAt" = NOW(),
          "lockedBy" = ${this.workerId},
          "updatedAt" = NOW()
      FROM eligible
      WHERE jobs."id" = eligible."id"
      RETURNING jobs."id", jobs."donationId", jobs."razorpayPaymentId", jobs."amountPaise",
        jobs."reason", jobs."receipt", jobs."idempotencyKey", jobs."retryCount", jobs."requestStartedAt"
    `);

    await Promise.all(jobs.map((job) => processRefundJob(job, this.workerId, this.database, this.gateway)));
    return jobs.length;
  }

  private async tick(): Promise<void> {
    if (!this.running || this.tickInProgress) return;
    this.tickInProgress = true;
    try {
      await this.processBatch();
    } catch {
      console.error('[RefundOutboxProcessor] Batch failed; error details omitted.');
    } finally {
      this.tickInProgress = false;
    }
  }
}

// Retained for existing callers; proactive refunds must be represented by a
// durable outbox row before any gateway request is made.
export const processRefund = async (donationId: string, reason: string): Promise<boolean> => {
  const job = await prisma.refundOutbox.findUnique({ where: { donationId } });
  return Boolean(job && job.reason === reason);
};
