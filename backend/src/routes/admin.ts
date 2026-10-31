import { Request, Response, NextFunction, Router } from "express";
import { prisma } from "../db/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  UserRole,
  DisbursementStatus,
  AuditActorType,
  NgoStatus,
  CampaignStatus,
  KycStatus,
  GovernmentRequestStatus,
  AttestationStatus,
  ProvenanceEventType,
} from "../../generated/prisma/enums.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { allocateDonation } from "../services/statusService.js";
import { appendProvenanceEvent } from "../services/provenanceChainService.js";
import { HashService } from "../services/hashService.js";
import { inspectProviderRefunds, resolveRefundJob } from "../services/refundService.js";

import { StorageService } from "../services/storageService.js";
import logger from "../utils/logger.js";
import {
  approveBankTransfer,
  downloadAdminBankTransferEvidence,
  listPendingBankTransfers,
  rejectBankTransfer,
} from "./bankTransfers.js";

const adminRouter = Router();


const listRefundReconciliation = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [jobs, allocatedCases] = await Promise.all([
      prisma.refundOutbox.findMany({
        where: { status: "RECONCILIATION_REQUIRED" },
        include: { donation: { select: { id: true, amount: true, refundedAmount: true, status: true, allocatedAmount: true, razorpayPaymentId: true } } },
        orderBy: { updatedAt: "asc" },
      }),
      prisma.donation.findMany({ where: { status: "REFUND_RECONCILIATION_REQUIRED" }, include: { providerRefunds: true, donationAllocations: true }, orderBy: { updatedAt: "asc" } }),
    ]);
    const unresolvedDonationIds = new Set([...jobs.map((job) => job.donationId), ...allocatedCases.map((donation) => donation.id)]);
    res.json({ unresolvedCount: unresolvedDonationIds.size, unresolvedOutboxCount: jobs.length, allocatedCaseCount: allocatedCases.length, jobs, allocatedCases });
  } catch (error) { next(error); }
};

const inspectRefundReconciliation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.refundOutbox.findUnique({ where: { id: req.params.id as string }, include: { donation: true } });
    if (!job) {
      const donation = await prisma.donation.findUnique({ where: { id: req.params.id as string }, include: { providerRefunds: true, donationAllocations: { include: { disbursement: true } } } });
      if (donation?.status === "REFUND_RECONCILIATION_REQUIRED") return res.json({ donation, providerRefunds: donation.providerRefunds, allocations: donation.donationAllocations, resolution: "Manual financial review required; automated balance changes are disabled for allocated donations." });
      return res.status(404).json({ error: "Refund job or financial exception not found" });
    }
    const provider = await inspectProviderRefunds(job.razorpayPaymentId);
    return res.json({ job, providerRefunds: provider.items });
  } catch (error) { next(error); }
};

const resolveRefundReconciliation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.user?.id;
    const resolution = req.body?.resolution;
    if (!adminId) return res.status(401).json({ error: "User not authenticated" });
    if (!["CONFIRMED", "FAILED", "RETRYABLE"].includes(resolution)) {
      return res.status(400).json({ error: "resolution must be CONFIRMED, FAILED, or RETRYABLE" });
    }
    const changed = await resolveRefundJob(req.params.id as string, resolution);
    if (!changed) return res.status(409).json({ error: "Refund job was not resolved; refresh provider evidence" });
    await writeAuditLog({ actorType: AuditActorType.USER, actorId: adminId, entityType: "refund_outbox",
      entityId: req.params.id as string, action: "REFUND_RECONCILIATION_RESOLVED",
      metadata: { resolution }, ipAddress: req.ip });
    return res.json({ resolved: true, resolution });
  } catch (error) { next(error); }
};

const adminCampaignResponse = (campaign: any) => {
  if (!campaign) return campaign;
  const {
    beneficiaryIdHash: _hash,
    beneficiaryIdEncrypted: _id,
    beneficiaryNameEncrypted: encryptedName,
    beneficiaryDescriptionEncrypted: encryptedDescription,
    beneficiaryName,
    beneficiaryDescription,
    ...safe
  } = campaign;
  return {
    ...safe,
    beneficiaryName: encryptedName ? HashService.decryptSensitiveValue(encryptedName) : beneficiaryName,
    beneficiaryDescription: encryptedDescription ? HashService.decryptSensitiveValue(encryptedDescription) : beneficiaryDescription,
  };
};

const adminDisbursementResponse = (disbursement: any) => ({
  ...disbursement,
  ...(disbursement.campaign ? { campaign: adminCampaignResponse(disbursement.campaign) } : {}),
});

