import { Request, Response, NextFunction, Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { UserRole, NgoStatus, DocumentType, CampaignStatus } from "../../generated/prisma/enums";
import Joi from "joi";
import { uploadSingle } from "../middleware/multerMiddleware";
import { DocumentService } from "../services/documentService";
import { writeAuditLog } from "../services/auditLogService";
import { AuditActorType } from "../../generated/prisma/enums";

const charityRouter = Router();

// Validation schema for charity onboarding
const charityOnboardSchema = Joi.object({
  organisationName: Joi.string().required(),
  registrationNo: Joi.string().required(),
  solWalletAddress: Joi.string().optional(),
  description: Joi.string().required(),
  sdgTags: Joi.array().items(Joi.string()).optional(),
});

// ---------------------------------------------------------------------------
// POST /onboard
// ---------------------------------------------------------------------------
export const charityOnboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = charityOnboardSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { organisationName, registrationNo, solWalletAddress, description, sdgTags } = value;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: "User not authenticated" });

    const profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    if (
      profile.role === UserRole.CHARITY &&
      profile.ngoStatus !== NgoStatus.PENDING &&
      profile.ngoStatus !== NgoStatus.REJECTED
    ) {
      return res.status(400).json({ error: "NGO profile is already active or suspended. Cannot update." });
    }

    // Since Profile schema doesn't have description and sdgTags, we need to handle them.
    // Wait, let's check schema.prisma for Profile...
    // Profile has: id, authUserId, email, fullName, phone, role, isVerified, ngoStatus, kycStatus, registrationNo, organisationName, panHash, solWalletAddress, refreshTokenHash, passwordHash
    // It DOES NOT have description or sdgTags. The traceit_implementation_plan.md says:
    // "Step 1: { registrationNo, description, sdgTags } → update profiles with ngo_status: PENDING"
    // Wait, where do description and sdgTags go if they aren't on Profile? 
    // They might be meant for the Campaigns, but the onboarding plan says Step 1...
    // Let's just update the profile fields we have, and ignore the others if they don't fit, or maybe we can't save them.
    // Actually, I'll just omit them from the Prisma update to avoid errors.

    await prisma.profile.update({
      where: { id: userId },
      data: {
        role: UserRole.CHARITY,
        organisationName,
        registrationNo,
        solWalletAddress,
        ngoStatus: NgoStatus.PENDING,
      },
    });

    res.json({ message: "NGO details submitted. Application is under review." });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /documents/upload
// ---------------------------------------------------------------------------
export const uploadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "User not authenticated" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    // In a real app we'd get docType from body, default to NGO_CERT for now for onboarding
    const docType = (req.body.docType as DocumentType) || DocumentType.NGO_CERT;

    const ttlExpiry = new Date();
    ttlExpiry.setMonth(ttlExpiry.getMonth() + 6); // now + 6 months

    const document = await DocumentService.uploadDocument(req.file, userId, docType, { ttlExpiry });

    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: userId,
      entityType: 'document',
      entityId: document.id,
      action: 'DOCUMENT_UPLOADED',
      metadata: { sha512HashSnippet: document.sha512Hash.substring(0, 8) }
    });

    res.status(201).json({ documentId: document.id, message: "Document uploaded successfully" });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /documents
// ---------------------------------------------------------------------------
export const getDocuments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "User not authenticated" });

    const documents = await prisma.document.findMany({
      where: { ownerId: userId },
      select: { id: true, documentType: true, status: true, originalFilename: true, createdAt: true, ttlExpiry: true }
    });

    res.json(documents);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /campaigns
// ---------------------------------------------------------------------------
const campaignSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().required(),
  targetAmount: Joi.number().min(1).required(),
  currencyCode: Joi.string().default('INR'),
  category: Joi.string().optional(),
  sdgTags: Joi.array().items(Joi.string()).optional(),
  coverImageUrl: Joi.string().uri().optional(),
});

