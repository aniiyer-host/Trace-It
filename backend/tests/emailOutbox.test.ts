import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AttestationStatus, AttestationType, DisbursementStatus } from '../generated/prisma/enums.js';
import { EmailOutboxProcessor } from '../src/services/email/emailOutboxProcessor.js';
import type { EmailProvider } from '../src/services/email/emailProvider.js';
import { ResendEmailProvider } from '../src/services/email/resendEmailProvider.js';
import {
  enqueueDonationSuccessEmail,
  enqueueFundsAllocatedEmail,
  enqueueFundsAllocatedForCompletedAttestation,
  enqueueBeneficiaryTransferReviewedEmail,
} from '../src/services/email/notificationService.js';
import { validateEnvironment } from '../src/utils/envValidator.js';
import type { EmailRecipient } from '../src/services/email/emailProvider.js';
import nodemailer from 'nodemailer';
import { GmailSmtpProvider } from '../src/services/email/gmailSmtpProvider.js';

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

  it('queues the reviewed beneficiary transfer notice only for approved evidence', async () => {
    const tx = {
      bankTransfer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'transfer-1',
          status: 'APPROVED',
          amountInr: { toFixed: () => '37.50' },
          currencyCode: 'INR',
          transferDate: new Date('2026-10-14T10:00:00.000Z'),
          allocation: {
            disbursementId: 'disbursement-9',
            donation: { ...donation },
          },
        }),
      },
      emailOutbox: { create: emailCreateMock },
    } as unknown as Prisma.TransactionClient;

    await enqueueBeneficiaryTransferReviewedEmail(tx, 'transfer-1', new Date());

    expect(emailCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventKey: 'BENEFICIARY_TRANSFER_REVIEWED:transfer-1',
        milestone: 'BENEFICIARY_TRANSFER_REVIEWED',
        payload: expect.objectContaining({
          to: [{ email: 'donor@example.org', name: 'Donor One' }],
          text: expect.stringContaining('37.50 INR'),
        }),
      }),
    }));
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
  let consoleLog: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

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

  it('processes only an explicitly selected, due pending job', async () => {
    const jobId = '02468100-6f1a-44a1-b3b1-87ba538a00b8';
    const rows = [{ id: jobId, eventKey: 'DONATION_SUCCESS:donation-1', attemptCount: 1, payload }];
    const updates = jest.fn().mockResolvedValue({ count: 1 });
    const claimedSql: string[] = [];
    const provider: EmailProvider = {
      isConfigured: () => true,
      send: jest.fn().mockResolvedValue({ ok: true, id: 'provider-test-id' }),
    };
    const processor = makeProcessor(rows, provider, updates, claimedSql);

    await expect(processor.processSelectedJob(jobId)).resolves.toBe(true);
    expect(claimedSql[0]).toContain('WHERE "id" =');
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: jobId, status: 'PROCESSING', lockedBy: expect.any(String) },
      data: expect.objectContaining({ status: 'SENT', providerMessageId: 'provider-test-id' }),
    }));
  });

  it('claims and processes no more than the configured per-run job cap', async () => {
    const updates = jest.fn().mockResolvedValue({ count: 1 });
    const claimedSql: string[] = [];
    const rows = [
      { id: 'job-1', eventKey: 'DONATION_SUCCESS:donation-1', attemptCount: 1, payload },
      { id: 'job-2', eventKey: 'DONATION_SUCCESS:donation-2', attemptCount: 1, payload },
    ];
    const provider: EmailProvider = {
      isConfigured: () => true,
      send: jest.fn().mockResolvedValue({ ok: true, id: 'resend-message-1' }),
    };
    const processor = makeProcessor(rows, provider, updates, claimedSql);

    await processor.start(1);

    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(claimedSql).toHaveLength(1);
    expect(rows).toHaveLength(1);
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

    await firstProcessor.start(1);
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PENDING',
        lastError: 'temporary Resend failure',
      }),
    }));
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('Job job-1 retry scheduled after attempt 1'),
    );

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

    await restartedProcessor.start(1);
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

    await processor.start(1);

    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'FAILED',
        lastError: 'permanent failure',
      }),
    }));
  });

  it('fails a non-retryable validation error once and redacts recipient details', async () => {
    const updates = jest.fn().mockResolvedValue({ count: 1 });
    const claimedSql: string[] = [];
    let processor: EmailOutboxProcessor;
    const provider: EmailProvider = {
      isConfigured: () => true,
      send: jest.fn(async () => {
        processor.stop();
        return { ok: false, retryable: false, error: 'Invalid to field: donor@example.org' };
      }),
    };
    processor = makeProcessor(
      [{ id: 'job-422', eventKey: 'DONATION_SUCCESS:donation-422', attemptCount: 1, payload }],
      provider,
      updates,
      claimedSql,
    );

    await processor.start(1);

    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'FAILED',
        lastError: 'Invalid to field: [email redacted]',
      }),
    }));
  });
});