// ---------------------------------------------------------------------------
// POST /disburse/:id/approve
// ---------------------------------------------------------------------------
export const approveDisbursement = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    const disbursementId = req.params.id as string;

    if (!adminId)
      return res.status(401).json({ error: "User not authenticated" });

    const disbursement = await prisma.disbursement.findUnique({
      where: { id: disbursementId },
      include: { campaign: true },
    });
    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }

    if (disbursement.status !== DisbursementStatus.PENDING) {
      return res.status(400).json({ error: "Disbursement is not PENDING" });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const claimed = await tx.disbursement.updateMany({
        where: {
          id: disbursementId,
          status: DisbursementStatus.PENDING,
        },
        data: {
          status: DisbursementStatus.APPROVED,
          approvedBy: adminId,
          approvedAt,
        },
      });

      if (claimed.count !== 1) {
        return { claimed: false as const };
      }

      const lockedCampaign = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "campaigns"
        WHERE "id" = ${disbursement.campaignId}
        FOR UPDATE
      `;
      if (lockedCampaign.length !== 1) {
        throw new Error("Campaign not found after approval claim");
      }

      const approvedDisbursement = await tx.disbursement.findUnique({
        where: { id: disbursementId },
        include: { campaign: true },
      });

      if (!approvedDisbursement) {
        throw new Error("Disbursement not found after approval claim");
      }

      const approvedDisbursements = await tx.disbursement.aggregate({
        where: {
          id: { not: disbursementId },
          campaignId: approvedDisbursement.campaignId,
          status: { in: ["APPROVED", "SENT", "SETTLED"] },
        },
        _sum: { amountInr: true },
      });

      const totalDisbursed = (
        approvedDisbursements._sum.amountInr ?? new Prisma.Decimal(0)
      ).plus(approvedDisbursement.amountInr);
      const isFinalDisbursement = totalDisbursed.greaterThanOrEqualTo(
        approvedDisbursement.campaign.raisedAmount,
      );

      const updated = await tx.disbursement.update({
        where: { id: disbursementId },
        data: { isFinalDisbursement },
      });

      const donations = await tx.donation.findMany({
        where: {
          campaignId: approvedDisbursement.campaignId,
          status: { in: ["SUCCESS", "ALLOCATED", "DISBURSED", "DELIVERED"] },
        },
        orderBy: { createdAt: "asc" },
      });

      let remainingToAllocate = approvedDisbursement.amountInr;

      for (const donation of donations) {
        if (remainingToAllocate.lessThanOrEqualTo(0)) break;

        const availableInDonation = donation.amount
          .minus(donation.allocatedAmount)
          .minus(donation.refundedAmount);
        if (availableInDonation.lessThanOrEqualTo(0)) continue;

        const amountToAllocate = availableInDonation.lessThan(
          remainingToAllocate,
        )
          ? availableInDonation
          : remainingToAllocate;
        const occurredAt = new Date();

        await tx.donationAllocation.create({
          data: {
            donationId: donation.id,
            disbursementId: approvedDisbursement.id,
            amount: amountToAllocate,
          },
        });

        const newAllocatedAmount = donation.allocatedAmount.plus(
          amountToAllocate,
        );
        const newStatus =
          donation.status === "SUCCESS" ? "ALLOCATED" : donation.status;

        const donationUpdate = await tx.donation.updateMany({
          where: {
            id: donation.id,
            allocatedAmount: donation.allocatedAmount,
          },
          data: {
            allocatedAmount: newAllocatedAmount,
            status: newStatus,
          },
        });
        if (donationUpdate.count !== 1) {
          throw new Error("Donation allocation conflicted with another approval");
        }

        await tx.attestation.create({
          data: {
            donationId: donation.id,
            disbursementId: approvedDisbursement.id,
            type: "RECEIPT",
            allocatedAmount: amountToAllocate,
            requestedBy: donation.donorId,
            status: "PENDING",
          },
        });

        const provenanceInput = {
          eventType: ProvenanceEventType.DONATION_ALLOCATED,
          entityType: "Donation",
          entityId: donation.id,
          amountInr: amountToAllocate.toFixed(2),
          ngoId: donation.ngoId,
          campaignId: donation.campaignId,
          occurredAt,
        };
        await appendProvenanceEvent(
          tx,
          provenanceInput,
          approvedDisbursement.id,
        );

        remainingToAllocate = remainingToAllocate.minus(amountToAllocate);
      }

      return { claimed: true as const, updated };
    });

    if (!transactionResult.claimed) {
      return res.status(400).json({ error: "Disbursement is not PENDING" });
    }

    const updated = transactionResult.updated;

    // Write audit log
    await writeAuditLog({
      actorType: AuditActorType.USER, // Admin is a user in the system
      actorId: adminId,
      entityType: "disbursement",
      entityId: disbursement.id,
      action: "DISBURSEMENT_APPROVED",
      metadata: {
        campaignId: disbursement.campaignId,
        amountInr: Number(disbursement.amountInr),
      },
    });

    res.json(adminDisbursementResponse(updated));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /disbursements
// ---------------------------------------------------------------------------
export const getAllDisbursements = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status, campaignId, ngoId } = req.query;

    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (campaignId) whereClause.campaignId = campaignId;
    if (ngoId) whereClause.ngoId = ngoId;

    const disbursements = await prisma.disbursement.findMany({
      where: whereClause,
      include: {
        campaign: { select: { id: true, title: true } },
        ngo: { select: { id: true, organisationName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(disbursements.map(adminDisbursementResponse));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /disbursements/:id
// ---------------------------------------------------------------------------
export const getDisbursementById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.params.id as string;

    const disbursement = await prisma.disbursement.findUnique({
      where: { id },
      include: {
        campaign: true,
        ngo: true,
        cohort: true,
        documents: true,
      },
    });

    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }

    res.json(adminDisbursementResponse(disbursement));
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/ngos — list all NGOs with status filter
export const getNgos = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status } = req.query;
    const whereClause: any = {
      role: UserRole.CHARITY,
    };
    if (status) {
      whereClause.ngoStatus = status as NgoStatus;
    }
    const ngos = await prisma.profile.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isVerified: true,
        ngoStatus: true,
        kycStatus: true,
        registrationNo: true,
        organisationName: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(ngos);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/ngos/:id/approve → ngo_status: ACTIVE, audit log NGO_APPROVED
export const approveNgo = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    const ngoId = req.params.id as string;
    if (!adminId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const ngo = await prisma.profile.findUnique({ where: { id: ngoId } });
    if (!ngo) {
      return res.status(404).json({ error: "NGO not found" });
    }
    if (ngo.role !== UserRole.CHARITY) {
      return res.status(400).json({ error: "Profile is not an NGO" });
    }
    const updated = await prisma.profile.update({
      where: { id: ngoId },
      data: {
        ngoStatus: NgoStatus.ACTIVE,
      },
    });
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "profile",
      entityId: ngoId,
      action: "NGO_APPROVED",
      metadata: {},
    });



    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/ngos/:id/reject → ngo_status: REJECTED, audit log NGO_REJECTED
export const rejectNgo = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    const ngoId = req.params.id as string;
    if (!adminId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const ngo = await prisma.profile.findUnique({ where: { id: ngoId } });
    if (!ngo) {
      return res.status(404).json({ error: "NGO not found" });
    }
    if (ngo.role !== UserRole.CHARITY) {
      return res.status(400).json({ error: "Profile is not an NGO" });
    }
    const updated = await prisma.profile.update({
      where: { id: ngoId },
      data: {
        ngoStatus: NgoStatus.REJECTED,
      },
    });
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "profile",
      entityId: ngoId,
      action: "NGO_REJECTED",
      metadata: {},
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/campaigns/pending — PENDING_APPROVAL queue
export const getPendingCampaigns = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { status: CampaignStatus.PENDING_APPROVAL },
      include: {
        ngo: { select: { id: true, organisationName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(campaigns.map(adminCampaignResponse));
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/campaigns/:id/approve → status: ACTIVE, approved_by, approved_at
export const approveCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    const campaignId = req.params.id as string;
    if (!adminId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (campaign.status === CampaignStatus.COMPLETED || campaign.approvedAt) {
      return res.status(409).json({ error: "Campaign is no longer eligible for approval" });
    }
    const transition = await prisma.campaign.updateMany({
      where: { id: campaignId, status: campaign.status, approvedAt: null },
      data: {
        status: CampaignStatus.ACTIVE,
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });
    if (transition.count !== 1) {
      return res.status(409).json({ error: "Campaign changed concurrently; reload and retry" });
    }
    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "campaign",
      entityId: campaignId,
      action: "CAMPAIGN_APPROVED",
      metadata: {},
    });
    res.json(adminCampaignResponse(updated));
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/campaigns/:id/close → status: COMPLETED
export const closeCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    const campaignId = req.params.id as string;
    if (!adminId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (campaign.status === CampaignStatus.COMPLETED) {
      return res.json(adminCampaignResponse(campaign));
    }
    const transition = await prisma.campaign.updateMany({
      where: { id: campaignId, status: campaign.status },
      data: { status: CampaignStatus.COMPLETED },
    });
    if (transition.count !== 1) {
      const current = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (current?.status === CampaignStatus.COMPLETED) {
        return res.json(adminCampaignResponse(current));
      }
      return res.status(409).json({ error: "Campaign changed concurrently; reload and retry" });
    }
    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "campaign",
      entityId: campaignId,
      action: "CAMPAIGN_CLOSED",
      metadata: {},
    });
    res.json(adminCampaignResponse(updated));
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/campaigns/:id/overfunding
export const updateCampaignOverfundingPolicy = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    const campaignId = req.params.id as string;
    const { allowOverfunding } = req.body ?? {};
    if (!adminId) return res.status(401).json({ error: "User not authenticated" });
    if (typeof allowOverfunding !== "boolean") {
      return res.status(400).json({ error: "allowOverfunding must be a boolean" });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Acquire campaign row lock first (preserves Campaign Row Lock -> Provenance Chain Lock order)
      await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${campaignId} FOR UPDATE`;
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) {
        return { status: 404, body: { error: "Campaign not found" }, noOp: true };
      }

      // 2. No-op gate: do not mutate, audit, or create provenance events on no-op
      if (campaign.allowOverfunding === allowOverfunding) {
        return {
          status: 200,
          body: adminCampaignResponse(campaign),
          noOp: true,
        };
      }

      const previousValue = campaign.allowOverfunding;
      const newValue = allowOverfunding;
      const occurredAt = new Date();

      // 3. Update campaign setting
      const updatedCampaign = await tx.campaign.update({
        where: { id: campaignId },
        data: { allowOverfunding: newValue },
      });

      // 4. Transactional audit log creation
      const auditMetadata = {
        field: "allowOverfunding",
        previousValue,
        newValue,
        allowOverfunding: newValue,
        occurredAt: occurredAt.toISOString(),
      };
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.USER,
          actorId: adminId,
          entityType: "campaign",
          entityId: campaignId,
          action: "CAMPAIGN_OVERFUNDING_POLICY_UPDATED",
          metadata: auditMetadata,
          ipAddress: req.ip ?? null,
        },
      });

      // 5. Append provenance event inside transaction
      // Constraint 4: ngoId remains campaign.ngoId (does not create misleading admin/NGO identity mapping).
      // Constraint 5: Deterministic entityType represents the policy transition; entityId and campaignId both refer to the campaign.
      const deterministicEntityType = `CampaignPolicy:allowOverfunding:${String(previousValue)}->${String(newValue)}`;
      const transitionKey = `policy:allowOverfunding:${String(previousValue)}->${String(newValue)}:${occurredAt.toISOString()}`;

      await appendProvenanceEvent(
        tx,
        {
          eventType: ProvenanceEventType.CAMPAIGN_POLICY_UPDATED,
          entityType: deterministicEntityType,
          entityId: campaignId,
          amountInr: "0.00",
          ngoId: campaign.ngoId,
          campaignId: campaignId,
          occurredAt,
        },
        transitionKey,
      );

      return {
        status: 200,
        body: adminCampaignResponse(updatedCampaign),
        noOp: false,
        auditEvent: {
          action: "CAMPAIGN_OVERFUNDING_POLICY_UPDATED",
          actorType: AuditActorType.USER,
          actorId: adminId,
          entityType: "campaign",
          entityId: campaignId,
          ipAddress: req.ip ?? null,
          metadata: auditMetadata,
        },
      };
    });

    // 6. Post-commit best-effort SIEM forwarding (Constraint 7)
    if (result.status === 200 && !result.noOp && result.auditEvent) {
      try {
        logger.info("Security Event", {
          eventType: result.auditEvent.action,
          actorType: result.auditEvent.actorType,
          actorId: result.auditEvent.actorId ?? null,
          entityType: result.auditEvent.entityType,
          entityId: result.auditEvent.entityId ?? null,
          ip: result.auditEvent.ipAddress ?? "",
          metadata: result.auditEvent.metadata ?? {},
        });
      } catch (siemErr) {
        logger.warn("[SIEM] Post-commit SIEM delivery failed", { err: siemErr });
      }
    }

    return res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users — paginated user list with role + kyc_status filters
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role, kycStatus, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit as string, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = {};
    if (role) {
      whereClause.role = role as UserRole;
    }
    if (kycStatus) {
      whereClause.kycStatus = kycStatus as KycStatus;
    }

    const [users, totalCount] = await prisma.$transaction([
      prisma.profile.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isVerified: true,
          ngoStatus: true,
          kycStatus: true,
          panHash: true,
          registrationNo: true,
          organisationName: true,
          solWalletAddress: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.profile.count({ where: whereClause }),
    ]);

    res.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/aml-flags — donations flagged in audit_logs (AML)
