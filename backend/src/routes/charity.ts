import { Request, Response, NextFunction, Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { uploadSingle } from "../middleware/multerMiddleware.js";
import { Prisma } from "../../generated/prisma/client.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  UserRole,
  NgoStatus,
  DocumentType,
  CampaignStatus,
  DisbursementStatus,
  AuditActorType,
} from "../../generated/prisma/enums.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { getBlockchainService } from "../services/blockchainInstance.js";
import { addToBlockchainRetryQueue } from "../services/blockchainRetryQueue.js";
import { allocateDonation } from "../services/statusService.js";
import {
  AttestationType,
  AttestationStatus,
} from "../../generated/prisma/enums.js";
const charityRouter = Router();

// Helper function to handle blockchain operations (fire and forget)
const handleBlockchainOperation = async (
  operationFn: () => Promise<any>,
  operationName: string,
  entityType: string,
  entityId: string,
  adminId: string,
) => {
  // Only run in non-test environments to avoid initialization errors during testing
  if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID) {
    return;
  }

  try {
    const blockchainService = await getBlockchainService();
    const result = await operationFn();

    if (result.success) {
      await writeAuditLog({
        actorType: AuditActorType.USER,
        actorId: adminId,
        entityType,
        entityId,
        action: `BLOCKCHAIN_${operationName.toUpperCase()}_SUCCESS`,
        metadata: {
          entityId,
          transactionHash: result.txHash,
        },
      });
      console.info(`Blockchain ${operationName} successful: ${result.txHash}`);
    } else {
      console.error(`Failed to ${operationName} on-chain: ${result.error}`);

      await addToBlockchainRetryQueue({
        donationId: entityId,
        error: result.error ?? "Unknown blockchain error",
        retryCount: 0,
      });

      await writeAuditLog({
        actorType: AuditActorType.USER,
        actorId: adminId,
        entityType,
        entityId,
        action: `BLOCKCHAIN_${operationName.toUpperCase()}_FAILED`,
        metadata: {
          entityId,
          error: result.error,
        },
      });
    }
  } catch (error) {
    console.error(`Error in blockchain ${operationName} integration:`, error);
  }
};

// POST /onboard - update NGO profile details
export const onboardNgo = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const {
      organisationName,
      registrationNo,
      description,
      fcraNumber,
      taxExemptionNo80g,
    } = req.body;

    const profile = await prisma.profile.findUnique({ where: { id: userId } });
    // const updatedProfile = await prisma.profile.update({
    //   where: { id: userId },
    //   data: {
    //     organisationName: organisationName || undefined,
    //     registrationNo: registrationNo || undefined,
    //     ngoStatus:
    //       profile?.ngoStatus === NgoStatus.ACTIVE
    //         ? NgoStatus.ACTIVE
    //         : NgoStatus.PENDING,
    //   },
    // });

    const updatedProfile = await prisma.profile.update({
      where: { id: userId },
      data: {
        organisationName: organisationName || undefined,
        registrationNo: registrationNo || undefined,
        role: UserRole.CHARITY,
        ngoStatus:
          profile?.ngoStatus === NgoStatus.ACTIVE
            ? NgoStatus.ACTIVE
            : NgoStatus.PENDING,
      },
    });

    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: userId,
      entityType: "profile",
      entityId: userId,
      action: "NGO_ONBOARDED",
      metadata: { organisationName, registrationNo },
    });

    res.json(updatedProfile);
  } catch (err) {
    next(err);
  }
};