describe('Gmail SMTP provider', () => {
  const environment = { ...process.env };

  afterEach(() => {
    process.env = { ...environment };
    jest.restoreAllMocks();
  });

  it('sends through the configured Gmail transport and returns its message ID', async () => {
    process.env.GMAIL_USER = 'sender@example.org';
    process.env.GMAIL_APP_PASSWORD = 'test-app-password';
    process.env.EMAIL_FROM = 'Trace It <sender@example.org>';
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'gmail-message-id' });
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
    const provider = new GmailSmtpProvider();

    await expect(provider.send({
      to: [{ email: 'recipient@example.org' }],
      subject: 'Test notification',
      text: 'Test body',
    })).resolves.toEqual({ ok: true, id: 'gmail-message-id' });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Trace It <sender@example.org>',
      to: 'recipient@example.org',
    }));
  });

  it('returns diagnostic codes without persisting SMTP response text', async () => {
    process.env.GMAIL_USER = 'sender@example.org';
    process.env.GMAIL_APP_PASSWORD = 'test-app-password';
    process.env.EMAIL_FROM = 'sender@example.org';
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(Object.assign(
        new Error('SMTP password rejected for recipient@example.org'),
        { code: 'EAUTH', responseCode: 535 },
      )),
    } as never);
    const provider = new GmailSmtpProvider();

    await expect(provider.send({
      to: [{ email: 'recipient@example.org' }],
      subject: 'Test notification',
      text: 'Test body',
    })).resolves.toEqual({
      ok: false,
      error: 'Gmail SMTP delivery failed (EAUTH/535)',
      retryable: false,
    });
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
        BENEFICIARY_HMAC_SECRET: 'beneficiary-hmac-secret',
      }),
    ).toThrow('GMAIL_USER');

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        RAZORPAY_KEY_ID: 'key',
        RAZORPAY_KEY_SECRET: 'secret',
        RAZORPAY_WEBHOOK_SECRET: 'webhook',
        AES_DOCUMENT_KEY: 'a'.repeat(64),
        BENEFICIARY_HMAC_SECRET: 'beneficiary-hmac-secret',
        GMAIL_USER: 'sender@example.org',
        GMAIL_APP_PASSWORD: 'app-password',
        EMAIL_FROM: 'not-an-email',
      }),
    ).toThrow('EMAIL_FROM must contain a valid sender email address');

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        RAZORPAY_KEY_ID: 'key',
        RAZORPAY_KEY_SECRET: 'secret',
        RAZORPAY_WEBHOOK_SECRET: 'webhook',
        AES_DOCUMENT_KEY: 'a'.repeat(64),
        BENEFICIARY_HMAC_SECRET: 'beneficiary-hmac-secret',
        GMAIL_USER: 'sender@example.org',
        GMAIL_APP_PASSWORD: 'app-password',
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
    })).resolves.toEqual({ ok: false, error: 'Rejected by provider', retryable: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Trace It <onboarding@resend.dev>' }),
      undefined,
    );
  });

  it('marks Resend 422 validation errors non-retryable and redacts recipient addresses', async () => {
    process.env.RESEND_API_KEY = 're_testkey';
    process.env.EMAIL_FROM = 'Trace It <onboarding@resend.dev>';
    const send = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Invalid to field for donor@example.org', statusCode: 422 },
      headers: null,
    });
    const provider = new ResendEmailProvider({ emails: { send } } as never);

    await expect(provider.send({
      to: [{ email: 'donor@example.org' }],
      subject: 'Test',
      text: 'Test',
    })).resolves.toEqual({
      ok: false,
      error: 'Invalid to field for [email redacted]',
      retryable: false,
    });
  });
});