export const getAmlFlags = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit as string, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;

    const [auditLogsResult, totalCount] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where: { action: "AML_FLAG_RAISED" },
        include: {
          actor: { select: { id: true, fullName: true } },
          govRequest: { select: { id: true, requestRef: true } },
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where: { action: "AML_FLAG_RAISED" } }),
    ]);

    // Convert BigInt id to string for JSON serialization
    const auditLogs = auditLogsResult.map((log) => ({
      ...log,
      id: log.id.toString(),
    }));

    res.json({
      auditLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/audit-logs — full paginated audit log with action + user filters
export const getAuditLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { action, userId, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit as string, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = {};
    if (action) {
      whereClause.action = action as string;
    }
    if (userId) {
      whereClause.actorId = userId as string;
    }

    const [auditLogsResult, totalCount] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          actor: { select: { id: true, fullName: true } },
          govRequest: { select: { id: true, requestRef: true } },
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where: whereClause }),
    ]);

    // Convert BigInt id to string for JSON serialization
    const auditLogs = auditLogsResult.map((log) => ({
      ...log,
      id: log.id.toString(),
    }));

    res.json({
      auditLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /government-requests
// ---------------------------------------------------------------------------
export const createGovernmentRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    if (!adminId)
      return res.status(401).json({ error: "User not authenticated" });

    const {
      requestRef,
      requestingBody,
      legalBasis,
      scope,
      targetUserId,
      targetDonationId,
    } = req.body;

    // Create government request
    const govRequest = await prisma.governmentRequest.create({
      data: {
        requestRef,
        requestingBody,
        legalBasis,
        scope: scope || {},
        targetUserId: targetUserId || null,
        targetDonationId: targetDonationId || null,
        createdBy: adminId,
        status: GovernmentRequestStatus.OPEN,
      },
    });

    // Write audit log
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "government_request",
      entityId: govRequest.id,
      action: "GOVERNMENT_REQUEST_CREATED",
      metadata: { requestingBody, legalBasis, targetUserId, targetDonationId },
    });

    res.status(201).json(govRequest);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /government-requests/:id/hold