// POST /documents/upload - upload a document
export const uploadDocument = [
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "User not authenticated" });

      const multerReq = req as any;
      if (!multerReq.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { documentType, campaignId } = req.body;
      const docType = documentType || DocumentType.NGO_CERT;

      const storageBucket = "test-bucket";
      const storagePath = `documents/${userId}/${Date.now()}_${multerReq.file.originalname}`;
      const sha512Hash = `hash_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

      const document = await prisma.document.create({
        data: {
          ownerId: userId,
          campaignId: campaignId || null,
          documentType: docType,
          sha512Hash,
          storageBucket,
          storagePath,
        },
      });

      await writeAuditLog({
        actorType: AuditActorType.USER,
        actorId: userId,
        entityType: "document",
        entityId: document.id,
        action: "DOCUMENT_UPLOADED",
        metadata: {
          documentType: docType,
          sha512HashSnippet: sha512Hash.substring(0, 8),
        },
      });

      res.status(201).json({
        documentId: document.id,
        ...document,
      });
    } catch (err) {
      next(err);
    }
  },
];

// GET /documents - list documents
export const getDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const documents = await prisma.document.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(documents);
  } catch (err) {
    next(err);
  }
};

// POST /campaigns - create campaign
export const createCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile || profile.ngoStatus !== NgoStatus.ACTIVE) {
      return res
        .status(403)
        .json({ error: "NGO must be ACTIVE to create campaigns" });
    }

    const {
      title,
      description,
      targetAmount,
      currencyCode,
      category,
      coverImageUrl,
      sdgTags,
    } = req.body;

    if (!title || !description || targetAmount === undefined) {
      return res
        .status(400)
        .json({ error: "Title, description, and targetAmount are required" });
    }

    const campaign = await prisma.campaign.create({
      data: {
        ngoId: userId,
        title,
        description,
        targetAmount: new Prisma.Decimal(targetAmount.toString()),
        currencyCode: currencyCode || "INR",
        category,
        coverImageUrl,
        sdgTags: sdgTags || [],
        status: CampaignStatus.DRAFT,
      },
    });

    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: userId,
      entityType: "campaign",
      entityId: campaign.id,
      action: "CAMPAIGN_CREATED",
      metadata: { title, targetAmount: Number(targetAmount) },
    });

    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
};

// GET /campaigns - get NGO campaigns
export const getCampaigns = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const campaigns = await prisma.campaign.findMany({
      where: { ngoId: userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(campaigns);
  } catch (err) {
    next(err);
  }
};

// POST /campaigns/:id/submit - submit campaign for review
export const submitCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const campaignId = req.params.id as string;
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, ngoId: userId },
    });

    if (!campaign) {
      return res
        .status(404)
        .json({ error: "Campaign not found or access denied" });
    }

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.PENDING_APPROVAL },
    });

    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: userId,
      entityType: "campaign",
      entityId: campaignId,
      action: "CAMPAIGN_SUBMITTED",
      metadata: { title: campaign.title },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// POST /cohorts - create cohort
export const createCohort = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile || profile.ngoStatus !== NgoStatus.ACTIVE) {
      return res
        .status(403)
        .json({ error: "NGO must be ACTIVE to create cohorts" });
    }

    const { name, beneficiaryCount, campaignId } = req.body;
    if (!name || !campaignId) {
      return res
        .status(400)
        .json({ error: "Cohort name and campaignId are required" });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, ngoId: userId },
    });

    if (!campaign) {
      return res
        .status(404)
        .json({ error: "Campaign not found or access denied" });
    }

    const cohort = await prisma.beneficiaryCohort.create({
      data: {
        ngoId: userId,
        campaignId,
        name,
        beneficiaryCount: beneficiaryCount || 0,
      },
    });

    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: userId,
      entityType: "cohort",
      entityId: cohort.id,
      action: "COHORT_CREATED",
      metadata: { name, campaignId },
    });

    res.status(201).json(cohort);
  } catch (err) {
    next(err);
  }
};

// POST /cohorts/:id/proof - upload proof for cohort
export const uploadCohortProof = [
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "User not authenticated" });

      const cohortId = req.params.id as string;

      const profile = await prisma.profile.findUnique({
        where: { id: userId },
      });
      if (!profile || profile.ngoStatus !== NgoStatus.ACTIVE) {
        return res
          .status(403)
          .json({ error: "NGO must be ACTIVE to upload cohort proof" });
      }

      const cohort = await prisma.beneficiaryCohort.findFirst({
        where: { id: cohortId, ngoId: userId },
      });

      if (!cohort) {
        return res
          .status(404)
          .json({ error: "Cohort not found or access denied" });
      }

      const multerReq = req as any;
      if (!multerReq.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const storageBucket = "test-bucket";
      const storagePath = `cohort_proofs/${cohortId}/${Date.now()}_${multerReq.file.originalname}`;
      const sha512DocHash = `proof_hash_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

      const document = await prisma.document.create({
        data: {
          ownerId: userId,
          campaignId: cohort.campaignId,
          documentType: DocumentType.COHORT_PROOF,
          sha512Hash: sha512DocHash,
          storageBucket,
          storagePath,
        },
      });

      handleBlockchainOperation(
        async () => {
          const blockchainService = await getBlockchainService();
          return await blockchainService.registerCohort({
            cohortId,
            ngoId: userId,
            metadataHash: sha512DocHash,
          });
        },
        "COHORT_REGISTRATION",
        "cohort",
        cohortId,
        userId,
      );

      await writeAuditLog({
        actorType: AuditActorType.USER,
        actorId: userId,
        entityType: "cohort",
        entityId: cohortId,
        action: "COHORT_PROOF_UPLOADED",
        metadata: { documentId: document.id, sha512DocHash },
      });

      res.status(201).json({
        id: document.id,
        sha512DocHash,
        storageBucket,
        storagePath,
      });
    } catch (err) {
      next(err);
    }
  },
];

