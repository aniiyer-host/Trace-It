import type { PrismaClient } from '../../generated/prisma/client.js';
import { AuditActorType, DisbursementStatus } from '../../generated/prisma/enums.js';
import { prisma } from '../db/prisma.js';

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 50;

export async function settleDueDisbursements(
  database: PrismaClient = prisma,
  now = new Date(),
): Promise<number> {
  return database.$transaction(async (tx) => {
    const due = await tx.disbursement.findMany({
      where: {
        status: DisbursementStatus.SENT,
        settlementDueAt: { lte: now },
      },
      select: { id: true },
      orderBy: { settlementDueAt: 'asc' },
      take: BATCH_SIZE,
    });

    let settled = 0;
    for (const { id } of due) {
      const transition = await tx.disbursement.updateMany({
        where: {
          id,
          status: DisbursementStatus.SENT,
          settlementDueAt: { lte: now },
        },
        data: {
          status: DisbursementStatus.SETTLED,
          settlementDueAt: null,
        },
      });
      if (transition.count !== 1) continue;

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.SYSTEM,
          entityType: 'disbursement',
          entityId: id,
          action: 'DISBURSEMENT_SETTLEMENT_DELAY_ELAPSED',
          metadata: { settledAt: now.toISOString() },
        },
      });
      settled += 1;
    }
    return settled;
  });
}

export class DisbursementSettlementWorker {
  private timer?: NodeJS.Timeout;
  private running = false;
  private tickInProgress = false;

  constructor(
    private readonly database: PrismaClient = prisma,
    private readonly intervalMs = POLL_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    console.info('[DisbursementSettlementWorker] Started');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (!this.running || this.tickInProgress) return;
    this.tickInProgress = true;
    try {
      const count = await settleDueDisbursements(this.database);
      if (count > 0) console.info(`[DisbursementSettlementWorker] Settled ${count} due disbursement(s)`);
    } catch {
      console.error('[DisbursementSettlementWorker] Tick failed; error details omitted.');
    } finally {
      this.tickInProgress = false;
    }
  }
}