// ---------------------------------------------------------------------------
export const holdGovernmentRequestDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    if (!adminId)
      return res.status(401).json({ error: "User not authenticated" });

    const requestId = req.params.id as string;
    const { documentIds } = req.body;

    // Validate documentIds
    if (
      !documentIds ||
      !Array.isArray(documentIds) ||
      documentIds.length === 0
    ) {
      return res.status(400).json({ error: "documentIds array is required" });
    }

    // Filter out null/undefined/invalid IDs
    const validDocumentIds = documentIds
      .filter(
        (id): id is string =>
          id != null && typeof id === "string" && id.trim() !== "",
      )
      .map((id) => id.trim());

    if (validDocumentIds.length === 0) {
      return res.status(400).json({ error: "No valid document IDs provided" });
    }

    // Verify government request exists and is open
    const govRequest = await prisma.governmentRequest.findUnique({
      where: { id: requestId },
    });

    if (!govRequest) {
      return res.status(404).json({ error: "Government request not found" });
    }

    if (govRequest.status !== GovernmentRequestStatus.OPEN) {
      return res.status(400).json({ error: "Government request is not OPEN" });
    }

    // Build WHERE conditions for document update
    const whereConditions: any = {
      id: { in: validDocumentIds },
    };

    // Add ownership/relationship conditions if targetUserId is provided
    if (govRequest.targetUserId) {
      whereConditions.OR = [
        { ownerId: govRequest.targetUserId },
        { disbursement: { ngoId: govRequest.targetUserId } },
        { campaign: { ngoId: govRequest.targetUserId } },
      ];
    }

    // Place legal hold on specified documents
    const updatedDocs = await prisma.document.updateMany({
      where: whereConditions,
      data: {
        legalHold: true,
        status: "LEGAL_HOLD" as const,
      },
    });

    // Update government request status
    await prisma.governmentRequest.update({
      where: { id: requestId },
      data: {
        processedByAdminId: adminId,
      },
    });

    // Write audit log
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "government_request",
      entityId: requestId,
      action: "GOVERNMENT_REQUEST_DOCUMENTS_HELD",
      metadata: { documentIds: validDocumentIds, count: updatedDocs.count },
    });

    res.json({
      message: `Legal hold placed on ${updatedDocs.count} documents`,
      governmentRequestId: requestId,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /government-requests/:id/export
// ---------------------------------------------------------------------------
export const exportGovernmentRequestDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    if (!adminId)
      return res.status(401).json({ error: "User not authenticated" });

    const requestId = req.params.id as string;

    // Verify government request exists
    const govRequest = await prisma.governmentRequest.findUnique({
      where: { id: requestId },
    });

    if (!govRequest) {
      return res.status(404).json({ error: "Government request not found" });
    }

    // Build WHERE conditions for document search
    const whereConditionsExport: any = {
      legalHold: true,
    };

    // Add ownership/relationship conditions if targetUserId is provided
    if (govRequest.targetUserId) {
      whereConditionsExport.OR = [
        { ownerId: govRequest.targetUserId },
        { disbursement: { ngoId: govRequest.targetUserId } },
        { campaign: { ngoId: govRequest.targetUserId } },
      ];
    }

    // Get documents under legal hold for this request
    const heldDocuments = await prisma.document.findMany({
      where: whereConditionsExport,
      select: {
        id: true,
        documentType: true,
        originalFilename: true,
        sha512Hash: true,
        ipfsCid: true,
        storagePath: true,
        legalHold: true,
      },
    });

    // In a real implementation, this would generate a secure export package
    // For now, we'll return metadata about the documents to be exported
    const exportData = {
      governmentRequestId: requestId,
      requestedBy: govRequest.requestingBody,
      legalBasis: govRequest.legalBasis,
      filedAt: govRequest.filedAt,
      exportedAt: new Date(),
      documentCount: heldDocuments.length,
      documents: heldDocuments.map((doc) => ({
        id: doc.id,
        type: doc.documentType,
        filename: doc.originalFilename,
        hash: doc.sha512Hash,
        ipfsCid: doc.ipfsCid,
        legalHold: doc.legalHold,
      })),
    };

    // Write audit log
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "government_request",
      entityId: requestId,
      action: "GOVERNMENT_REQUEST_DOCUMENTS_EXPORTED",
      metadata: { documentCount: heldDocuments.length },
    });

    res.json(exportData);
  } catch (err) {
    next(err);
  }
};