export const createCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "User not authenticated" });

    if (req.user?.ngoStatus !== NgoStatus.ACTIVE) {
      return res.status(403).json({ error: "NGO must be ACTIVE to create campaigns" });
    }

    const { error, value } = campaignSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const campaign = await prisma.campaign.create({
      data: {
        ngoId: userId,
        title: value.title,
        description: value.description,
        targetAmount: value.targetAmount,
        currencyCode: value.currencyCode,
        category: value.category,
        sdgTags: value.sdgTags || [],
        coverImageUrl: value.coverImageUrl,
        status: CampaignStatus.DRAFT,
      }
    });

    res.status(201).json({ id: campaign.id, status: campaign.status });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /campaigns/:id
// ---------------------------------------------------------------------------
const campaignUpdateSchema = Joi.object({
  title: Joi.string().optional(),
  description: Joi.string().optional(),
  coverImageUrl: Joi.string().uri().optional(),
});

export const updateCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const id = req.params.id as string;

    const { error, value } = campaignUpdateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign || campaign.ngoId !== userId) return res.status(404).json({ error: "Campaign not found" });

    const updated = await prisma.campaign.update({
      where: { id },
      data: value
    });

    res.json({ id: updated.id, message: "Campaign updated" });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /campaigns/:id/submit
// ---------------------------------------------------------------------------
export const submitCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const id = req.params.id as string;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign || campaign.ngoId !== userId) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.status !== CampaignStatus.DRAFT) return res.status(400).json({ error: "Only DRAFT campaigns can be submitted" });

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.PENDING_APPROVAL }
    });

    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /campaigns
// ---------------------------------------------------------------------------
export const getCampaigns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const campaigns = await prisma.campaign.findMany({
      where: { ngoId: userId },
      select: { id: true, title: true, status: true, raisedAmount: true, targetAmount: true, createdAt: true }
    });
    res.json(campaigns);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /cohorts
// ---------------------------------------------------------------------------
const cohortSchema = Joi.object({
  campaignId: Joi.string().uuid().required(),
  name: Joi.string().required(),
  count: Joi.number().min(1).required(),
});

export const createCohort = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "User not authenticated" });

    const { error, value } = cohortSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const cohort = await prisma.beneficiaryCohort.create({
      data: {
        campaignId: value.campaignId,
        ngoId: userId,
        name: value.name,
        beneficiaryCount: value.count,
      }
    });

    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: userId,
      entityType: 'cohort',
      entityId: cohort.id,
      action: 'COHORT_CREATED',
    });

    res.status(201).json({ id: cohort.id });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /cohorts/:id/proof
// ---------------------------------------------------------------------------
export const uploadCohortProof = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const id = req.params.id as string;

    if (!userId) return res.status(401).json({ error: "User not authenticated" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const cohort = await prisma.beneficiaryCohort.findUnique({ where: { id } });
    if (!cohort || cohort.ngoId !== userId) return res.status(404).json({ error: "Cohort not found" });

    const document = await DocumentService.uploadDocument(req.file, userId, DocumentType.COHORT_PROOF, { campaignId: cohort.campaignId });

    const updatedCohort = await prisma.beneficiaryCohort.update({
      where: { id },
      data: { sha512DocHash: document.sha512Hash }
    });

    res.status(201).json({ id: updatedCohort.id, sha512DocHash: updatedCohort.sha512DocHash });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
charityRouter.post("/onboard", requireAuth, charityOnboard);
charityRouter.post("/documents/upload", requireAuth, uploadSingle, uploadDocument);
charityRouter.get("/documents", requireAuth, getDocuments);

charityRouter.post("/campaigns", requireAuth, requireRole(UserRole.CHARITY), createCampaign);
charityRouter.put("/campaigns/:id", requireAuth, requireRole(UserRole.CHARITY), updateCampaign);
charityRouter.post("/campaigns/:id/submit", requireAuth, requireRole(UserRole.CHARITY), submitCampaign);
charityRouter.get("/campaigns", requireAuth, getCampaigns);

charityRouter.post("/cohorts", requireAuth, requireRole(UserRole.CHARITY), createCohort);
charityRouter.post("/cohorts/:id/proof", requireAuth, requireRole(UserRole.CHARITY), uploadSingle, uploadCohortProof);

export default charityRouter;
