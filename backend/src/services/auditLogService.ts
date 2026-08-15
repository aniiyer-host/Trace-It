import { prisma } from '../db/prisma';
import { AuditActorType } from '../../generated/prisma/enums';

export interface AuditLogParams {
  actorType: AuditActorType;
  actorId?: string;
  entityType: string;
  entityId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  requestId?: string;
  govRequestId?: string;
}

/**
 * Insert a row into the audit_logs table.
 * Fire-and-forget safe: errors are caught and logged so they never crash the caller.
 */
export const writeAuditLog = async (params: AuditLogParams): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId ?? null,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        action: params.action,
        metadata: (params.metadata as object) ?? {},
        ipAddress: params.ipAddress ?? null,
        requestId: params.requestId ?? null,
        govRequestId: params.govRequestId ?? null,
      },
    });
  } catch (err) {
    // Audit log failures must never crash the API — log and continue
    console.error('[AuditLog] Failed to write audit log', { ...params, err });
  }
};