// Attesatation

// GET /attestations/pending - NGO-signed attestations awaiting admin review
export const getPendingAttestationsAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const attestations = await prisma.attestation.findMany({
      where: {
        status: AttestationStatus.NGO_SIGNED,
        type: "DELIVERY",
      },
      include: {
        donation: {
          select: {
            id: true,
            publicId: true,
            amount: true,
            ngoId: true,
            donorId: true,
            campaignId: true,
            project: { select: { title: true } },
            ngo: { select: { organisationName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const mapped = attestations.map((att) => ({
      ...att,
      amount: att.allocatedAmount || (att.donation as any)?.amount,
      ngoName:
        (att.donation as any)?.ngo?.organisationName || att.donation?.ngoId,
      campaignTitle:
        (att.donation as any)?.project?.title ||
        `Campaign ${(att.donation as any)?.campaignId?.substring(0, 8)}`,
    }));

    res.json(mapped);
  } catch (err) {
    next(err);
  }
};

export const approveAttestation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    // const { attestationId } = req.params;
    const attestationId = req.params.attestationId as string;
    if (!adminId)
      return res.status(401).json({ error: "User not authenticated" });

    const attestation = await prisma.attestation.findUnique({
      where: { id: attestationId },
    });
    if (!attestation)
      return res.status(404).json({ error: "Attestation not found" });
    if (attestation.status !== AttestationStatus.NGO_SIGNED) {
      return res.status(409).json({
        error: `Cannot approve attestation in status ${attestation.status}`,
      });
    }

    const updated = await prisma.attestation.update({
      where: { id: attestationId },
      data: {
        status: AttestationStatus.APPROVED,
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorType: AuditActorType.ADMIN,
      actorId: adminId,
      entityType: "attestation",
      entityId: attestationId,
      action: "ATTESTATION_APPROVED",
      metadata: {},
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const rejectAttestation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    // const { attestationId } = req.params;
    const attestationId = req.params.attestationId as string;
    const { reason } = req.body;
    if (!adminId)
      return res.status(401).json({ error: "User not authenticated" });
    if (!reason) return res.status(400).json({ error: "reason is required" });

    const attestation = await prisma.attestation.findUnique({
      where: { id: attestationId },
    });
    if (!attestation)
      return res.status(404).json({ error: "Attestation not found" });
    if (attestation.status === AttestationStatus.APPROVED) {
      return res
        .status(409)
        .json({ error: "Cannot reject an already-approved attestation" });
    }

    const updated = await prisma.attestation.update({
      where: { id: attestationId },
      data: { status: AttestationStatus.REJECTED, rejectionReason: reason },
    });

    await writeAuditLog({
      actorType: AuditActorType.ADMIN,
      actorId: adminId,
      entityType: "attestation",
      entityId: attestationId,
      action: "ATTESTATION_REJECTED",
      metadata: { reason },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// GET /disbursements/pending - disbursements with proof submitted, awaiting approval
export const getPendingDisbursements = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const milestones = await prisma.disbursement.findMany({
      where: {
        status: DisbursementStatus.PENDING,
        proofSubmittedAt: { not: null },
      },
      include: {
        campaign: { select: { id: true, title: true } },
        ngo: { select: { id: true, organisationName: true } },
        cohort: { select: { id: true, name: true } },
      },
      orderBy: { proofSubmittedAt: "asc" },
    });
    res.json(milestones);
  } catch (err) {
    next(err);
  }
};
// TODO: RAZORPAY PAYOUTS
// This function is a manual override meant to be used by the Admin Panel to mark an APPROVED disbursement
// as SENT/SETTLED before the Razorpay Payouts system is actually implemented.
// Once Razorpay Payouts are implemented, the webhook handler from Razorpay should handle this transition,
// and this manual override button/route should be deleted.
export const markDisbursementSettled = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    const disbursementId = req.params.id as string;

    if (!adminId)
      return res.status(401).json({ error: "User not authenticated" });

    const disbursement = await prisma.disbursement.findUnique({
      where: { id: disbursementId },
    });
    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }

    if (disbursement.status !== DisbursementStatus.APPROVED) {
      return res.status(400).json({ error: "Disbursement is not APPROVED" });
    }

    const transferConfirmedAt = new Date();
    const settlementDueAt = new Date(transferConfirmedAt.getTime() + 5_000);
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.disbursement.updateMany({
        where: { id: disbursementId, status: DisbursementStatus.APPROVED },
        data: {
          status: DisbursementStatus.SENT,
          settlementDueAt,
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Disbursement transfer confirmation changed concurrently");
      }
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.USER,
          actorId: adminId,
          entityType: "disbursement",
          entityId: disbursement.id,
          action: "DISBURSEMENT_TRANSFER_CONFIRMED_MANUAL",
          metadata: {
            note: "Admin recorded manual transfer confirmation before payout provider integration.",
            transferConfirmedAt: transferConfirmedAt.toISOString(),
            settlementDueAt: settlementDueAt.toISOString(),
          },
        },
      });
      return tx.disbursement.findUniqueOrThrow({ where: { id: disbursementId } });
    });

    return res.status(200).json({
      message: "Manual transfer confirmation recorded; settlement will complete after the delay",
      disbursement: updated,
    });
  } catch (error) {
    console.error("Error settling disbursement:", error);
    next(error);
  }
};

// POST /milestones/:id/reject
export const rejectDisbursement = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminId = req.user?.id;
    const disbursementId = req.params.id as string;
    const { reason } = req.body;
    if (!adminId)
      return res.status(401).json({ error: "User not authenticated" });
    if (!reason) return res.status(400).json({ error: "reason is required" });

    const disbursement = await prisma.disbursement.findUnique({
      where: { id: disbursementId },
    });
    if (!disbursement)
      return res.status(404).json({ error: "Disbursement not found" });
    if (disbursement.status !== DisbursementStatus.PENDING) {
      return res.status(400).json({ error: "Disbursement is not PENDING" });
    }

    const updated = await prisma.disbursement.update({
      where: { id: disbursementId },
      data: { status: DisbursementStatus.REJECTED, rejectionReason: reason },
    });

    await writeAuditLog({
      actorType: AuditActorType.ADMIN,
      actorId: adminId,
      entityType: "disbursement",
      entityId: disbursementId,
      action: "DISBURSEMENT_REJECTED",
      metadata: { reason },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// GET /disbursements/:id/proof-url - generate a short-lived signed URL for the proof file
// Reason: fieldReportUrl stored in the DB is a raw S3 storage path (e.g.
// "milestone_proofs/id/timestamp_file.png"), not a viewable URL. Opening it directly
// in a browser shows a blank page or XML error. This endpoint generates a proper
// 15-minute pre-signed URL that the admin can open to preview the proof image/PDF.
export const getDisbursementProofUrl = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const disbursementId = req.params.id as string;

    const disbursement = await prisma.disbursement.findUnique({
      where: { id: disbursementId },
    });

    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }

    if (!disbursement.fieldReportUrl) {
      return res
        .status(404)
        .json({ error: "No proof file uploaded for this disbursement" });
    }

    const documents = await prisma.document.findMany({
      where: { disbursementId },
    });

    const urls: { name: string; url: string }[] = [];

    if (documents.length > 0) {
      for (const doc of documents) {
        const signedUrl = await new StorageService(doc.storageBucket).getSignedUrl(doc.storagePath, 900);
        // Extract filename from storagePath (e.g. milestone_proofs/id/12345_filename.pdf -> filename.pdf)
        const parts = doc.storagePath.split('_');
        const name = parts.length > 1 ? parts.slice(1).join('_') : doc.storagePath;
        urls.push({ name, url: signedUrl });
      }
    } else if (disbursement.fieldReportUrl) {
      // Fallback for older data where document might not exist but fieldReportUrl is a storage path
      // Wait, if it's a hash, this will fail. Let's just try to sign it.
      const signedUrl = await new StorageService(
        process.env.TRACEIT_PROOF_BUCKET?.trim() || "test-bucket",
      ).getSignedUrl(disbursement.fieldReportUrl, 900);
      urls.push({ name: "Proof Document", url: signedUrl });
    }

    if (urls.length === 0) {
      return res.status(404).json({ error: "No proof files found for this disbursement" });
    }

    return res.json({ urls });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Router — all route registrations grouped together, by resource
// ---------------------------------------------------------------------------

// NGOs
adminRouter.get("/refunds/reconciliation", requireAuth, requireRole(UserRole.ADMIN), listRefundReconciliation);
adminRouter.get("/refunds/reconciliation/:id", requireAuth, requireRole(UserRole.ADMIN), inspectRefundReconciliation);
adminRouter.post("/refunds/reconciliation/:id/resolve", requireAuth, requireRole(UserRole.ADMIN), resolveRefundReconciliation);
adminRouter.get("/ngos", requireAuth, requireRole(UserRole.ADMIN), getNgos);
adminRouter.post(
  "/ngos/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN),
  approveNgo,
);
adminRouter.post(
  "/ngos/:id/reject",
  requireAuth,
  requireRole(UserRole.ADMIN),
  rejectNgo,
);

// Campaigns
adminRouter.get(
  "/campaigns/pending",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getPendingCampaigns,
);
adminRouter.post(
  "/campaigns/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN),
  approveCampaign,
);
adminRouter.post(
  "/campaigns/:id/close",
  requireAuth,
  requireRole(UserRole.ADMIN),
  closeCampaign,
);
adminRouter.patch(
  "/campaigns/:id/overfunding",
  requireAuth,
  requireRole(UserRole.ADMIN),
  updateCampaignOverfundingPolicy,
);

// Users
adminRouter.get("/users", requireAuth, requireRole(UserRole.ADMIN), getUsers);

// AML / Audit
adminRouter.get(
  "/aml-flags",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getAmlFlags,
);
adminRouter.get(
  "/audit-logs",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getAuditLogs,
);

// Government Request Endpoints
adminRouter.post(
  "/government-requests",
  requireAuth,
  requireRole(UserRole.ADMIN),
  createGovernmentRequest,
);
adminRouter.post(
  "/government-requests/:id/hold",
  requireAuth,
  requireRole(UserRole.ADMIN),
  holdGovernmentRequestDocuments,
);
adminRouter.post(
  "/government-requests/:id/export",
  requireAuth,
  requireRole(UserRole.ADMIN),
  exportGovernmentRequestDocuments,
);

// Attestations
adminRouter.get(
  "/attestations/pending",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getPendingAttestationsAdmin,
);
adminRouter.post(
  "/attestations/:attestationId/approve",
  requireAuth,
  requireRole(UserRole.ADMIN),
  approveAttestation,
);
adminRouter.post(
  "/attestations/:attestationId/reject",
  requireAuth,
  requireRole(UserRole.ADMIN),
  rejectAttestation,
);

// Disbursements
adminRouter.get(
  "/disbursements",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getAllDisbursements,
);

adminRouter.get(
  "/disbursements/pending",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getPendingDisbursements,
);

adminRouter.get(
  "/disbursements/:id",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getDisbursementById,
);

adminRouter.post(
  "/disburse/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN),
  approveDisbursement,
);
adminRouter.post(
  "/disbursements/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN),
  approveDisbursement,
); // reused, per handoff notes' "could be merged" suggestion
adminRouter.post(
  "/disbursements/:id/reject",
  requireAuth,
  requireRole(UserRole.ADMIN),
  rejectDisbursement,
);

adminRouter.post(
  "/disbursements/:id/mark-settled",
  requireAuth,
  requireRole(UserRole.ADMIN),
  markDisbursementSettled,
);

// Route to fetch a short-lived signed URL for viewing the proof file uploaded by the NGO.
// Needed because fieldReportUrl is a raw storage path, not a publicly accessible URL.
adminRouter.get(
  "/disbursements/:id/proof-url",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getDisbursementProofUrl,
);

adminRouter.get(
  "/bank-transfers/pending",
  requireAuth,
  requireRole(UserRole.ADMIN),
  listPendingBankTransfers,
);
adminRouter.get(
  "/bank-transfers/:id/evidence/:documentId",
  requireAuth,
  requireRole(UserRole.ADMIN),
  downloadAdminBankTransferEvidence,
);
adminRouter.post(
  "/bank-transfers/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN),
  approveBankTransfer,
);
adminRouter.post(
  "/bank-transfers/:id/reject",
  requireAuth,
  requireRole(UserRole.ADMIN),
  rejectBankTransfer,
);

export default adminRouter;
