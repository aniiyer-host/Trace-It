import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AttestationStatus, AttestationType, DisbursementStatus } from '../generated/prisma/enums.js';
import { EmailOutboxProcessor } from '../src/services/email/emailOutboxProcessor.js';
import type { EmailProvider } from '../src/services/email/emailProvider.js';
import { ResendEmailProvider } from '../src/services/email/resendEmailProvider.js';
import {
  enqueueDonationSuccessEmail,
  enqueueFundsAllocatedEmail,
  enqueueFundsAllocatedForCompletedAttestation,
} from '../src/services/email/notificationService.js';
import { validateEnvironment } from '../src/utils/envValidator.js';
import type { EmailRecipient } from '../src/services/email/emailProvider.js';

const donation = {
  id: 'donation-1',
  publicId: 'public-1',
  amount: { toString: () => '250.00' },
  currencyCode: 'INR',
  donor: { email: 'donor@example.org', fullName: 'Donor One' },
  ngo: {
    fullName: 'NGO One',
    organisationName: 'Community Fund',
  },
};

const emailCreateMock = jest.fn();
const transactionClient = {
  emailOutbox: { create: emailCreateMock },
} as unknown as Prisma.TransactionClient;

describe('email outbox event creation', () => {
  beforeEach(() => {
    emailCreateMock.mockReset();
    emailCreateMock.mockResolvedValue({ id: 'job-1' });
    process.env.FRONTEND_URL = 'https://trace-it.example';
  });

  it('queues payment confirmation with persisted amount/currency and donor recipient', async () => {
    const confirmedAt = new Date('2026-10-14T09:00:00.000Z');
    await enqueueDonationSuccessEmail(transactionClient, donation, confirmedAt);

    expect(emailCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventKey: 'DONATION_SUCCESS:donation-1',
        milestone: 'DONATION_SUCCESS',
        donationId: 'donation-1',
        payload: expect.objectContaining({
          to: [{ email: 'donor@example.org', name: 'Donor One' }],
          subject: expect.stringContaining('public-1'),
          text: expect.stringContaining('250.00 INR'),
          html: expect.stringContaining('Community Fund'),
        }),
      }),
    }));
  });

  it('uses allocated amount and exact disbursement attribution', async () => {
    await enqueueFundsAllocatedEmail(transactionClient, {
      donation,
      disbursementId: 'disbursement-9',
      allocatedAmount: { toString: () => '37.50' },
      attestedAt: new Date('2026-10-14T10:00:00.000Z'),
    });

    expect(emailCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventKey: 'FUNDS_ALLOCATED:donation-1:disbursement-9',
        disbursementId: 'disbursement-9',
        payload: expect.objectContaining({
          text: expect.stringContaining('37.50 INR'),
        }),
      }),
    }));
    const storedPayload = emailCreateMock.mock.calls[0][0].data.payload;
    expect(storedPayload.text).toContain('disbursement-9');
    expect(storedPayload.to).toEqual([{ email: 'donor@example.org', name: 'Donor One' }]);
  });

  it('does not enqueue allocation before the first attestation is approved', async () => {
    const tx = {
      attestation: {
        findUnique: jest.fn().mockResolvedValue({
          type: AttestationType.RECEIPT,
          status: AttestationStatus.PENDING,
          disbursementId: 'disbursement-9',
        }),
      },
      donationAllocation: { findFirst: jest.fn() },
      disbursement: { findUnique: jest.fn() },
      emailOutbox: { create: emailCreateMock },
    } as unknown as Prisma.TransactionClient;

    const queued = await enqueueFundsAllocatedForCompletedAttestation(
      tx,
      'attestation-1',
      'ngo-1',
    );

    expect(queued).toBe(false);
    expect(emailCreateMock).not.toHaveBeenCalled();
  });

  it('queues only after the approved first attestation matches an approved disbursement allocation', async () => {
    const allocationQuery = jest.fn().mockResolvedValue({ amount: { toString: () => '37.50' } });
    const disbursementQuery = jest.fn().mockResolvedValue({
      ngoId: 'ngo-1',
      status: DisbursementStatus.APPROVED,
    });
    const tx = {
      attestation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'attestation-1',
          type: AttestationType.RECEIPT,
          status: AttestationStatus.APPROVED,
          donationId: donation.id,
          disbursementId: 'disbursement-9',
          donation: { ...donation, status: 'SUCCESS' },
          approvedAt: new Date('2026-10-14T10:00:00.000Z'),
          updatedAt: new Date('2026-10-14T10:00:00.000Z'),
        }),
      },
      donationAllocation: { findFirst: allocationQuery },
      disbursement: { findUnique: disbursementQuery },
      emailOutbox: { create: emailCreateMock },
    } as unknown as Prisma.TransactionClient;

    await expect(
      enqueueFundsAllocatedForCompletedAttestation(tx, 'attestation-1', 'ngo-1'),
    ).resolves.toBe(true);
    expect(emailCreateMock.mock.calls[0][0].data.eventKey).toBe(
      'FUNDS_ALLOCATED:donation-1:disbursement-9',
    );
    expect(emailCreateMock.mock.calls[0][0].data.payload.text).toContain('37.50 INR');
  });

  it('does not enqueue an unallocated or mismatched disbursement', async () => {
    const tx = {
      attestation: {
        findUnique: jest.fn().mockResolvedValue({
          type: AttestationType.RECEIPT,
          status: AttestationStatus.APPROVED,
          donationId: donation.id,
          disbursementId: 'disbursement-9',
          donation: { ...donation, status: 'SUCCESS' },
        }),
      },
      donationAllocation: { findFirst: jest.fn().mockResolvedValue(null) },
      disbursement: {
        findUnique: jest.fn().mockResolvedValue({
          ngoId: 'ngo-1',
          status: DisbursementStatus.APPROVED,
        }),
      },
      emailOutbox: { create: emailCreateMock },
    } as unknown as Prisma.TransactionClient;

    await expect(
      enqueueFundsAllocatedForCompletedAttestation(tx, 'attestation-1', 'ngo-1'),
    ).resolves.toBe(false);
    expect(emailCreateMock).not.toHaveBeenCalled();
  });

  it('uses a unique event key as the concurrent duplicate boundary', async () => {
    const persistedKeys = new Set<string>();
    emailCreateMock.mockImplementation(async ({ data }) => {
      if (persistedKeys.has(data.eventKey)) {
        throw new Error('unique event key violation');
      }
      persistedKeys.add(data.eventKey);
      return { id: 'job-1' };
    });

    const result = await Promise.allSettled([
      enqueueDonationSuccessEmail(transactionClient, donation, new Date()),
      enqueueDonationSuccessEmail(transactionClient, donation, new Date()),
    ]);

    expect(result.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(persistedKeys).toEqual(new Set(['DONATION_SUCCESS:donation-1']));
  });

  it('propagates outbox insert errors so the caller transaction can roll back', async () => {
    const transactionWrites: unknown[] = [];
    const committedWrites: unknown[] = [];
    const tx = {
      emailOutbox: {
        create: jest.fn(async ({ data }) => {
          transactionWrites.push(data);
          throw new Error('outbox insert failed');
        }),
      },
    } as unknown as Prisma.TransactionClient;
    const runTransaction = async (work: (client: Prisma.TransactionClient) => Promise<void>) => {
      try {
        await work(tx);
        committedWrites.push(...transactionWrites);
      } catch (error) {
        transactionWrites.length = 0;
        throw error;
      }
    };

    await expect(
      runTransaction((client) => enqueueDonationSuccessEmail(client, donation, new Date())),
    ).rejects.toThrow('outbox insert failed');
    expect(transactionWrites).toHaveLength(0);
    expect(committedWrites).toHaveLength(0);
  });
});

