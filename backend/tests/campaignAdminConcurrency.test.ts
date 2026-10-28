import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/index.js';
import { prisma } from '../src/db/prisma.js';

describe('campaign admin compare-and-set transitions (disposable database)', () => {
  const campaignIds: string[] = [];
  const ngoIds: string[] = [];
  let adminId: string;
  let token: string;

  beforeAll(async () => {
    const identity = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (!/^traceit_reliability_e2e_/.test(identity[0]?.database ?? '')) {
      throw new Error('Campaign concurrency writes require the verified disposable test database');
    }

    const admin = await prisma.profile.create({
      data: { email: `campaign-admin-${randomUUID()}@example.test`, role: 'ADMIN' },
    });
    adminId = admin.id;
    token = jwt.sign(
      { userId: admin.id },
      process.env.JWT_ACCESS_SECRET || 'access_secret',
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: campaignIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: ngoIds } } });
    if (adminId) await prisma.profile.delete({ where: { id: adminId } });
  });

  async function makeCampaign() {
    const ngo = await prisma.profile.create({
      data: {
        email: `campaign-ngo-${randomUUID()}@example.test`,
        role: 'CHARITY',
        ngoStatus: 'ACTIVE',
      },
    });
    ngoIds.push(ngo.id);
    const campaign = await prisma.campaign.create({
      data: {
        ngoId: ngo.id,
        title: 'Campaign transition race fixture',
        description: 'Disposable integration fixture',
        targetAmount: '100.00',
        status: 'PENDING_APPROVAL',
        sdgTags: [],
      },
    });
    campaignIds.push(campaign.id);
    return campaign.id;
  }

  function post(action: 'approve' | 'close', campaignId: string) {
    return request(app)
      .post(`/api/admin/campaigns/${campaignId}/${action}`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('rejects one of two simultaneous approvals and writes one audit event', async () => {
    const campaignId = await makeCampaign();
    const responses = await Promise.all([
      post('approve', campaignId),
      post('approve', campaignId),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.auditLog.count({
      where: { entityType: 'campaign', entityId: campaignId, action: 'CAMPAIGN_APPROVED' },
    })).toBe(1);
  });

  it('does not overwrite a campaign changed by a concurrent approval or closure', async () => {
    const campaignId = await makeCampaign();
    const responses = await Promise.all([
      post('approve', campaignId),
      post('close', campaignId),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const finalStatus = (await prisma.campaign.findUnique({ where: { id: campaignId } }))?.status;
    expect(['ACTIVE', 'COMPLETED']).toContain(finalStatus);
  });

  it('makes concurrent duplicate closures idempotent without duplicate audit events', async () => {
    const campaignId = await makeCampaign();
    await post('approve', campaignId).expect(200);
    const responses = await Promise.all([
      post('close', campaignId),
      post('close', campaignId),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await prisma.campaign.findUnique({ where: { id: campaignId } }))?.status).toBe('COMPLETED');
    expect(await prisma.auditLog.count({
      where: { entityType: 'campaign', entityId: campaignId, action: 'CAMPAIGN_CLOSED' },
    })).toBe(1);
    await post('approve', campaignId).expect(409);
  });
});
