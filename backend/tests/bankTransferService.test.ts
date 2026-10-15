import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import {
  BankTransferStatus,
  DisbursementStatus,
  DonationStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { requireRole } from '../src/middleware/requireRole.js';
import { DocumentService } from '../src/services/documentService.js';
import { mayAccessBankTransferEvidence } from '../src/routes/bankTransfers.js';
import { HashService } from '../src/services/hashService.js';
import {
  reviewBankTransfer,
  submitBankTransfer,
} from '../src/services/bankTransferService.js';

const id = (tail: string) => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;

const transfer = {
  id: id('1'),
  ngoId: id('2'),
  allocationId: id('3'),
  amountInr: new Prisma.Decimal('25.00'),
  currencyCode: 'INR',
  transferDate: new Date('2026-10-01T00:00:00.000Z'),
  bankReference: 'bank-ref-1',
  submissionKey: 'submission-1',
  resubmissionOfId: null,
  status: BankTransferStatus.SUBMITTED,
  reviewedAt: null,
  reviewedBy: null,
  rejectionReason: null,
  evidence: [{ id: id('10'), sha512Hash: 'a'.repeat(128) }],
  allocation: {
    disbursementId: id('4'),
    donation: {
      id: id('5'),
      publicId: 'donation-public-1',
      campaignId: id('6'),
      donor: { email: 'donor@traceit-testharness.com', fullName: 'Donor' },
      ngo: { fullName: 'NGO', organisationName: 'Example NGO' },
    },
  },
};

const makeReviewDatabase = (failOutbox = false) => {
  let status: BankTransferStatus = BankTransferStatus.SUBMITTED;
  let reviewedAt: Date | null = null;
  const outboxRows: Array<Record<string, unknown>> = [];
  const auditRows: Array<Record<string, unknown>> = [];
  const provenanceRows: Array<Record<string, unknown>> = [];

  const tx = {
    bankTransfer: {
      findUnique: jest.fn(async () => ({
        ...transfer,
        status,
        reviewedAt,
      })),
      findUniqueOrThrow: jest.fn(async () => ({
        ...transfer,
        status,
        reviewedAt,
      })),
      updateMany: jest.fn(async ({ data }: { data: { status: BankTransferStatus; reviewedAt: Date } }) => {
        if (status !== BankTransferStatus.SUBMITTED) return { count: 0 };
        status = data.status;
        reviewedAt = data.reviewedAt;
        return { count: 1 };
      }),
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        auditRows.push(data);
      }),
    },
    provenanceEvent: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        provenanceRows.push(data);
      }),
    },
    emailOutbox: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (failOutbox) throw new Error('outbox write failed');
        outboxRows.push(data);
      }),
    },
    $queryRaw: jest.fn(async () => [{ locked: 1 }]),
  };
  const database = {
    $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
      const previousStatus = status;
      const previousReviewedAt = reviewedAt;
      const previousOutboxCount = outboxRows.length;
      const previousAuditCount = auditRows.length;
      const previousProvenanceCount = provenanceRows.length;
      try {
        return await work(tx);
      } catch (error) {
        status = previousStatus;
        reviewedAt = previousReviewedAt;
        outboxRows.length = previousOutboxCount;
        auditRows.length = previousAuditCount;
        provenanceRows.length = previousProvenanceCount;
        throw error;
      }
    },
  } as unknown as PrismaClient;

  return { database, tx, outboxRows, auditRows, provenanceRows, getStatus: () => status };
};

