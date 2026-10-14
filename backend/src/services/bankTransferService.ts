import crypto from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import {
  AuditActorType,
  BankTransferStatus,
  DisbursementStatus,
  DonationStatus,
  ProvenanceEventType,
} from '../../generated/prisma/enums.js';
import { prisma } from '../db/prisma.js';
import { enqueueBeneficiaryTransferReviewedEmail } from './email/notificationService.js';
import { DocumentService } from './documentService.js';
import { appendProvenanceEvent } from './provenanceChainService.js';
import { HashService } from './hashService.js';
import { parseInrAmount } from '../utils/money.js';

export class BankTransferError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'BankTransferError';
  }
}

const ACTIVE_TRANSFER_STATUSES = [
  BankTransferStatus.SUBMITTED,
  BankTransferStatus.APPROVED,
];
const VALID_DISBURSEMENT_STATUSES: DisbursementStatus[] = [
  DisbursementStatus.APPROVED,
  DisbursementStatus.SENT,
  DisbursementStatus.SETTLED,
];
const VALID_DONATION_STATUSES: DonationStatus[] = [
  DonationStatus.SUCCESS,
  DonationStatus.ALLOCATED,
  DonationStatus.DISBURSED,
  DonationStatus.DELIVERED,
];

type SubmitBankTransferInput = {
  ngoId: string;
  allocationId: string;
  amountInr: unknown;
  currencyCode: string;
  transferDate: string;
  bankReference?: string;
  submissionKey: string;
  resubmissionOfId?: string;
  file: Express.Multer.File;
};

const validTransferDate = (input: unknown): Date => {
  if (typeof input !== 'string') {
    throw new BankTransferError('A valid transferDate is required');
  }
  const date = new Date(input);
  if (!input || Number.isNaN(date.getTime())) {
    throw new BankTransferError('A valid transferDate is required');
  }
  return date;
};

const safeOriginalFilename = (filename: string): string =>
  filename.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 255);

