import type { Prisma } from '../../../generated/prisma/client.js';
import {
  AttestationStatus,
  BankTransferStatus,
  AttestationType,
  DisbursementStatus,
  DonationStatus,
  EmailMilestone,
} from '../../../generated/prisma/enums.js';
import type { EmailRecipient } from './emailProvider.js';
import {
  buildDonationSuccessEmail,
  buildFundsAllocatedEmail,
  buildBeneficiaryTransferReviewedEmail,
} from './emailTemplates.js';

export type DonationEmailContext = {
  id: string;
  publicId: string;
  amount: { toString(): string };
  currencyCode: string;
  donor: { email: string; fullName: string | null };
  ngo: {
    fullName: string | null;
    organisationName: string | null;
  };
};

type EmailOutboxPayload = {
  to: EmailRecipient[];
  subject: string;
  html: string;
  text: string;
};

const donationLink = (): string | undefined => {
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!frontendUrl) return undefined;

  try {
    const url = new URL(frontendUrl);
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    ) {
      return undefined;
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/donor`;
    return url.toString();
  } catch {
    return undefined;
  }
};

const getRecipients = (donation: DonationEmailContext): EmailRecipient[] => {
  return [{ email: donation.donor.email, name: donation.donor.fullName }];
};

const enqueue = async (
  tx: Prisma.TransactionClient,
  input: {
    eventKey: string;
    milestone: EmailMilestone;
    donationId: string;
    disbursementId?: string;
    payload: EmailOutboxPayload;
  },
): Promise<void> => {
  await tx.emailOutbox.create({
    data: {
      eventKey: input.eventKey,
      milestone: input.milestone,
      donationId: input.donationId,
      disbursementId: input.disbursementId,
      payload: input.payload,
    },
  });
};

export const enqueueDonationSuccessEmail = async (
  tx: Prisma.TransactionClient,
  donation: DonationEmailContext,
  confirmedAt: Date,
): Promise<void> => {
  const content = buildDonationSuccessEmail({
    donationRef: donation.publicId,
    amount: donation.amount.toString(),
    currency: donation.currencyCode,
    ngoName: donation.ngo.organisationName || donation.ngo.fullName,
    occurredAt: confirmedAt,
    donationLink: donationLink(),
  });

  await enqueue(tx, {
    eventKey: `DONATION_SUCCESS:${donation.id}`,
    milestone: 'DONATION_SUCCESS',
    donationId: donation.id,
    payload: { to: getRecipients(donation), ...content },
  });
};

export const enqueueFundsAllocatedEmail = async (
  tx: Prisma.TransactionClient,
  input: {
    donation: DonationEmailContext;
    disbursementId: string;
    allocatedAmount: { toString(): string };
    attestedAt: Date;
  },
): Promise<void> => {
  const content = buildFundsAllocatedEmail({
    donationRef: input.donation.publicId,
    disbursementRef: input.disbursementId,
    amount: input.allocatedAmount.toString(),
    currency: input.donation.currencyCode,
    ngoName: input.donation.ngo.organisationName || input.donation.ngo.fullName,
    firstAttestationStatus: 'APPROVED',
    firstAttestationAt: input.attestedAt,
    donationLink: donationLink(),
  });

  await enqueue(tx, {
    eventKey: `FUNDS_ALLOCATED:${input.donation.id}:${input.disbursementId}`,
    milestone: 'FUNDS_ALLOCATED',
    donationId: input.donation.id,
    disbursementId: input.disbursementId,
    payload: { to: getRecipients(input.donation), ...content },
  });
};

export const enqueueFundsAllocatedForCompletedAttestation = async (
  tx: Prisma.TransactionClient,
  attestationId: string,
  ngoId: string,
): Promise<boolean> => {
  const attestation = await tx.attestation.findUnique({
    where: { id: attestationId },
    include: { donation: { include: { donor: true, ngo: true } } },
  });

  if (
    !attestation ||
    attestation.type !== AttestationType.RECEIPT ||
    attestation.status !== AttestationStatus.APPROVED ||
    !attestation.disbursementId ||
    (attestation.donation.status !== DonationStatus.SUCCESS &&
      attestation.donation.status !== DonationStatus.ALLOCATED &&
      attestation.donation.status !== DonationStatus.DISBURSED &&
      attestation.donation.status !== DonationStatus.DELIVERED)
  ) {
    return false;
  }

  const [allocation, disbursement] = await Promise.all([
    tx.donationAllocation.findFirst({
      where: {
        donationId: attestation.donationId,
        disbursementId: attestation.disbursementId,
      },
      select: { amount: true },
    }),
    tx.disbursement.findUnique({
      where: { id: attestation.disbursementId },
      select: { status: true, ngoId: true },
    }),
  ]);

  if (
    !allocation ||
    !disbursement ||
    disbursement.ngoId !== ngoId ||
    (disbursement.status !== DisbursementStatus.APPROVED &&
      disbursement.status !== DisbursementStatus.SENT &&
      disbursement.status !== DisbursementStatus.SETTLED)
  ) {
    return false;
  }

  await enqueueFundsAllocatedEmail(tx, {
    donation: attestation.donation,
    disbursementId: attestation.disbursementId,
    allocatedAmount: allocation.amount,
    attestedAt: attestation.approvedAt ?? attestation.updatedAt,
  });
  return true;
};

export const enqueueBeneficiaryTransferReviewedEmail = async (
  tx: Prisma.TransactionClient,
  bankTransferId: string,
  reviewedAt: Date,
): Promise<void> => {
  const transfer = await tx.bankTransfer.findUnique({
    where: { id: bankTransferId },
    include: {
      allocation: {
        include: {
          donation: { include: { donor: true, ngo: true } },
        },
      },
    },
  });
  if (!transfer || transfer.status !== BankTransferStatus.APPROVED) {
    throw new Error('Only approved transfer evidence can trigger its review notification');
  }

  const donation = transfer.allocation.donation;
  const content = buildBeneficiaryTransferReviewedEmail({
    donationRef: donation.publicId,
    ngoName: donation.ngo.organisationName || donation.ngo.fullName,
    amount: transfer.amountInr.toFixed(2),
    currency: transfer.currencyCode,
    transferDate: transfer.transferDate,
    reviewedAt,
    donationLink: donationLink(),
  });

  await enqueue(tx, {
    eventKey: `BENEFICIARY_TRANSFER_REVIEWED:${transfer.id}`,
    milestone: 'BENEFICIARY_TRANSFER_REVIEWED',
    donationId: donation.id,
    disbursementId: transfer.allocation.disbursementId,
    payload: {
      to: getRecipients(donation),
      ...content,
    },
  });
};