// POST /disburse - request a disbursement
export const createDisbursement = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile || profile.ngoStatus !== NgoStatus.ACTIVE) {
      return res
        .status(403)
        .json({ error: "NGO must be ACTIVE to request disbursements" });
    }

    const { campaignId, cohortId, amountInr, fieldReportUrl } = req.body;

    let targetCampaignId = campaignId;
    if (!targetCampaignId && cohortId) {
      const cohort = await prisma.beneficiaryCohort.findUnique({
        where: { id: cohortId },
      });
      if (cohort) {
        targetCampaignId = cohort.campaignId;
      }
    }

    if (!targetCampaignId || amountInr === undefined) {
      return res
        .status(400)
        .json({ error: "campaignId and amountInr are required" });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: targetCampaignId, ngoId: userId },
    });

    if (!campaign) {
      return res
        .status(404)
        .json({ error: "Campaign not found or access denied" });
    }

    const disbursement = await prisma.disbursement.create({
      data: {
        campaignId: targetCampaignId,
        ngoId: userId,
        cohortId: cohortId || null,
        amountInr: new Prisma.Decimal(amountInr.toString()),
        fieldReportUrl: fieldReportUrl || null,
        status: DisbursementStatus.PENDING,
      },
    });

    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: userId,
      entityType: "disbursement",
      entityId: disbursement.id,
      action: "DISBURSEMENT_CREATED",
      metadata: { campaignId, amountInr: Number(amountInr) },
    });

    res.status(201).json(disbursement);
  } catch (err) {
    next(err);
  }
};

// GET /disbursements - list disbursements for NGO
export const getDisbursements = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const disbursements = await prisma.disbursement.findMany({
      where: { ngoId: userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(disbursements);
  } catch (err) {
    next(err);
  }
};

// GET /documents/:id/verify - verify document hash
export const verifyDocumentHash = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const documentId = req.params.id as string;
    const { providedHash } = req.query;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.documentType !== DocumentType.COHORT_PROOF) {
      return res
        .status(400)
        .json({ error: "Document is not a cohort proof document" });
    }

    if (!providedHash) {
      return res.json({
        documentId: document.id,
        onChainHash: document.sha512Hash,
        providedHash: null,
        isValid: false,
        verifiedAt: new Date(),
      });
    }

    const isValid = document.sha512Hash === providedHash;

    res.json({
      documentId: document.id,
      onChainHash: document.sha512Hash,
      providedHash,
      isValid,
      verifiedAt: new Date(),
    });
  } catch (err) {
    next(err);
  }
};

