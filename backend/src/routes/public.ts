import { Request, Response, NextFunction, Router } from 'express';
import { prisma } from '../db/prisma.js';
import { CampaignStatus } from '../../generated/prisma/enums.js';
import Joi from 'joi';

// Cursor-based pagination schema
const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(10),
  cursor: Joi.string().optional(),
}).unknown(false);

// ---------------------------------------------------------------------------
// GET /api/public/campaigns
// ---------------------------------------------------------------------------

/**
 * Returns ACTIVE campaigns, no auth, paginated (cursor-based).
 */
export const getPublicCampaigns = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Express req.query values can be string | string[] | ParsedQs — normalise
    const rawQuery = {
      limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    };

    const { error, value } = paginationSchema.validate(rawQuery);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { limit, cursor } = value as { limit: number; cursor?: string };

    const campaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.ACTIVE,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      take: limit + 1,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        targetAmount: true,
        raisedAmount: true,
        currencyCode: true,
        status: true,
        coverImageUrl: true,
        startDate: true,
        endDate: true,
        sdgTags: true,
        ngo: {
          select: {
            organisationName: true,
          },
        },
        _count: {
          select: {
            donations: {
              where: { status: 'SUCCESS' as const },
            },
          },
        },
      },
    });

    const hasNextPage = campaigns.length > limit;
    const data = hasNextPage ? campaigns.slice(0, -1) : campaigns;
    const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    res.json({
      data: data.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        targetAmount: c.targetAmount,
        raisedAmount: c.raisedAmount,
        currencyCode: c.currencyCode,
        status: c.status,
        coverImageUrl: c.coverImageUrl,
        startDate: c.startDate,
        endDate: c.endDate,
        sdgTags: c.sdgTags,
        ngoName: (c as unknown as { ngo?: { organisationName: string | null } }).ngo?.organisationName ?? null,
        successDonationCount: (c as unknown as { _count?: { donations: number } })._count?.donations ?? 0,
      })),
      pagination: {
        limit,
        cursor: nextCursor,
        hasNextPage,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/public/campaigns/:id
// ---------------------------------------------------------------------------

/**
 * Campaign detail + raised progress. Only returns ACTIVE campaigns.
 */
export const getPublicCampaignById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params['id'] as string;

    const campaigns = await prisma.campaign.findMany({
      where: { id, status: CampaignStatus.ACTIVE },
      take: 1,
      select: {
        id: true,
        title: true,
        description: true,
        targetAmount: true,
        raisedAmount: true,
        currencyCode: true,
        status: true,
        coverImageUrl: true,
        startDate: true,
        endDate: true,
        sdgTags: true,
        ngo: {
          select: {
            organisationName: true,
          },
        },
        _count: {
          select: {
            donations: {
              where: { status: 'SUCCESS' as const },
            },
          },
        },
      },
    });

    const campaign = campaigns[0];

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const typedCampaign = campaign as unknown as typeof campaign & {
      ngo?: { organisationName: string | null };
      _count?: { donations: number };
    };

    res.json({
      id: typedCampaign.id,
      title: typedCampaign.title,
      description: typedCampaign.description,
      targetAmount: typedCampaign.targetAmount,
      raisedAmount: typedCampaign.raisedAmount,
      currencyCode: typedCampaign.currencyCode,
      status: typedCampaign.status,
      coverImageUrl: typedCampaign.coverImageUrl,
      startDate: typedCampaign.startDate,
      endDate: typedCampaign.endDate,
      sdgTags: typedCampaign.sdgTags,
      ngoName: typedCampaign.ngo?.organisationName ?? null,
      successDonationCount: typedCampaign._count?.donations ?? 0,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/public/donation/:publicId
// ---------------------------------------------------------------------------

/**
 * Status timeline, zero PII (donation_public_view semantics).
 */
export const getPublicDonationByPublicId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const publicId = req.params['publicId'] as string;

    const donation = await prisma.donation.findUnique({
      where: { publicId },
      select: {
        publicId: true,
        amount: true,
        currencyCode: true,
        paymentMethod: true,
        status: true,
        solanaTxHash: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            title: true,
          },
        },
        ngo: {
          select: {
            organisationName: true,
          },
        },
      },
    });

    if (!donation) {
      return res.status(404).json({ error: 'Donation not found' });
    }

    const typedDonation = donation as unknown as typeof donation & {
      project?: { id: string; title: string } | null;
      ngo?: { organisationName: string | null } | null;
    };

    const explorerUrl = typedDonation.solanaTxHash
      ? `https://explorer.solana.com/tx/${typedDonation.solanaTxHash}?cluster=devnet`
      : null;

    res.json({
      publicId: typedDonation.publicId,
      amount: typedDonation.amount,
      currencyCode: typedDonation.currencyCode,
      paymentMethod: typedDonation.paymentMethod,
      status: typedDonation.status,
      solanaTxHash: typedDonation.solanaTxHash,
      explorerUrl,
      createdAt: typedDonation.createdAt,
      campaign: typedDonation.project
        ? { id: typedDonation.project.id, title: typedDonation.project.title }
        : null,
      ngoName: typedDonation.ngo?.organisationName ?? null,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const publicRouter = Router();
publicRouter.get('/campaigns', getPublicCampaigns);
publicRouter.get('/campaigns/:id', getPublicCampaignById);
publicRouter.get('/donation/:publicId', getPublicDonationByPublicId);

export default publicRouter;