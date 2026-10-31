import { createHmac, randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { completeDonationSuccess } from '../src/services/donationService.js';
import { razorpayRefundWebhookHandler } from '../src/routes/webhooks/razorpay.js';
import {
  RefundOutboxProcessor,
  createRazorpayRefundGateway,
  type GatewayRefund,
  type RefundGateway,
} from '../src/services/refundService.js';

describe('donation settlement and refund outbox (real PostgreSQL)', () => {
  const profileIds: string[] = [];
  const campaignIds: string[] = [];
  const donationIds: string[] = [];
  let ngoId: string;
  let donorId: string;

  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (!/^traceit_reliability_e2e_/.test(identity?.database ?? '')) {
      throw new Error('Donation concurrency tests require the verified disposable PostgreSQL database');
    }
    const [ngo, donor] = await Promise.all([
      prisma.profile.create({ data: { email: `donation-ngo-${randomUUID()}@integration.traceit.org`, role: 'CHARITY', ngoStatus: 'ACTIVE' } }),
      prisma.profile.create({ data: { email: `donation-donor-${randomUUID()}@integration.traceit.org`, role: 'DONOR', kycStatus: 'APPROVED' } }),
    ]);
    ngoId = ngo.id;
    donorId = donor.id;
    profileIds.push(ngo.id, donor.id);
  });

  afterAll(async () => {
    await prisma.emailOutbox.deleteMany({ where: { donationId: { in: donationIds } } });
    await prisma.attestation.deleteMany({ where: { donationId: { in: donationIds } } });
    await prisma.blockchainRetryQueue.deleteMany({ where: { donationId: { in: donationIds } } });
    await prisma.provenanceEvent.deleteMany({ where: { entityId: { in: donationIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: donationIds } } });
    await prisma.refundOutbox.deleteMany({ where: { donationId: { in: donationIds } } });
    await prisma.donation.deleteMany({ where: { id: { in: donationIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: profileIds } } });
  });

  async function makeCampaign(input: {
    targetAmount: string;
    raisedAmount?: string;
    allowOverfunding?: boolean;
    status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  }) {
    const campaign = await prisma.campaign.create({
      data: {
        ngoId,
        title: 'Concurrent donation integration fixture',
        description: 'Disposable integration fixture',
        targetAmount: input.targetAmount,
        raisedAmount: input.raisedAmount ?? '0.00',
        allowOverfunding: input.allowOverfunding ?? false,
        status: input.status ?? 'ACTIVE',
        sdgTags: [],
      },
    });
    campaignIds.push(campaign.id);
    return campaign;
  }

  async function makeDonation(input: {
    campaignId?: string | null;
    amount: string;
    status?: 'INITIATED' | 'EXCESS_REFUND_PENDING';
  }) {
    const id = randomUUID();
    const donation = await prisma.donation.create({
      data: {
        id,
        donorId,
        ngoId,
        campaignId: input.campaignId ?? null,
        amount: input.amount,
        currencyCode: 'INR',
        paymentMethod: 'UPI',
        status: input.status ?? 'INITIATED',
        razorpayOrderId: `order_${id.replace(/-/g, '')}`,
      },
    });
    donationIds.push(donation.id);
    return donation;
  }

  const simulationEvidence = { source: 'simulation' as const };

  async function waitForBlockedConfirmations(expected: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%FROM "campaigns"%'
          AND query ILIKE '%FOR UPDATE%'
      `;
      if (row.count >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Expected ${expected} confirmation sessions blocked on the campaign row`);
  }

  async function raceCalls<T>(campaignId: string, calls: Array<() => Promise<T>>): Promise<T[]> {
    let signalLocked!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${campaignId} FOR UPDATE`;
      signalLocked();
      await release;
    }, { timeout: 30_000 });
    await locked;
    const completions = calls.map((call) => call());
    try {
      await waitForBlockedConfirmations(calls.length);
    } finally {
      releaseLock();
    }
    await holder;
    return Promise.all(completions);
  }

  async function raceConfirmations(donationIdsToConfirm: string[], campaignId: string) {
    return raceCalls(campaignId, donationIdsToConfirm.map((id) => () => completeDonationSuccess(id, simulationEvidence)));
  }

  async function makeOutboxJob(donationId: string, paymentId: string, amountPaise: number) {
    const compactId = donationId.replace(/-/g, '');
    return prisma.refundOutbox.create({
      data: {
        donationId,
        razorpayPaymentId: paymentId,
        amountPaise,
        reason: 'CAMPAIGN_TARGET_EXCEEDED',
        receipt: `rfnd_${compactId}`,
        idempotencyKey: compactId,
      },
    });
  }

  it('atomically accepts one concurrent ₹500 payment and queues the other for full refund', async () => {
    const campaign = await makeCampaign({ targetAmount: '500.00' });
    const donations = await Promise.all([
      makeDonation({ campaignId: campaign.id, amount: '500.00' }),
      makeDonation({ campaignId: campaign.id, amount: '500.00' }),
    ]);
    const results = await raceConfirmations(donations.map(({ id }) => id), campaign.id);
    expect(results.map(({ status }) => status).sort()).toEqual(['EXCESS_REFUND_PENDING', 'SUCCESS']);

    const currentCampaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(currentCampaign.raisedAmount.toFixed(2)).toBe('500.00');
    expect(currentCampaign.status).toBe('COMPLETED');
    expect(await prisma.refundOutbox.count({ where: { donationId: { in: donations.map(({ id }) => id) } } })).toBe(1);
    expect(await prisma.attestation.count({ where: { donationId: { in: donations.map(({ id }) => id) }, type: 'RECEIPT' } })).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { donationId: { in: donations.map(({ id }) => id) } } })).toBe(2);
    expect(await prisma.blockchainRetryQueue.count({ where: { donationId: { in: donations.map(({ id }) => id) } } })).toBe(1);
    expect(await prisma.provenanceEvent.count({ where: { entityId: { in: donations.map(({ id }) => id) }, eventType: 'DONATION_SUCCESS' } })).toBe(1);
    expect(await prisma.provenanceEvent.count({ where: { entityId: { in: donations.map(({ id }) => id) }, eventType: 'DONATION_OVERFLOW_REJECTED' } })).toBe(1);
  }, 30_000);

  it('rejects the second ₹300 payment entirely when only ₹200 remains', async () => {
    const campaign = await makeCampaign({ targetAmount: '500.00' });
    const donations = await Promise.all([
      makeDonation({ campaignId: campaign.id, amount: '300.00' }),
      makeDonation({ campaignId: campaign.id, amount: '300.00' }),
    ]);
    const results = await raceConfirmations(donations.map(({ id }) => id), campaign.id);
    expect(results.map(({ status }) => status).sort()).toEqual(['EXCESS_REFUND_PENDING', 'SUCCESS']);
    const currentCampaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(currentCampaign.raisedAmount.toFixed(2)).toBe('300.00');
    expect(currentCampaign.status).toBe('ACTIVE');
    const refund = await prisma.refundOutbox.findFirstOrThrow({ where: { donationId: { in: donations.map(({ id }) => id) } } });
    expect(refund.amountPaise).toBe(30_000);
  }, 30_000);

  it('deduplicates simultaneous webhook and checkout confirmation side effects', async () => {
    const campaign = await makeCampaign({ targetAmount: '1000.00' });
    const donation = await makeDonation({ campaignId: campaign.id, amount: '250.00' });
    const expectedAmountPaise = 25_000;
    const paymentEvidence = {
      razorpayOrderId: donation.razorpayOrderId!,
      amountPaise: expectedAmountPaise,
      currency: 'INR',
    };
    const results = await raceCalls(campaign.id, [
      () => completeDonationSuccess(donation.id, { source: 'webhook', ...paymentEvidence, razorpayPaymentId: 'pay_duplicate_race' }),
      () => completeDonationSuccess(donation.id, { source: 'checkout', ...paymentEvidence, razorpayPaymentId: 'pay_duplicate_race' }),
    ]);
    expect(results.map(({ status }) => status)).toEqual(['SUCCESS', 'SUCCESS']);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).raisedAmount.toFixed(2)).toBe('250.00');
    expect(await prisma.attestation.count({ where: { donationId: donation.id, type: 'RECEIPT' } })).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { donationId: donation.id } })).toBe(1);
    expect(await prisma.blockchainRetryQueue.count({ where: { donationId: donation.id } })).toBe(1);
    expect(await prisma.provenanceEvent.count({ where: { entityId: donation.id, eventType: 'DONATION_SUCCESS' } })).toBe(1);
  }, 30_000);

  it('refunds captured payments for inactive campaigns even when overfunding is enabled', async () => {
    const campaign = await makeCampaign({ targetAmount: '500.00', raisedAmount: '500.00', allowOverfunding: true, status: 'PAUSED' });
    const donation = await makeDonation({ campaignId: campaign.id, amount: '100.00' });
    const result = await completeDonationSuccess(donation.id, simulationEvidence);
    expect(result.status).toBe('EXCESS_REFUND_PENDING');
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).raisedAmount.toFixed(2)).toBe('500.00');
    expect(await prisma.attestation.count({ where: { donationId: donation.id, type: 'RECEIPT' } })).toBe(0);
  });

  it('allows active campaigns to exceed the target when overfunding is enabled', async () => {
    const campaign = await makeCampaign({ targetAmount: '500.00', raisedAmount: '500.00', allowOverfunding: true });
    const donation = await makeDonation({ campaignId: campaign.id, amount: '250.00' });
    const result = await completeDonationSuccess(donation.id, simulationEvidence);
    expect(result.status).toBe('SUCCESS');
    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.raisedAmount.toFixed(2)).toBe('750.00');
    expect(updated.status).toBe('ACTIVE');
  });

  it('settles general NGO donations without locking or changing a campaign balance', async () => {
    const donation = await makeDonation({ amount: '125.00' });
    const result = await completeDonationSuccess(donation.id, simulationEvidence);
    expect(result.status).toBe('SUCCESS');
    expect(result.campaignId).toBeNull();
    expect(await prisma.attestation.count({ where: { donationId: donation.id, type: 'RECEIPT' } })).toBe(1);
    expect(await prisma.refundOutbox.count({ where: { donationId: donation.id } })).toBe(0);
  });

  it('reconciles a confirmed gateway refund without issuing a second refund', async () => {
    const donation = await makeDonation({ amount: '100.00', status: 'EXCESS_REFUND_PENDING' });
    const job = await makeOutboxJob(donation.id, 'pay_existing_refund', 10_000);
    const gateway: RefundGateway = {
      fetchRefunds: async () => ({ items: [{ id: 'rfnd_confirmed', amount: 10_000, status: 'processed', receipt: job.receipt, notes: { donationId: donation.id } }] }),
      submitRefund: async () => { throw new Error('should not submit when a matching refund exists'); },
    };
    const processor = new RefundOutboxProcessor(prisma, gateway);
    expect(await processor.processSelectedJob(job.id)).toBe(true);
    const completed = await prisma.refundOutbox.findUniqueOrThrow({ where: { id: job.id } });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.razorpayRefundId).toBe('rfnd_confirmed');
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } })).status).toBe('REFUNDED');
    expect(await prisma.provenanceEvent.count({ where: { entityId: donation.id, eventType: 'DONATION_REFUND_PROCESSED' } })).toBe(1);
  });

  it('settles a matching refund.processed webhook once and ignores its duplicate', async () => {
    const donation = await makeDonation({ amount: '100.00', status: 'EXCESS_REFUND_PENDING' });
    const job = await makeOutboxJob(donation.id, 'pay_refund_webhook', 10_000);
    const event = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_webhook_confirmed',
            payment_id: job.razorpayPaymentId,
            amount: job.amountPaise,
            status: 'processed',
            receipt: job.receipt,
            notes: { donationId: donation.id },
          },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(event));
    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('hex');
    const invoke = async () => {
      const response = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      const next = jest.fn();
      await razorpayRefundWebhookHandler({
        rawBody,
        headers: { 'x-razorpay-signature': signature },
        ip: '127.0.0.1',
      } as never, response as never, next);
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(200);
    };
    await invoke();
    await invoke();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect((await prisma.refundOutbox.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('COMPLETED');
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } })).status).toBe('REFUNDED');
    expect(await prisma.provenanceEvent.count({ where: { entityId: donation.id, eventType: 'DONATION_REFUND_PROCESSED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: donation.id, action: 'PAYMENT_REFUNDED' } })).toBe(1);
  });

  it('retries an ambiguous refund with the same idempotency key and exact request', async () => {
    const donation = await makeDonation({ amount: '100.00', status: 'EXCESS_REFUND_PENDING' });
    const job = await makeOutboxJob(donation.id, 'pay_ambiguous_refund', 10_000);
    const keys: string[] = [];
    const payloads: unknown[] = [];
    let calls = 0;
    const gateway: RefundGateway = {
      fetchRefunds: async () => ({ items: [] }),
      submitRefund: async (_paymentId, body, key): Promise<GatewayRefund> => {
        calls += 1;
        keys.push(key);
        payloads.push(body);
        if (calls === 1) throw new Error('ECONNRESET after dispatch');
        return { id: 'rfnd_after_retry', amount: 10_000, status: 'processed', receipt: body.receipt, notes: body.notes };
      },
    };
    const processor = new RefundOutboxProcessor(prisma, gateway);
    await processor.processSelectedJob(job.id);
    await prisma.refundOutbox.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    await processor.processSelectedJob(job.id);
    expect(keys).toEqual([job.idempotencyKey, job.idempotencyKey]);
    expect(payloads[1]).toEqual(payloads[0]);
    expect((await prisma.refundOutbox.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('COMPLETED');
  });

  it('sends Razorpay refund requests with the persisted per-job idempotency header', async () => {
    const post = jest.fn(async () => ({
      data: { id: 'rfnd_header', amount: 10_000, status: 'processed' },
    }));
    const defaults = { timeout: 0 };
    const client = {
      api: { rq: { defaults, post } },
      payments: { fetchMultipleRefund: jest.fn() },
    } as never;
    const gateway = createRazorpayRefundGateway(client);
    const body = { amount: 10_000, receipt: 'rfnd_1234567890', notes: { donationId: 'donation-1', reason: 'CAPACITY' } };
    const response = await gateway.submitRefund('pay_header_test', body, '1234567890abcdef1234567890abcdef');
    expect(response.id).toBe('rfnd_header');
    expect(post).toHaveBeenCalledWith(
      '/v1/payments/pay_header_test/refund',
      body,
      { headers: { 'X-Refund-Idempotency': '1234567890abcdef1234567890abcdef' } },
    );
    expect(defaults.timeout).toBe(30_000);
  });

  it('moves exhausted ambiguous refunds to reconciliation without marking them refunded', async () => {
    const donation = await makeDonation({ amount: '100.00', status: 'EXCESS_REFUND_PENDING' });
    const job = await makeOutboxJob(donation.id, 'pay_unresolved_refund', 10_000);
    await prisma.refundOutbox.update({ where: { id: job.id }, data: { retryCount: 7 } });
    const gateway: RefundGateway = {
      fetchRefunds: async () => ({ items: [] }),
      submitRefund: async () => { throw new Error('ETIMEDOUT after request dispatch'); },
    };
    await new RefundOutboxProcessor(prisma, gateway).processSelectedJob(job.id);
    expect((await prisma.refundOutbox.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('RECONCILIATION_REQUIRED');
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } })).status).toBe('EXCESS_REFUND_PENDING');
  });

  it('recovers an expired PROCESSING lease after a worker crash', async () => {
    const donation = await makeDonation({ amount: '100.00', status: 'EXCESS_REFUND_PENDING' });
    const job = await makeOutboxJob(donation.id, 'pay_crashed_worker', 10_000);
    await prisma.refundOutbox.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', lockedAt: new Date(Date.now() - 3 * 60_000), lockedBy: 'crashed-worker' },
    });
    const gateway: RefundGateway = {
      fetchRefunds: async () => ({ items: [] }),
      submitRefund: async (_paymentId, body) => ({ id: 'rfnd_recovered', amount: body.amount, status: 'processed', receipt: body.receipt, notes: body.notes }),
    };
    await new RefundOutboxProcessor(prisma, gateway).processSelectedJob(job.id);
    expect((await prisma.refundOutbox.findUniqueOrThrow({ where: { id: job.id } })).razorpayRefundId).toBe('rfnd_recovered');
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } })).status).toBe('REFUNDED');
  });
});