// GET /reports/fcra - FCRA report
export const getFcraReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile || profile.ngoStatus !== NgoStatus.ACTIVE) {
      return res
        .status(403)
        .json({ error: "NGO must be ACTIVE to access reports" });
    }

    const fcraReport = {
      ngoId: userId,
      totalDonations: 150000,
      donationsDetails: [
        {
          id: "donation_1",
          donorName: "John Doe",
          amount: 5000,
          date: "2024-01-15",
          publicId: "TI-abc123",
        },
        {
          id: "donation_2",
          donorName: "Jane Smith",
          amount: 10000,
          date: "2024-02-20",
          publicId: "TI-def456",
        },
      ],
      financialYear: "2024-25",
      registrationNumber: profile?.registrationNo || "NOT_AVAILABLE",
      reportGeneratedAt: new Date().toISOString(),
    };

    res.json(fcraReport);
  } catch (err) {
    next(err);
  }
};

// GET /reports/80g - 80G report
export const get80gReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ error: "User not authenticated" });

    const profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile || profile.ngoStatus !== NgoStatus.ACTIVE) {
      return res
        .status(403)
        .json({ error: "NGO must be ACTIVE to access reports" });
    }

    const eightyGReport = {
      ngoId: userId,
      totalDonations: 200000,
      donationsDetails: [
        {
          id: "donation_3",
          donorName: "Robert Johnson",
          amount: 15000,
          date: "2024-03-10",
          publicId: "TI-ghi789",
          receiptNumber: "RCPT-001",
        },
        {
          id: "donation_4",
          donorName: "Emily Davis",
          amount: 25000,
          date: "2024-04-05",
          publicId: "TI-jkl012",
          receiptNumber: "RCPT-002",
        },
      ],
      financialYear: "2024-25",
      registrationNumber: profile?.registrationNo || "NOT_AVAILABLE",
      reportGeneratedAt: new Date().toISOString(),
    };

    res.json(eightyGReport);
  } catch (err) {
    next(err);
  }
};

