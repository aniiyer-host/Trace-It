import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/index.js';
import { prisma } from '../src/db/prisma.js';

describe('disbursement request eligibility', () => {
  const created: { profileIds: string[]; campaignIds: string[]; disbursementIds: string[] } = {
    profileIds: [], campaignIds: [], disbursementIds: [],
  };
  let ngoId: string;
  let campaignId: string;
  let token: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const ngo = await prisma.profile.create({
      data: { email: `request-${suffix}@example.test`, role: 'CHARITY', ngoStatus: 'ACTIVE' },
    });
    ngoId = ngo.id;
    created.profileIds.push(ngo.id);
    const campaign = await prisma.campaign.create({
      data: {
        ngoId, title: 'Repeat request test', description: 'Disposable integration fixture',
        targetAmount: '100.00', raisedAmount: '100.00', sdgTags: [], status: 'ACTIVE',
      },
    });
    campaignId = campaign.id;
    created.campaignIds.push(campaign.id);
    token = jwt.sign({ userId: ngoId }, process.env.JWT_ACCESS_SECRET || 'access_secret', { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityType: 'disbursement', entityId: { in: created.disbursementIds } } });
    await prisma.disbursement.deleteMany({ where: { id: { in: created.disbursementIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: created.campaignIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: created.profileIds } } });
  });

  const submit = (amountInr: number, auth = token) => request(app)
    .post('/api/charity/disburse')
    .set('Authorization', `Bearer ${auth}`)
    .send({ campaignId, amountInr });

  it('allows a first request and blocks an outstanding duplicate, then permits a second after settlement', async () => {
    const first = await submit(40).expect(201);
    created.disbursementIds.push(first.body.id);
    await submit(10).expect(409);

    // Model the terminal result of the settlement flow; no production records are involved.
    await prisma.disbursement.update({ where: { id: first.body.id }, data: { status: 'SETTLED' } });
    const second = await submit(60).expect(201);
    created.disbursementIds.push(second.body.id);
    await submit(1).expect(409);
  });

  it('rejects invalid amounts, insufficient eligible funds, unauthorized callers, and simultaneous duplicates', async () => {
    await prisma.disbursement.updateMany({ where: { campaignId }, data: { status: 'REJECTED' } });
    await submit(0).expect(400);
    await submit(101).expect(400);

    const donor = await prisma.profile.create({
      data: { email: `request-donor-${randomUUID()}@example.test`, role: 'DONOR' },
    });
    created.profileIds.push(donor.id);
    const donorToken = jwt.sign({ userId: donor.id }, process.env.JWT_ACCESS_SECRET || 'access_secret', { expiresIn: '1h' });
    await submit(1, donorToken).expect(403);

    const otherNgo = await prisma.profile.create({
      data: { email: `request-other-${randomUUID()}@example.test`, role: 'CHARITY', ngoStatus: 'ACTIVE' },
    });
    created.profileIds.push(otherNgo.id);
    const otherNgoToken = jwt.sign({ userId: otherNgo.id }, process.env.JWT_ACCESS_SECRET || 'access_secret', { expiresIn: '1h' });
    await submit(1, otherNgoToken).expect(404);

    const responses = await Promise.all([submit(25), submit(25)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    created.disbursementIds.push(...responses.filter((response) => response.status === 201).map((response) => response.body.id));
  });
});