describe('email outbox processor', () => {
  const payload = {
    to: [{ email: 'donor@example.org' as string }] as EmailRecipient[],
    subject: 'Donation confirmed',
    text: 'Donation confirmed',
    html: '<p>Donation confirmed</p>',
  };

  const makeProcessor = (
    rows: Array<{ id: string; eventKey: string; attemptCount: number; payload: unknown }>,
    provider: EmailProvider,
    updates: jest.Mock,
    claimedSql: string[],
  ) => {
    const tx = {
      $queryRaw: async (parts: TemplateStringsArray) => {
        claimedSql.push(parts.join(' '));
        return rows.splice(0, 1);
      },
    };
    const database = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      emailOutbox: { updateMany: updates },
    } as unknown as PrismaClient;

    return new EmailOutboxProcessor(database, provider);
  };

  it('does not claim jobs if Resend is not configured in development', async () => {
    const updates = jest.fn();
    const claimedSql: string[] = [];
    const provider: EmailProvider = {
      isConfigured: () => false,
      send: jest.fn(),
    };
    const processor = makeProcessor([], provider, updates, claimedSql);

    await processor.start();

    expect(claimedSql).toHaveLength(0);
    expect(updates).not.toHaveBeenCalled();
  });

  it('retries after failure and can complete a previously claimed job after restart', async () => {
    const updates = jest.fn().mockResolvedValue({ count: 1 });
    const claimedSql: string[] = [];
    const rows = [
      { id: 'job-1', eventKey: 'DONATION_SUCCESS:donation-1', attemptCount: 1, payload },
    ];
    let firstProcessor: EmailOutboxProcessor;
    const firstProvider: EmailProvider = {
      isConfigured: () => true,
      send: jest.fn(async () => {
        firstProcessor.stop();
        return { ok: false, error: 'temporary Resend failure' };
      }),
    };
    firstProcessor = makeProcessor(rows, firstProvider, updates, claimedSql);

    await firstProcessor.start();
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PENDING',
        lastError: 'temporary Resend failure',
      }),
    }));

    const restartedRows = [
      { id: 'job-1', eventKey: 'DONATION_SUCCESS:donation-1', attemptCount: 2, payload },
    ];
    let restartedProcessor: EmailOutboxProcessor;
    const restartedProvider: EmailProvider = {
      isConfigured: () => true,
      send: jest.fn(async (request) => {
        restartedProcessor.stop();
        expect(request.idempotencyKey).toBe('DONATION_SUCCESS:donation-1');
        return { ok: true, id: 'resend-message-1' };
      }),
    };
    restartedProcessor = makeProcessor(restartedRows, restartedProvider, updates, claimedSql);

    await restartedProcessor.start();
    expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'SENT',
        providerMessageId: 'resend-message-1',
      }),
    }));
    expect(claimedSql[0]).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('marks jobs failed after the bounded retry count', async () => {
    const updates = jest.fn().mockResolvedValue({ count: 1 });
    const claimedSql: string[] = [];
    let processor: EmailOutboxProcessor;
    const provider: EmailProvider = {
      isConfigured: () => true,
      send: jest.fn(async () => {
        processor.stop();
        return { ok: false, error: 'permanent failure' };
      }),
    };
    processor = makeProcessor(
      [{ id: 'job-8', eventKey: 'DONATION_SUCCESS:donation-8', attemptCount: 8, payload }],
      provider,
      updates,
      claimedSql,
    );

    await processor.start();

    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'FAILED',
        lastError: 'permanent failure',
      }),
    }));
  });
});

