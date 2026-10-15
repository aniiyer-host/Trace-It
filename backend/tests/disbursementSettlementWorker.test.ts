import type { PrismaClient } from '../generated/prisma/client.js';
import { settleDueDisbursements } from '../src/services/disbursementSettlementWorker.js';

function fakeDatabase(dueIds: string[], updateCount = 1) {
  const updateMany = jest.fn().mockResolvedValue({ count: updateCount });
  const auditCreate = jest.fn().mockResolvedValue({});
  const tx = {
    disbursement: {
      findMany: jest.fn().mockResolvedValue(dueIds.map((id) => ({ id }))),
      updateMany,
    },
    auditLog: { create: auditCreate },
  };
  const database = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<number>) => callback(tx)),
  };
  return { database: database as unknown as PrismaClient, tx };
}

describe('disbursement settlement worker', () => {
  it('leaves an awaiting transfer in SENT until its persisted due time', async () => {
    const { database, tx } = fakeDatabase([]);
    const now = new Date('2026-10-15T12:00:04.999Z');

    await expect(settleDueDisbursements(database, now)).resolves.toBe(0);
    expect(tx.disbursement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'SENT', settlementDueAt: { lte: now } },
    }));
    expect(tx.disbursement.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('settles due records conditionally and records one system audit event', async () => {
    const { database, tx } = fakeDatabase(['disbursement-1']);
    const now = new Date('2026-10-15T12:00:05.000Z');

    await expect(settleDueDisbursements(database, now)).resolves.toBe(1);
    expect(tx.disbursement.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'disbursement-1',
        status: 'SENT',
        settlementDueAt: { lte: now },
      },
      data: { status: 'SETTLED', settlementDueAt: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityId: 'disbursement-1',
        action: 'DISBURSEMENT_SETTLEMENT_DELAY_ELAPSED',
      }),
    }));
  });

  it('does not duplicate the audit event when another worker already claimed the transition', async () => {
    const { database, tx } = fakeDatabase(['disbursement-1'], 0);

    await expect(settleDueDisbursements(database, new Date())).resolves.toBe(0);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
