import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { getRazorpayClient } from '../src/services/donationService.js';

describe('concurrent donation capacity reservations (disposable database)', () => {
  const profileIds: string[] = [];
  const campaignIds: string[] = [];
  const donationIds: string[] = [];
  let ngoId: string;
  let donorTokens: string[];
  const orderCreate = getRazorpayClient().orders.create as jest.Mock;

  beforeAll(async () => {
    const identity = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (!/^traceit_reliability_e2e_/.test(identity[0]?.database ?? '')) {
      throw new Error('Concurrent donation writes require the verified disposable test database');
    }

    const ngo = await prisma.profile.create({
      data: {
        email: `capacity-ngo-${randomUUID()}@example.test`,
        role: 'CHARITY',
        ngoStatus: 'ACTIVE',
      },
    });
    ngoId = ngo.id;
    profileIds.push(ngo.id);

    donorTokens = await Promise.all([0, 1].map(async () => {
      const donor = await prisma.profile.create({
        data: {
          email: `capacity-donor-${randomUUID()}@example.test`,
          role: 'DONOR',
          kycStatus: 'APPROVED',
        },
      });
      profileIds.push(donor.id);
      return jwt.sign(
        { userId: donor.id },
        process.env.JWT_ACCESS_SECRET || 'access_secret',
        { expiresIn: '1h' },
      );
    }));
  });

  afterAll(async () => {
    orderCreate.mockReset();
    await prisma.auditLog.deleteMany({ where: { entityId: { in: donationIds } } });
    await prisma.donation.deleteMany({ where: { id: { in: donationIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: profileIds } } });
  });

  async function makeCampaign() {
    const campaign = await prisma.campaign.create({
      data: {
        ngoId,
        title: 'Concurrent capacity regression fixture',
        description: 'Disposable integration fixture',
        targetAmount: '100000.00',
        raisedAmount: '75000.00',
        status: 'ACTIVE',
        sdgTags: [],
      },
    });
    campaignIds.push(campaign.id);
    return campaign.id;
  }

  function installOrderBarrier(parties: number) {
    let arrived = 0;
    let release!: () => void;
    let allArrived!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const arrivals = new Promise<void>((resolve) => { allArrived = resolve; });
    orderCreate.mockImplementation(async (input: any) => {
      arrived += 1;
      if (arrived === parties) allArrived();
      await gate;
      return {
        id: `order_capacity_${input.notes.donationId}`,
        amount: input.amount,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      };
    });
    return { arrivals, release };
  }

  async function race(amount: number) {
    const campaignId = await makeCampaign();
    const barrier = installOrderBarrier(2);
    const pending = donorTokens.map((token) => request(app)
      .post('/api/donor/donate')
      .set('Authorization', `Bearer ${token}`)
      .send({ ngoId, campaignId, amount, paymentMethod: 'UPI' }));

    // Both requests have passed order creation and are held before the DB lock.
    await Promise.race([
      barrier.arrivals,
      Promise.any(pending.map((response) => response.then((result) => result)))
        .then((response) => {
          throw new Error(`Donation request returned ${response.status} before both reached the order barrier`);
        }),
    ]);
    barrier.release();
    const responses = await Promise.all(pending);
    orderCreate.mockReset();
    donationIds.push(...responses.filter((response) => response.status === 201).map((response) => response.body.id));
    return { campaignId, responses };
  }

  it('allows pre-order checks to race; confirmation is the authoritative capacity guard', async () => {
    const { campaignId, responses } = await race(20000);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    const reservations = await prisma.donation.aggregate({
      where: { campaignId, status: { in: ['SUCCESS', 'ALLOCATED', 'DISBURSED', 'DELIVERED', 'INITIATED'] } },
      _sum: { amount: true },
    });
    expect(reservations._sum.amount?.toFixed(2)).toBe('40000.00');
  }, 30000);

  it('lets both in-flight orders pass a stale optimistic check for the same remaining capacity', async () => {
    const { campaignId, responses } = await race(25000);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    const reservations = await prisma.donation.aggregate({
      where: { campaignId, status: { in: ['SUCCESS', 'ALLOCATED', 'DISBURSED', 'DELIVERED', 'INITIATED'] } },
      _sum: { amount: true },
    });
    expect(reservations._sum.amount?.toFixed(2)).toBe('50000.00');
  }, 30000);
});