export async function submitBankTransfer(
  input: SubmitBankTransferInput,
  database: typeof prisma = prisma,
) {
  const amount = parseInrAmount(input.amountInr).decimal;
  if (typeof input.allocationId !== 'string' || !input.allocationId.trim()) {
    throw new BankTransferError('allocationId is required');
  }
  if (typeof input.currencyCode !== 'string' || !input.currencyCode.trim()) {
    throw new BankTransferError('currencyCode is required');
  }
  if (typeof input.submissionKey !== 'string') {
    throw new BankTransferError('submissionKey is required');
  }
  if (
    input.bankReference !== undefined &&
    input.bankReference !== null &&
    typeof input.bankReference !== 'string'
  ) {
    throw new BankTransferError('bankReference must be a string');
  }
  if (
    input.resubmissionOfId !== undefined &&
    input.resubmissionOfId !== null &&
    typeof input.resubmissionOfId !== 'string'
  ) {
    throw new BankTransferError('resubmissionOfId must be a string');
  }
  const allocationId = input.allocationId.trim();
  const transferDate = validTransferDate(input.transferDate);
  const currencyCode = input.currencyCode.trim().toUpperCase();
  const bankReference = input.bankReference?.trim() || null;
  const submissionKey = input.submissionKey.trim();
  const resubmissionOfId = input.resubmissionOfId?.trim() || null;

  if (!submissionKey || submissionKey.length > 128) {
    throw new BankTransferError('A submissionKey between 1 and 128 characters is required');
  }
  if (bankReference && bankReference.length > 120) {
    throw new BankTransferError('bankReference must be 120 characters or fewer');
  }
  if (!input.file?.buffer?.length || input.file.size > 10 * 1024 * 1024) {
    throw new BankTransferError('Evidence file is required and must not exceed 10 MB');
  }
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(input.file.mimetype)) {
    throw new BankTransferError('Evidence must be a PDF, JPEG, or PNG');
  }

  const fileHash = HashService.sha512(input.file.buffer);
  const existingForKey = await database.bankTransfer.findUnique({
    where: { ngoId_submissionKey: { ngoId: input.ngoId, submissionKey } },
    include: { evidence: { select: { sha512Hash: true } } },
  });
  if (existingForKey) {
    if (
      existingForKey.allocationId === allocationId &&
      existingForKey.resubmissionOfId === resubmissionOfId &&
      existingForKey.amountInr.equals(amount) &&
      existingForKey.currencyCode === currencyCode &&
      existingForKey.transferDate.getTime() === transferDate.getTime() &&
      existingForKey.bankReference === bankReference &&
      existingForKey.evidence.some((document) => document.sha512Hash === fileHash)
    ) {
      return existingForKey;
    }
    throw new BankTransferError(
      'submissionKey has already been used for different transfer data',
      409,
    );
  }

  const transferId = crypto.randomUUID();
  const preparedEvidence = await DocumentService.prepareBankTransferEvidence(
    input.file,
    input.ngoId,
    transferId,
  );
  try {
    return await database.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "donation_allocations"
        WHERE "id" = ${allocationId}
        FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw new BankTransferError('Allocation not found', 404);
      }

      const allocation = await tx.donationAllocation.findUnique({
        where: { id: allocationId },
        include: {
          donation: { include: { ngo: true } },
          disbursement: true,
        },
      });
      if (
        !allocation ||
        allocation.donation.ngoId !== input.ngoId ||
        allocation.disbursement.ngoId !== input.ngoId ||
        allocation.donation.ngo.ngoStatus !== 'ACTIVE' ||
        !VALID_DISBURSEMENT_STATUSES.includes(allocation.disbursement.status) ||
        !VALID_DONATION_STATUSES.includes(allocation.donation.status)
      ) {
        throw new BankTransferError(
          'Allocation is not valid for this NGO transfer',
          404,
        );
      }
      if (resubmissionOfId) {
        const previousSubmission = await tx.bankTransfer.findUnique({
          where: { id: resubmissionOfId },
          select: {
            id: true,
            ngoId: true,
            allocationId: true,
            bankReference: true,
            status: true,
          },
        });
        if (
          !previousSubmission ||
          previousSubmission.status !== BankTransferStatus.REJECTED ||
          previousSubmission.ngoId !== input.ngoId ||
          previousSubmission.allocationId !== allocation.id ||
          previousSubmission.bankReference !== bankReference
        ) {
          throw new BankTransferError(
            'Resubmission must reference a rejected transfer for this allocation with the same bank reference',
            409,
          );
        }
      }
      if (
        currencyCode !== 'INR' ||
        currencyCode !== allocation.donation.currencyCode
      ) {
        throw new BankTransferError(
          'Transfer currency must match the INR allocation currency',
        );
      }

      const existingReference = bankReference
        ? await tx.bankTransfer.findFirst({
            where: {
              ngoId: input.ngoId,
              bankReference,
              status: { in: ACTIVE_TRANSFER_STATUSES },
            },
            select: { id: true },
          })
        : null;
      if (existingReference) {
        throw new BankTransferError(
          'An active transfer already uses this bank reference',
          409,
        );
      }

      const submittedTotals = await tx.bankTransfer.aggregate({
        where: {
          allocationId: allocation.id,
          status: { in: ACTIVE_TRANSFER_STATUSES },
        },
        _sum: { amountInr: true },
      });
      const alreadyReported =
        submittedTotals._sum.amountInr ?? new Prisma.Decimal(0);
      if (alreadyReported.plus(amount).greaterThan(allocation.amount)) {
        throw new BankTransferError(
          'Transfer amount exceeds the remaining allocation',
          409,
        );
      }

      const created = await tx.bankTransfer.create({
        data: {
          id: transferId,
          ngoId: input.ngoId,
          allocationId: allocation.id,
          amountInr: amount,
          currencyCode,
          transferDate,
          bankReference,
          submissionKey,
          resubmissionOfId,
        },
      });
      const evidenceDocument = await tx.document.create({
        data: {
          ownerId: input.ngoId,
          disbursementId: allocation.disbursementId,
          bankTransferId: created.id,
          documentType: 'BANK_TRANSFER_EVIDENCE',
          storageBucket: preparedEvidence.storageBucket,
          storagePath: preparedEvidence.storagePath,
          originalFilename: safeOriginalFilename(preparedEvidence.originalFilename),
          mimeType: input.file.mimetype,
          sizeBytes: BigInt(input.file.size),
          sha512Hash: preparedEvidence.sha512Hash,
        },
      });

      const occurredAt = new Date();
      await appendProvenanceEvent(
        tx,
        {
          eventType: ProvenanceEventType.BANK_TRANSFER_REPORTED,
          entityType: 'BankTransfer',
          entityId: created.id,
          amountInr: amount.toFixed(2),
          ngoId: input.ngoId,
          campaignId: allocation.donation.campaignId,
          occurredAt,
        },
        `submitted:${created.id}:${submissionKey}`,
      );
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.USER,
          actorId: input.ngoId,
          entityType: 'bank_transfer',
          entityId: created.id,
          action: resubmissionOfId
            ? 'BANK_TRANSFER_EVIDENCE_RESUBMITTED'
            : 'BANK_TRANSFER_EVIDENCE_SUBMITTED',
          metadata: {
            allocationId: allocation.id,
            amountInr: amount.toFixed(2),
            documentId: evidenceDocument.id,
            sha512Hash: preparedEvidence.sha512Hash,
            resubmissionOfId,
          },
        },
      });
      return created;
    });
  } catch (error) {
    try {
      await DocumentService.deletePreparedDocument(
        preparedEvidence.storageBucket,
        preparedEvidence.storagePath,
      );
    } catch (cleanupError) {
      console.error('[BankTransfer] Failed to clean up orphaned evidence file', {
        transferId,
        cleanupError,
      });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const duplicate = await database.bankTransfer.findUnique({
        where: { ngoId_submissionKey: { ngoId: input.ngoId, submissionKey } },
        include: { evidence: { select: { sha512Hash: true } } },
      });
      if (
        duplicate &&
        duplicate.allocationId === allocationId &&
        duplicate.resubmissionOfId === resubmissionOfId &&
        duplicate.amountInr.equals(amount) &&
        duplicate.currencyCode === currencyCode &&
        duplicate.transferDate.getTime() === transferDate.getTime() &&
        duplicate.bankReference === bankReference &&
        duplicate.evidence.some((document) => document.sha512Hash === fileHash)
      ) {
        return duplicate;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BankTransferError(
          'An active transfer already uses this submission key or bank reference',
          409,
        );
      }
    }
    throw error;
  }
}