describe('bank transfer review lifecycle', () => {
  const previousFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://trace-it.example';
  });

  afterAll(() => {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
  });

  it('records approval, provenance, audit, and one donor email with careful attribution', async () => {
    const harness = makeReviewDatabase();
    const result = await reviewBankTransfer(
      transfer.id,
      id('7'),
      'APPROVE',
      undefined,
      harness.database,
    );

    expect(result.status).toBe(BankTransferStatus.APPROVED);
    expect(harness.outboxRows).toHaveLength(1);
    expect(harness.outboxRows[0]).toMatchObject({
      eventKey: `BENEFICIARY_TRANSFER_REVIEWED:${transfer.id}`,
      milestone: 'BENEFICIARY_TRANSFER_REVIEWED',
      donationId: transfer.allocation.donation.id,
      disbursementId: transfer.allocation.disbursementId,
      payload: expect.objectContaining({
        to: [{ email: 'donor@traceit-testharness.com', name: 'Donor' }],
        text: expect.stringContaining('does not independently verify bank settlement'),
      }),
    });
    expect((harness.outboxRows[0].payload as { text: string }).text).toContain(
      'Supporting evidence reviewed and approved',
    );
    expect((harness.outboxRows[0].payload as { text: string }).text).not.toContain(
      'bank-ref-1',
    );
    expect(harness.auditRows[0]).toMatchObject({
      action: 'BANK_TRANSFER_EVIDENCE_APPROVED',
      actorId: id('7'),
      entityId: transfer.id,
      metadata: {
        evidence: [{ id: id('10'), sha512Hash: 'a'.repeat(128) }],
      },
    });
    expect(harness.provenanceRows[0]).toMatchObject({
      eventType: 'BANK_TRANSFER_EVIDENCE_APPROVED',
      entityId: transfer.id,
    });
  });

  it('rejects with an auditable reason and does not queue email', async () => {
    const harness = makeReviewDatabase();
    await reviewBankTransfer(
      transfer.id,
      id('7'),
      'REJECT',
      'Receipt is unreadable',
      harness.database,
    );

    expect(harness.getStatus()).toBe(BankTransferStatus.REJECTED);
    expect(harness.auditRows[0]).toMatchObject({
      action: 'BANK_TRANSFER_EVIDENCE_REJECTED',
      metadata: { reason: 'Receipt is unreadable' },
    });
    expect(harness.provenanceRows[0]).toMatchObject({
      eventType: 'BANK_TRANSFER_EVIDENCE_REJECTED',
    });
    expect(harness.outboxRows).toHaveLength(0);
  });

  it('requires rejection reasons and prevents NGO self-review', async () => {
    const harness = makeReviewDatabase();
    await expect(
      reviewBankTransfer(transfer.id, id('7'), 'REJECT', undefined, harness.database),
    ).rejects.toThrow('A rejection reason is required');
    await expect(
      reviewBankTransfer(transfer.id, transfer.ngoId, 'APPROVE', undefined, harness.database),
    ).rejects.toThrow('An NGO cannot review its own transfer evidence');
    expect(harness.outboxRows).toHaveLength(0);
  });

  it('makes repeated and concurrent approval requests one logical email event', async () => {
    const harness = makeReviewDatabase();
    await Promise.all([
      reviewBankTransfer(transfer.id, id('7'), 'APPROVE', undefined, harness.database),
      reviewBankTransfer(transfer.id, id('8'), 'APPROVE', undefined, harness.database),
    ]);
    await reviewBankTransfer(
      transfer.id,
      id('9'),
      'APPROVE',
      undefined,
      harness.database,
    );

    expect(harness.outboxRows).toHaveLength(1);
    expect(harness.outboxRows[0].eventKey).toBe(
      `BENEFICIARY_TRANSFER_REVIEWED:${transfer.id}`,
    );
  });

  it('rolls back approval when the transactional outbox insert fails', async () => {
    const harness = makeReviewDatabase(true);
    await expect(
      reviewBankTransfer(transfer.id, id('7'), 'APPROVE', undefined, harness.database),
    ).rejects.toThrow('outbox write failed');
    expect(harness.getStatus()).toBe(BankTransferStatus.SUBMITTED);
    expect(harness.auditRows).toHaveLength(0);
    expect(harness.provenanceRows).toHaveLength(0);
  });
});

