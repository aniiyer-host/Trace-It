import { Request, Response, NextFunction, Router } from "express";
import { prisma } from "../db/prisma.js";
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
} from "../../generated/prisma/enums.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { allocateDonation } from "../services/statusService.js";
import { getBlockchainService } from "../services/blockchainInstance.js";

const adminRouter = Router();

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
    });
    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }

    if (disbursement.status !== DisbursementStatus.PENDING) {
      return res.status(400).json({ error: "Disbursement is not PENDING" });
    }

    // Update disbursement
    const updated = await prisma.disbursement.update({
      where: { id: disbursementId },
      data: {
        status: DisbursementStatus.APPROVED,
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });

    // BLOCKCHAIN INTEGRATION: Update donation status to ALLOCATED on-chain (non-blocking)
// We don't await this to avoid slowing down the disbursement approval process
// Only run in non-test environments to avoid initialization errors during testing
	if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
	  const updateDonationStatusOnChain = async () => {
	    try {
	      const blockchainService = await getBlockchainService();

	      // Find associated donations for this disbursement
	      const donations = await prisma.donation.findMany({
	        where: {
	          campaignId: disbursement.campaignId,
	          status: "SUCCESS",
	        },
	        include: {
	          ngo: true
	        }
	      });

	      // Update each donation in the campaign to ALLOCATED status
	      for (const donation of donations) {
	        if (donation.solanaTxHash) { // Only update if already recorded on-chain
	          const result = await blockchainService.updateDonationStatus(
	            donation.id,
	            2 // ALLOCATED status
	          );

	          if (result.success) {
	            await writeAuditLog({
	              actorType: AuditActorType.USER,
	              actorId: adminId,
	              entityType: "donation",
	              entityId: donation.id,
	              action: "BLOCKCHAIN_STATUS_UPDATE",
	              metadata: {
	                donationId: donation.id,
	                transactionHash: result.txHash,
	                newStatus: "ALLOCATED"
	              },
	            });
	          } else {
	            console.error(`Failed to update donation ${donation.id} status on-chain: ${result.error}`);

	            // Add to retry queue for status updates
	            await addToBlockchainRetryQueue({
	              donationId: donation.id,
	              error: result.error ?? 'Unknown blockchain error',
	              retryCount: 0,
	              type: 'STATUS_UPDATE',
	              targetStatus: 2
	            });
	          }
	        } else {
	          console.warn(`Donation ${donation.id} not yet recorded on-chain, skipping status update`);
	        }
	      }
	    } catch (error) {
	      console.error('Error in blockchain status update integration:', error);
	      // Don't fail the disbursement approval if blockchain integration fails
	    }
	  };
	}


// Allocate donations up to the disbursed amount
// First, find all SUCCESS donations for this campaign
const donationAllocations = await prisma.donation.findMany({
  where: {
    campaignId: disbursement.campaignId,
    status: "SUCCESS",
  },
  orderBy: { createdAt: "asc" },
});

let remainingToAllocate = Number(disbursement.amountInr);

for (const donation of donationAllocations) {
  if (remainingToAllocate <= 0) break;

  const donationAmount = Number(donation.amount);

  // Call allocateDonation for each applicable donation
  if (disbursement.cohortId) {
    await allocateDonation(donation.id, disbursement.cohortId);
  }

  // Deduct the donation amount from what's remaining to allocate
  remainingToAllocate -= donationAmount;
}

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

res.json(updated);
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

    res.json(disbursements);
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

    res.json(disbursement);
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
    res.json(campaigns);
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
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.ACTIVE,
        approvedBy: adminId,
        approvedAt: new Date(),
      },
    });
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: adminId,
      entityType: "campaign",
      entityId: campaignId,
      action: "CAMPAIGN_APPROVED",
      metadata: {},
    });
    res.json(updated);
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
    const auditLogs = auditLogsResult.map(log => ({
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
    const auditLogs = auditLogsResult.map(log => ({
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
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: "documentIds array is required" });
    }

    // Filter out null/undefined/invalid IDs
    const validDocumentIds = documentIds
      .filter((id): id is string => id != null && typeof id === "string" && id.trim() !== "")
      .map(id => id.trim());

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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
adminRouter.post(
  "/disburse/:id/approve",
  requireAuth,
  requireRole(UserRole.ADMIN),
  approveDisbursement,
);
adminRouter.get(
  "/disbursements",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getAllDisbursements,
);
adminRouter.get(
  "/disbursements/:id",
  requireAuth,
  requireRole(UserRole.ADMIN),
  getDisbursementById,
);

// Admin Panel Routes
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
adminRouter.get("/users", requireAuth, requireRole(UserRole.ADMIN), getUsers);
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

// Helper function for retry queue
async function addToBlockchainRetryQueue(data: {
  donationId: string;
  error: string;
  retryCount: number;
  type?: string;
  targetStatus?: number;
}): Promise<void> {
  try {
    // Create or update retry queue entry
    await prisma.blockchainRetryQueue.upsert({
      where: { donationId: data.donationId },
      update: {
        error: data.error,
        retryCount: data.retryCount + 1,
        lastAttempt: new Date(),
        updatedAt: new Date()
      },
      create: {
        donationId: data.donationId,
        error: data.error,
        retryCount: data.retryCount + 1,
        lastAttempt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log(`Added donation ${data.donationId} to blockchain retry queue (attempt ${data.retryCount + 1})`);
  } catch (queueError) {
    console.error(`Failed to add to retry queue:`, queueError);
    // Don't fail the operation if queue fails
  }
}

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

export default adminRouter;