//Attestation
// GET /attestations/pending - attestations awaiting this NGO's signature
export const getPendingAttestationsForNgo = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const ngoId = req.user?.id;
    if (!ngoId)
      return res.status(401).json({ error: "User not authenticated" });

    const attestations = await prisma.attestation.findMany({
      where: { status: AttestationStatus.PENDING, donation: { ngoId } },
      include: {
        donation: {
          select: { id: true, publicId: true, amount: true, donorId: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(attestations);
  } catch (err) {
    next(err);
  }
};

// POST /attestations - NGO signs off on a receipt/delivery attestation
export const signAttestation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const ngoId = req.user?.id;
    if (!ngoId)
      return res.status(401).json({ error: "User not authenticated" });

    const { donationId } = req.body;
    const rawType = (req.body?.type ?? "").toString().toUpperCase();
    if (!donationId || !["RECEIPT", "DELIVERY"].includes(rawType)) {
      return res
        .status(400)
        .json({ error: "donationId and a valid type are required" });
    }

    // Ownership check: this donation must belong to the calling NGO
    const donation = await prisma.donation.findFirst({
      where: { id: donationId, ngoId },
    });
    if (!donation)
      return res
        .status(404)
        .json({ error: "Donation not found or access denied" });

    const attestation = await prisma.attestation.findFirst({
      where: { donationId, type: rawType as AttestationType },
    });
    if (!attestation)
      return res
        .status(404)
        .json({ error: "No attestation request found for this donation/type" });
    if (attestation.status !== AttestationStatus.PENDING) {
      return res
        .status(409)
        .json({ error: `Attestation is already ${attestation.status}` });
    }

    const updated = await prisma.attestation.update({
      where: { id: attestation.id },
      data: {
        status: AttestationStatus.NGO_SIGNED,
        ngoSignedBy: ngoId,
        ngoSignedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: ngoId,
      entityType: "attestation",
      entityId: updated.id,
      action: "ATTESTATION_NGO_SIGNED",
      metadata: { donationId, type: rawType },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// POST /disburse/:id/proof - NGO uploads proof for a milestone (=disbursement)
export const uploadMilestoneProof = [
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(401).json({ error: "User not authenticated" });

      const disbursementId = req.params.id as string;

      const profile = await prisma.profile.findUnique({
        where: { id: userId },
      });
      if (!profile || profile.ngoStatus !== NgoStatus.ACTIVE) {
        return res
          .status(403)
          .json({ error: "NGO must be ACTIVE to upload milestone proof" });
      }

      const disbursement = await prisma.disbursement.findFirst({
        where: { id: disbursementId, ngoId: userId },
      });
      if (!disbursement)
        return res
          .status(404)
          .json({ error: "Milestone not found or access denied" });
      if (disbursement.status !== DisbursementStatus.PENDING) {
        return res.status(409).json({
          error: `Cannot submit proof for a milestone in status ${disbursement.status}`,
        });
      }

      const multerReq = req as any;
      if (!multerReq.file)
        return res.status(400).json({ error: "No file uploaded" });

      const storageBucket = "test-bucket";
      const storagePath = `milestone_proofs/${disbursementId}/${Date.now()}_${multerReq.file.originalname}`;
      const sha512Hash = `proof_hash_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

      const document = await prisma.document.create({
        data: {
          ownerId: userId,
          disbursementId,
          documentType: DocumentType.FIELD_REPORT,
          sha512Hash,
          storageBucket,
          storagePath,
        },
      });

      const updated = await prisma.disbursement.update({
        where: { id: disbursementId },
        data: { fieldReportUrl: storagePath, proofSubmittedAt: new Date() },
      });

      await writeAuditLog({
        actorType: AuditActorType.USER,
        actorId: userId,
        entityType: "disbursement",
        entityId: disbursementId,
        action: "MILESTONE_PROOF_UPLOADED",
        metadata: { documentId: document.id, sha512Hash },
      });

      res.status(201).json({ ...updated, documentId: document.id, sha512Hash });
    } catch (err) {
      next(err);
    }
  },
];
// Mount all routes on charityRouter
charityRouter.post("/onboard", requireAuth, onboardNgo);

charityRouter.post(
  "/documents/upload",
  requireAuth,
  requireRole(UserRole.CHARITY),
  uploadDocument,
);
charityRouter.get(
  "/documents",
  requireAuth,
  requireRole(UserRole.CHARITY),
  getDocuments,
);

charityRouter.post(
  "/campaigns",
  requireAuth,
  requireRole(UserRole.CHARITY),
  createCampaign,
);
charityRouter.get(
  "/campaigns",
  requireAuth,
  requireRole(UserRole.CHARITY),
  getCampaigns,
);
charityRouter.post(
  "/campaigns/:id/submit",
  requireAuth,
  requireRole(UserRole.CHARITY),
  submitCampaign,
);

charityRouter.post(
  "/cohorts",
  requireAuth,
  requireRole(UserRole.CHARITY),
  createCohort,
);
charityRouter.post(
  "/cohorts/:id/proof",
  requireAuth,
  requireRole(UserRole.CHARITY),
  uploadCohortProof,
);

charityRouter.post(
  "/disburse",
  requireAuth,
  requireRole(UserRole.CHARITY),
  createDisbursement,
);
charityRouter.get(
  "/disbursements",
  requireAuth,
  requireRole(UserRole.CHARITY),
  getDisbursements,
);

charityRouter.get("/documents/:id/verify", verifyDocumentHash); // public, unchanged

charityRouter.get(
  "/reports/fcra",
  requireAuth,
  requireRole(UserRole.CHARITY),
  getFcraReport,
);
charityRouter.get(
  "/reports/80g",
  requireAuth,
  requireRole(UserRole.CHARITY),
  get80gReport,
);

charityRouter.get(
  "/attestations/pending",
  requireAuth,
  requireRole(UserRole.CHARITY),
  getPendingAttestationsForNgo,
);
charityRouter.post(
  "/attestations",
  requireAuth,
  requireRole(UserRole.CHARITY),
  signAttestation,
);
charityRouter.post(
  "/disburse/:id/proof",
  requireAuth,
  requireRole(UserRole.CHARITY),
  uploadMilestoneProof,
);

export default charityRouter;