describe('NGO transfer submission validation', () => {
  it('requires a valid allocation currency and amount within allocation capacity', async () => {
    const prepareEvidence = jest
      .spyOn(DocumentService, 'prepareBankTransferEvidence')
      .mockResolvedValue({
        storageBucket: 'proof-docs',
        storagePath: `${id('2')}/BANK_TRANSFER_EVIDENCE/${id('8')}.pdf`,
        sha512Hash: 'hash',
        originalFilename: 'receipt.pdf',
      });
    const deleteEvidence = jest
      .spyOn(DocumentService, 'deletePreparedDocument')
      .mockResolvedValue();
    const file = {
      buffer: Buffer.from('test document'),
      size: 13,
      mimetype: 'application/pdf',
      originalname: 'receipt.pdf',
    } as Express.Multer.File;
    const allocation = {
      id: id('3'),
      amount: new Prisma.Decimal('100.00'),
      donation: {
        id: id('5'),
        ngoId: id('2'),
        status: DonationStatus.ALLOCATED,
        currencyCode: 'INR',
        campaignId: id('6'),
        ngo: { ngoStatus: 'ACTIVE' },
      },
      disbursementId: id('4'),
      disbursement: {
        id: id('4'),
        ngoId: id('2'),
        status: DisbursementStatus.APPROVED,
      },
    };
    const makeDatabase = (
      alreadyReported: string | null,
      priorSubmission: Record<string, unknown> | null = null,
    ) => {
      const tx = {
        $queryRaw: jest.fn(async (parts: TemplateStringsArray) =>
          parts.join('').includes('pg_advisory_xact_lock')
            ? [{ locked: 1 }]
            : [{ id: id('3') }],
        ),
        donationAllocation: {
          findUnique: jest.fn().mockResolvedValue(allocation),
        },
        bankTransfer: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({
            _sum: {
              amountInr: alreadyReported
                ? new Prisma.Decimal(alreadyReported)
                : null,
            },
          }),
          create: jest.fn().mockResolvedValue({
            id: id('8'),
            allocationId: id('3'),
            amountInr: new Prisma.Decimal('50.00'),
            currencyCode: 'INR',
            transferDate: new Date('2026-10-01T00:00:00.000Z'),
            status: BankTransferStatus.SUBMITTED,
            submittedAt: new Date(),
          }),
          findUnique: jest.fn().mockResolvedValue(priorSubmission),
        },
        document: { create: jest.fn().mockResolvedValue({ id: id('11') }) },
        auditLog: { create: jest.fn() },
        emailOutbox: { create: jest.fn() },
        provenanceEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      };
      return {
        tx,
        database: {
          bankTransfer: { findUnique: jest.fn().mockResolvedValue(null) },
          $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        } as unknown as PrismaClient,
      };
    };
    const input = {
      ngoId: id('2'),
      allocationId: id('3'),
      amountInr: '50.00',
      currencyCode: 'INR',
      transferDate: '2026-10-01T00:00:00.000Z',
      bankReference: 'bank-ref-2',
      submissionKey: 'submit-once',
      file,
    };

    try {
      const valid = makeDatabase(null);
      const result = await submitBankTransfer(input, valid.database);
      expect(result.status).toBe(BankTransferStatus.SUBMITTED);
      expect(valid.tx.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bankTransferId: id('8'),
            documentType: 'BANK_TRANSFER_EVIDENCE',
          }),
        }),
      );
      expect(valid.tx.emailOutbox.create).not.toHaveBeenCalled();

      const tooMuch = makeDatabase('60.00');
      await expect(submitBankTransfer(input, tooMuch.database)).rejects.toThrow(
        'Transfer amount exceeds the remaining allocation',
      );

      const wrongCurrency = makeDatabase(null);
      await expect(
        submitBankTransfer(
          { ...input, currencyCode: 'USD' },
          wrongCurrency.database,
        ),
      ).rejects.toThrow('Transfer currency must match the INR allocation currency');

      const priorSubmission = {
        ...transfer,
        allocationId: input.allocationId,
        amountInr: new Prisma.Decimal(input.amountInr),
        currencyCode: input.currencyCode,
        transferDate: new Date(input.transferDate),
        bankReference: input.bankReference,
        evidence: [{ sha512Hash: HashService.sha512(file.buffer) }],
      };
      const duplicateDatabase = {
        bankTransfer: {
          findUnique: jest.fn().mockResolvedValue(priorSubmission),
        },
      } as unknown as PrismaClient;
      await expect(
        submitBankTransfer(input, duplicateDatabase),
      ).resolves.toBe(priorSubmission);

      const rejectedSubmission = {
        id: id('9'),
        ngoId: input.ngoId,
        allocationId: input.allocationId,
        bankReference: input.bankReference,
        status: BankTransferStatus.REJECTED,
      };
      const resubmission = makeDatabase(null, rejectedSubmission);
      await submitBankTransfer(
        { ...input, submissionKey: 'submit-retry', resubmissionOfId: id('9') },
        resubmission.database,
      );
      expect(resubmission.tx.bankTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resubmissionOfId: id('9') }),
        }),
      );
      expect(resubmission.tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'BANK_TRANSFER_EVIDENCE_RESUBMITTED',
          }),
        }),
      );
    } finally {
      prepareEvidence.mockRestore();
      deleteEvidence.mockRestore();
    }
  });
});

describe('bank transfer evidence access control', () => {
  it('allows only the owning NGO or an authenticated admin', () => {
    expect(mayAccessBankTransferEvidence(id('2'), id('2'), false)).toBe(true);
    expect(mayAccessBankTransferEvidence(id('2'), id('3'), false)).toBe(false);
    expect(mayAccessBankTransferEvidence(id('2'), id('7'), true)).toBe(true);
  });

  it('does not allow a charity identity through the admin review role gate', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    requireRole(UserRole.ADMIN)(
      { user: { id: id('2'), role: UserRole.CHARITY } } as never,
      { status, json } as never,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });
});
