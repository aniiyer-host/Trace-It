import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { DisbursementSettlementWorker, settleDueDisbursements } from '../src/services/disbursementSettlementWorker.js';

describe('disbursement settlement persistence and recovery', () => {
  it('recovers a persisted due settlement on a fresh worker invocation', async () => {
    const suffix = randomUUID();
    const profile = await prisma.profile.create({
      data: { email: `settlement-${suffix}@example.test`, role: 'CHARITY' },
    });
    const campaign = await prisma.campaign.create({
      data: {
        ngoId: profile.id,
        title: 'Settlement worker test',
        description: 'Disposable integration fixture',
        targetAmount: '100.00',
        sdgTags: [],
      },
    });
    const dueAt = new Date('2026-10-15T12:00:05.000Z');
    const eligible = await prisma.disbursement.create({
      data: {
        campaignId: campaign.id,
        ngoId: profile.id,
        amountInr: '10.00',
        status: 'SENT',
        settlementDueAt: dueAt,
      },
    });
    const approved = await prisma.disbursement.create({
      data: {
        campaignId: campaign.id,
        ngoId: profile.id,
        amountInr: '10.00',
        status: 'APPROVED',
        settlementDueAt: dueAt,
      },
    });

    try {
      expect(await settleDueDisbursements(prisma, new Date(dueAt.getTime() - 1))).toBe(0);
      expect((await prisma.disbursement.findUniqueOrThrow({ where: { id: eligible.id } })).status).toBe('SENT');

      // A fresh invocation represents a restarted process discovering the persisted due timestamp.
      expect(await settleDueDisbursements(prisma, dueAt)).toBe(1);
      const settled = await prisma.disbursement.findUniqueOrThrow({ where: { id: eligible.id } });
      expect(settled.status).toBe('SETTLED');
      expect(settled.settlementDueAt).toBeNull();
      expect(await settleDueDisbursements(prisma, dueAt)).toBe(0);
      expect((await prisma.disbursement.findUniqueOrThrow({ where: { id: approved.id } })).status).toBe('APPROVED');
      expect(await prisma.auditLog.count({
        where: { entityType: 'disbursement', entityId: eligible.id, action: 'DISBURSEMENT_SETTLEMENT_DELAY_ELAPSED' },
      })).toBe(1);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityType: 'disbursement', entityId: { in: [eligible.id, approved.id] } } });
      await prisma.disbursement.deleteMany({ where: { id: { in: [eligible.id, approved.id] } } });
      await prisma.campaign.delete({ where: { id: campaign.id } });
      await prisma.profile.delete({ where: { id: profile.id } });
    }
  });

  it('requires an authorized admin manual transfer confirmation and schedules five seconds', async () => {
    const suffix = randomUUID();
    const admin = await prisma.profile.create({ data: { email: `admin-${suffix}@example.test`, role: 'ADMIN' } });
    const ngo = await prisma.profile.create({ data: { email: `ngo-${suffix}@example.test`, role: 'CHARITY' } });
    const campaign = await prisma.campaign.create({
      data: {
        ngoId: ngo.id,
        title: 'Manual transfer confirmation test',
        description: 'Disposable integration fixture',
        targetAmount: '100.00',
        sdgTags: [],
      },
    });
    const disbursement = await prisma.disbursement.create({
      data: {
        campaignId: campaign.id,
        ngoId: ngo.id,
        amountInr: '10.00',
        status: 'APPROVED',
      },
    });
    const secret = process.env.JWT_ACCESS_SECRET || 'access_secret';
    const adminToken = jwt.sign({ userId: admin.id }, secret, { expiresIn: '1h' });
    const ngoToken = jwt.sign({ userId: ngo.id }, secret, { expiresIn: '1h' });

    try {
      await request(app).post(`/api/admin/disbursements/${disbursement.id}/mark-settled`).expect(401);
      await request(app)
        .post(`/api/admin/disbursements/${disbursement.id}/mark-settled`)
        .set('Authorization', `Bearer ${ngoToken}`)
        .expect(403);
      const response = await request(app)
        .post(`/api/admin/disbursements/${disbursement.id}/mark-settled`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.disbursement.status).toBe('SENT');
      const scheduled = await prisma.disbursement.findUniqueOrThrow({ where: { id: disbursement.id } });
      expect(scheduled.settlementDueAt).toBeInstanceOf(Date);
      expect(scheduled.settlementDueAt!.getTime()).toBeGreaterThan(Date.now());

      const confirmation = await prisma.auditLog.findFirstOrThrow({
        where: { entityType: 'disbursement', entityId: disbursement.id, action: 'DISBURSEMENT_TRANSFER_CONFIRMED_MANUAL' },
      });
      const metadata = confirmation.metadata as { transferConfirmedAt: string; settlementDueAt: string };
      expect(new Date(metadata.settlementDueAt).getTime() - new Date(metadata.transferConfirmedAt).getTime()).toBe(5_000);

      const worker = new DisbursementSettlementWorker(prisma, 100);
      worker.start();
      try {
        const deadline = Date.now() + 7_000;
        let status = 'SENT';
        while (Date.now() < deadline && status === 'SENT') {
          await new Promise((resolve) => setTimeout(resolve, 100));
          status = (await prisma.disbursement.findUniqueOrThrow({ where: { id: disbursement.id } })).status;
        }
        expect(status).toBe('SETTLED');
        expect(await prisma.auditLog.count({
          where: { entityType: 'disbursement', entityId: disbursement.id, action: 'DISBURSEMENT_SETTLEMENT_DELAY_ELAPSED' },
        })).toBe(1);
      } finally {
        worker.stop();
      }
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityType: 'disbursement', entityId: disbursement.id } });
      await prisma.disbursement.delete({ where: { id: disbursement.id } });
      await prisma.campaign.delete({ where: { id: campaign.id } });
      await prisma.profile.deleteMany({ where: { id: { in: [admin.id, ngo.id] } } });
    }
  }, 10_000);
});
