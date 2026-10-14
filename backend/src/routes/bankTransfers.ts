import { NextFunction, Request, Response } from 'express';
import { BankTransferStatus } from '../../generated/prisma/enums.js';
import { prisma } from '../db/prisma.js';
import { DocumentService } from '../services/documentService.js';
import {
  BankTransferError,
  reviewBankTransfer,
  submitBankTransfer,
} from '../services/bankTransferService.js';
import { MonetaryInputError } from '../utils/money.js';

const handleError = (
  error: unknown,
  res: Response,
  next: NextFunction,
): void => {
  if (error instanceof BankTransferError) {
    res.status(error.statusCode).json({ error: error.message });
  } else if (error instanceof MonetaryInputError) {
    res.status(400).json({ error: error.message });
  } else {
    next(error);
  }
};

export const mayAccessBankTransferEvidence = (
  transferNgoId: string,
  requesterId: string,
  isAdmin: boolean,
): boolean => isAdmin || transferNgoId === requesterId;

export const createBankTransfer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const ngoId = req.user?.id;
    if (!ngoId) return res.status(401).json({ error: 'User not authenticated' });
    if (!req.file) return res.status(400).json({ error: 'Evidence file is required' });
    const submissionKey = req.get('Idempotency-Key')?.trim();
    if (!submissionKey) {
      return res.status(400).json({ error: 'Idempotency-Key header is required' });
    }
    const transfer = await submitBankTransfer({
      ngoId,
      allocationId: req.body.allocationId,
      amountInr: req.body.amountInr,
      currencyCode: req.body.currencyCode,
      transferDate: req.body.transferDate,
      bankReference: req.body.bankReference,
      submissionKey,
      resubmissionOfId: req.body.resubmissionOfId,
      file: req.file,
    });
    return res.status(201).json({
      id: transfer.id,
      allocationId: transfer.allocationId,
      amountInr: transfer.amountInr,
      currencyCode: transfer.currencyCode,
      transferDate: transfer.transferDate,
      status: transfer.status,
      submittedAt: transfer.submittedAt,
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const listNgoBankTransfers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const transfers = await prisma.bankTransfer.findMany({
      where: { ngoId: req.user!.id },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        allocationId: true,
        amountInr: true,
        currencyCode: true,
        transferDate: true,
        bankReference: true,
        status: true,
        resubmissionOfId: true,
        rejectionReason: true,
        submittedAt: true,
        reviewedAt: true,
        allocation: {
          select: {
            donation: { select: { publicId: true } },
            disbursement: { select: { id: true } },
          },
        },
        evidence: {
          select: { id: true, originalFilename: true, mimeType: true },
        },
      },
    });
    return res.json({ transfers });
  } catch (error) {
    next(error);
  }
};

export const listPendingBankTransfers = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const transfers = await prisma.bankTransfer.findMany({
      where: { status: BankTransferStatus.SUBMITTED },
      orderBy: { submittedAt: 'asc' },
      select: {
        id: true,
        ngoId: true,
        amountInr: true,
        currencyCode: true,
        transferDate: true,
        bankReference: true,
        status: true,
        resubmissionOfId: true,
        submittedAt: true,
        ngo: { select: { organisationName: true, fullName: true } },
        allocation: {
          select: {
            donation: { select: { publicId: true } },
            disbursement: { select: { id: true } },
          },
        },
        evidence: {
          select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true },
        },
      },
    });
    return res.json({ transfers });
  } catch (error) {
    next(error);
  }
};

const downloadTransferEvidence = async (
  transferId: string,
  documentId: string,
  requesterId: string,
  isAdmin: boolean,
) : Promise<{
  bytes: Buffer;
  mimeType: string;
  filename: string;
}> => {
  const transfer = await prisma.bankTransfer.findUnique({
    where: { id: transferId },
    select: {
      id: true,
      ngoId: true,
      evidence: {
        where: {
          id: documentId,
          status: 'ACTIVE',
          documentType: 'BANK_TRANSFER_EVIDENCE',
        },
        select: {
          storageBucket: true,
          storagePath: true,
          originalFilename: true,
          mimeType: true,
          sha512Hash: true,
        },
      },
    },
  });
  if (!transfer) throw new BankTransferError('Bank transfer not found', 404);
  if (!mayAccessBankTransferEvidence(transfer.ngoId, requesterId, isAdmin)) {
    throw new BankTransferError('Not authorized to access this evidence', 403);
  }
  const document = transfer.evidence[0];
  if (!document) {
    throw new BankTransferError('Transfer evidence not found', 404);
  }
  const bytes = await DocumentService.readBankTransferEvidence(document);
  const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  const mimeType = allowedMimeTypes.includes(document.mimeType ?? '')
    ? document.mimeType!
    : 'application/octet-stream';
  return {
    bytes,
    mimeType,
    filename: (document.originalFilename || 'transfer-evidence')
      .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
      .slice(0, 255),
  };
};

const sendTransferEvidence = async (
  req: Request,
  res: Response,
  next: NextFunction,
  isAdmin: boolean,
) => {
  try {
    const document = await downloadTransferEvidence(
      req.params.id as string,
      req.params.documentId as string,
      req.user!.id,
      isAdmin,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(document.mimeType);
    return res.attachment(document.filename).send(document.bytes);
  } catch (error) {
    handleError(error, res, next);
  }
};

export const downloadNgoBankTransferEvidence = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  return sendTransferEvidence(req, res, next, false);
};

export const downloadAdminBankTransferEvidence = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  return sendTransferEvidence(req, res, next, true);
};

const review = async (
  req: Request,
  res: Response,
  next: NextFunction,
  decision: 'APPROVE' | 'REJECT',
) => {
  try {
    const transfer = await reviewBankTransfer(
      req.params.id as string,
      req.user!.id,
      decision,
      req.body?.reason,
    );
    return res.json({
      id: transfer.id,
      status: transfer.status,
      reviewedAt: transfer.reviewedAt,
      rejectionReason: transfer.rejectionReason,
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const approveBankTransfer = (req: Request, res: Response, next: NextFunction) =>
  review(req, res, next, 'APPROVE');

export const rejectBankTransfer = (req: Request, res: Response, next: NextFunction) =>
  review(req, res, next, 'REJECT');