export async function reviewBankTransfer(
  transferId: string,
  adminId: string,
  decision: 'APPROVE' | 'REJECT',
  rejectionReason?: string,
  database: typeof prisma = prisma,
) {
  if (decision === 'REJECT' && !rejectionReason?.trim()) {
    throw new BankTransferError('A rejection reason is required');
  }
  if (rejectionReason && rejectionReason.trim().length > 1000) {
    throw new BankTransferError('Rejection reason must be 1000 characters or fewer');
  }

  return database.$transaction(async (tx) => {
    const transfer = await tx.bankTransfer.findUnique({
      where: { id: transferId },
      include: {
        allocation: {
          include: { donation: true, disbursement: true },
        },
        evidence: { select: { id: true, sha512Hash: true } },
      },
    });
    if (!transfer) throw new BankTransferError('Bank transfer not found', 404);
    if (transfer.ngoId === adminId) {
      throw new BankTransferError('An NGO cannot review its own transfer evidence', 403);
    }
    if (transfer.status === BankTransferStatus.APPROVED) {
      if (decision === 'APPROVE') return transfer;
      throw new BankTransferError('Approved transfer evidence cannot be rejected', 409);
    }
    if (transfer.status !== BankTransferStatus.SUBMITTED) {
      throw new BankTransferError('Only submitted transfer evidence can be reviewed', 409);
    }

    const reviewedAt = new Date();
    const nextStatus =
      decision === 'APPROVE'
        ? BankTransferStatus.APPROVED
        : BankTransferStatus.REJECTED;
    const updated = await tx.bankTransfer.updateMany({
      where: { id: transfer.id, status: BankTransferStatus.SUBMITTED },
      data: {
        status: nextStatus,
        reviewedAt,
        reviewedBy: adminId,
        rejectionReason:
          decision === 'REJECT' ? rejectionReason!.trim() : null,
      },
    });
    if (updated.count !== 1) {
      const current = await tx.bankTransfer.findUnique({
        where: { id: transfer.id },
      });
      if (
        current?.status === BankTransferStatus.APPROVED &&
        decision === 'APPROVE'
      ) {
        return current;
      }
      throw new BankTransferError('Transfer review changed concurrently; reload and retry', 409);
    }

    await tx.auditLog.create({
      data: {
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        entityType: 'bank_transfer',
        entityId: transfer.id,
        action:
          decision === 'APPROVE'
            ? 'BANK_TRANSFER_EVIDENCE_APPROVED'
            : 'BANK_TRANSFER_EVIDENCE_REJECTED',
        metadata:
          decision === 'REJECT'
            ? {
                reason: rejectionReason!.trim(),
                evidence: transfer.evidence,
              }
            : {
                amountInr: transfer.amountInr.toFixed(2),
                evidence: transfer.evidence,
              },
      },
    });
    await appendProvenanceEvent(
      tx,
      {
        eventType:
          decision === 'APPROVE'
            ? ProvenanceEventType.BANK_TRANSFER_EVIDENCE_APPROVED
              : ProvenanceEventType.BANK_TRANSFER_EVIDENCE_REJECTED,
        entityType: 'BankTransfer',
        entityId: transfer.id,
        amountInr: transfer.amountInr.toFixed(2),
        ngoId: transfer.ngoId,
        campaignId: transfer.allocation.donation.campaignId,
        occurredAt: reviewedAt,
      },
      `${decision.toLowerCase()}:${transfer.id}:${reviewedAt.toISOString()}`,
    );
    if (decision === 'APPROVE') {
      await enqueueBeneficiaryTransferReviewedEmail(tx, transfer.id, reviewedAt);
    }

    return tx.bankTransfer.findUniqueOrThrow({
      where: { id: transfer.id },
    });
  });
}