describe('email provider configuration', () => {
  const environment = { ...process.env };

  afterEach(() => {
    process.env = { ...environment };
  });

  it('allows the provider to be constructed when email delivery is not configured', () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const provider = new ResendEmailProvider();

    expect(provider.isConfigured()).toBe(false);
  });

  it('allows missing email credentials outside production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('rejects missing or malformed email credentials in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        RAZORPAY_KEY_ID: 'key',
        RAZORPAY_KEY_SECRET: 'secret',
        RAZORPAY_WEBHOOK_SECRET: 'webhook',
        AES_DOCUMENT_KEY: 'a'.repeat(64),
      }),
    ).toThrow('RESEND_API_KEY');

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        RAZORPAY_KEY_ID: 'key',
        RAZORPAY_KEY_SECRET: 'secret',
        RAZORPAY_WEBHOOK_SECRET: 'webhook',
        AES_DOCUMENT_KEY: 'a'.repeat(64),
        RESEND_API_KEY: 'not-a-resend-key',
        EMAIL_FROM: 'not-an-email',
      }),
    ).toThrow('valid Resend API key');

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        RAZORPAY_KEY_ID: 'key',
        RAZORPAY_KEY_SECRET: 'secret',
        RAZORPAY_WEBHOOK_SECRET: 'webhook',
        AES_DOCUMENT_KEY: 'a'.repeat(64),
        RESEND_API_KEY: 're_validkey',
        EMAIL_FROM: 'Trace It <sender@example.org> invalid',
      }),
    ).toThrow('EMAIL_FROM must contain a valid sender email address');
  });

  it('uses mocked Resend client calls and returns a provider error without throwing', async () => {
    process.env.RESEND_API_KEY = 're_testkey';
    process.env.EMAIL_FROM = 'Trace It <onboarding@resend.dev>';
    const send = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Rejected by provider' },
      headers: null,
    });
    const provider = new ResendEmailProvider({
      emails: { send },
    } as never);

    await expect(provider.send({
      to: [{ email: 'donor@example.org' }],
      subject: 'Test',
      text: 'Test',
    })).resolves.toEqual({ ok: false, error: 'Rejected by provider' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Trace It <onboarding@resend.dev>' }),
      undefined,
    );
  });
});
