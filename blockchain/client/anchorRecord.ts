import * as anchor from "@coral-xyz/anchor";

export type ExpectedAnchorRecord = {
  batchKey: number[];
  auditRoot: number[];
  startSequence: anchor.BN;
  endSequence: anchor.BN;
  eventCount: number;
  schemaVersion: number;
};

export type DecodedAnchorRecord = ExpectedAnchorRecord & {
  authority: anchor.web3.PublicKey;
  anchoredAt: anchor.BN;
  bump: number;
};

export function anchorRecordMatches(
  record: DecodedAnchorRecord,
  expected: ExpectedAnchorRecord,
): boolean {
  return (
    Buffer.from(record.batchKey).equals(Buffer.from(expected.batchKey)) &&
    Buffer.from(record.auditRoot).equals(Buffer.from(expected.auditRoot)) &&
    record.startSequence.eq(expected.startSequence) &&
    record.endSequence.eq(expected.endSequence) &&
    record.eventCount === expected.eventCount &&
    record.schemaVersion === expected.schemaVersion
  );
}
