import { writeAuditLog } from './src/services/auditLogService';
// import { AuditActorType } from './generated/prisma/enums';

await writeAuditLog({
  actorType: 'USER' as any,
  actorId: undefined,
  entityType: 'document',
  entityId: 'siem-test-document',
  action: 'UNAUTHORIZED_DOC_ACCESS',
  metadata: {
    source: 'SIEM_PHASE_3B_TEST',
  },
  ipAddress: '127.0.0.1',
});

console.log('UNAUTHORIZED_DOC_ACCESS emitted');
console.log('Waiting for Elasticsearch transport to flush...');

await new Promise(resolve => setTimeout(resolve, 5000));

console.log('Done');
process.exit(0);