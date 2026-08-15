import { Request, Response, NextFunction, Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { UserRole, DisbursementStatus, AuditActorType } from "../../generated/prisma/enums";
import { writeAuditLog } from "../services/auditLogService";
import { allocateDonation } from "../services/statusService";

const adminRouter = Router();

// ---------------------------------------------------------------------------
// POST /disburse/:id/approve
// ---------------------------------------------------------------------------
export const approveDisbursement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.user?.id;
    const disbursementId = req.params.id as string;
    
    if (!adminId) return res.status(401).json({ error: "User not authenticated" });

    const disbursement = await prisma.disbursement.findUnique({ where: { id: disbursementId } });
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
      }
    });

    // TODO(blockchain-team): Call Disbursement Program here for Solana
    // For now, this is a placeholder where they will inject the logic to transfer SPL tokens.

    // Allocate donations up to the disbursed amount
    // First, find all SUCCESS donations for this campaign
    const donations = await prisma.donation.findMany({
      where: {
        campaignId: disbursement.campaignId,
        status: 'SUCCESS'
      },
      orderBy: { createdAt: 'asc' }
    });

    let remainingToAllocate = Number(disbursement.amountInr);

    for (const donation of donations) {
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
      entityType: 'disbursement',
      entityId: disbursement.id,
      action: 'DISBURSEMENT_APPROVED',
      metadata: { campaignId: disbursement.campaignId, amountInr: Number(disbursement.amountInr) }
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /disbursements
// ---------------------------------------------------------------------------
export const getAllDisbursements = async (req: Request, res: Response, next: NextFunction) => {
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
      orderBy: { createdAt: 'desc' }
    });

    res.json(disbursements);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /disbursements/:id
// ---------------------------------------------------------------------------
export const getDisbursementById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const disbursement = await prisma.disbursement.findUnique({
      where: { id },
      include: {
        campaign: true,
        ngo: true,
        cohort: true,
        documents: true,
      }
    });

    if (!disbursement) {
      return res.status(404).json({ error: "Disbursement not found" });
    }

    res.json(disbursement);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
adminRouter.post("/disburse/:id/approve", requireAuth, requireRole(UserRole.ADMIN), approveDisbursement);
adminRouter.get("/disbursements", requireAuth, requireRole(UserRole.ADMIN), getAllDisbursements);
adminRouter.get("/disbursements/:id", requireAuth, requireRole(UserRole.ADMIN), getDisbursementById);

export default adminRouter;
