import crypto from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { verifyProvenanceEvents } from "../provenanceChainService.js";
import { serializeProvenanceEvent, hashProvenanceEvent, computeChainHashFromPayloadHash } from "../../utils/provenance.js";
import { deriveAnchorBatch } from "../anchor/anchorProtocol.js";
import { createReadOnlyAnchorVerifier, verifyPersistedAnchor } from "./donationAnchorVerification.js";

const eventSelect = {
  id: true, eventType: true, entityType: true, entityId: true, amountInr: true,
  ngoId: true, campaignId: true, occurredAt: true, canonicalPayload: true,
  payloadHash: true, previous_hash: true, chainHash: true, anchorStatus: true,
  anchorBatchId: true,
} as const;

export async function getAdminDonationForensics(donationId: string) {
  const donation = await prisma.donation.findUnique({ where: { id: donationId }, select: { id: true, ngoId: true } });
  if (!donation) return null;

  const events = await prisma.provenanceEvent.findMany({
    where: { entityType: "Donation", entityId: donationId },
    orderBy: { id: "asc" },
    select: { ...eventSelect, anchorBatch: { select: {
      id: true, batchKey: true, auditRoot: true, nonce: true, schemaVersion: true,
      startSequence: true, endSequence: true, eventCount: true, status: true,
      solanaTxSignature: true, anchorPda: true, anchoredAt: true,
    } } },
  });

  const lastRequiredSequence = events.reduce((last, event) => {
    const end = event.anchorBatch?.endSequence ?? event.id;
    return end > last ? end : last;
  }, events.at(-1)?.id ?? 0n);
  const prefix = lastRequiredSequence === 0n ? [] : await prisma.provenanceEvent.findMany({
    where: { id: { lte: lastRequiredSequence } }, orderBy: { id: "asc" }, select: { ...eventSelect, anchorBatchId: true },
  });
  const chainCheck = verifyProvenanceEvents(prefix);
  const chain = createReadOnlyAnchorVerifier();
  const batchChecks = new Map<string, ReturnType<typeof verifyPersistedAnchor>>();
  for (const event of events) {
    const batch = event.anchorBatch;
    if (batch && event.anchorBatchId && !batchChecks.has(batch.id)) {
      const batchEvents = prefix.filter((candidate) => candidate.anchorBatchId === batch.id);
      batchChecks.set(batch.id, verifyPersistedAnchor(batch as never, batchEvents as never, chain));
    }
  }

  const detailed = await Promise.all(events.map(async (event) => {
    const id = event.id.toString();
    const issues = chainCheck.errors.filter((error) => error.eventId === id);
    const eventIndex = prefix.findIndex((candidate) => candidate.id === event.id);
    const expectedPreviousHash = eventIndex > 0 ? prefix[eventIndex - 1].chainHash : null;
    const input = {
      eventType: event.eventType, entityType: event.entityType, entityId: event.entityId,
      amountInr: event.amountInr, ngoId: event.ngoId, campaignId: event.campaignId,
      occurredAt: event.occurredAt,
    };
    let canonicalExpected: string | null = null;
    let payloadHashExpected: string | null = null;
    let chainHashExpected: string | null = null;
    try {
      canonicalExpected = serializeProvenanceEvent(input);
      payloadHashExpected = hashProvenanceEvent(input);
      chainHashExpected = computeChainHashFromPayloadHash(event.payloadHash, expectedPreviousHash);
    } catch { /* detailed status below carries malformed legacy/input states */ }

    const batch = event.anchorBatch;
    const batchChecksForEvent = batch ? await batchChecks.get(batch.id)! : null;
    let expectedBatchKey: string | null = null;
    let expectedAuditRoot: string | null = null;
    if (batch) {
      try {
        const batchEvents = prefix.filter((candidate) => candidate.anchorBatchId === batch.id).sort((left, right) => left.id < right.id ? -1 : 1);
        const expectedBatch = deriveAnchorBatch(batch.startSequence, batchEvents.map((candidate) => candidate.payloadHash), batch.schemaVersion, batch.nonce ? Uint8Array.from(Buffer.from(batch.nonce, "hex")) : undefined);
        expectedBatchKey = Buffer.from(expectedBatch.batchKey).toString("hex");
        expectedAuditRoot = Buffer.from(expectedBatch.auditRoot).toString("hex");
      } catch { /* invalid or incomplete batch metadata is represented by unavailable expected values */ }
    }
    const firstRelevantChainError = chainCheck.errors.find((error) => BigInt(error.eventId) <= event.id);
    const provenance = event.chainHash === null
      ? { status: "UNAVAILABLE", reason: "Legacy event has no chain hash." }
      : firstRelevantChainError
        ? { status: "FAILED", reason: issues.map((issue) => issue.reason).join("; ") || `An earlier chain inconsistency at event ${firstRelevantChainError.eventId} affects this event's verification.` }
        : { status: "PASSED" };
    const batchRoot = batchChecksForEvent?.batchRoot ?? (event.anchorBatchId
      ? { status: "UNAVAILABLE", reason: "The event references a batch whose metadata could not be retrieved." }
      : { status: "NOT_APPLICABLE", reason: "This event has not been assigned to a batch." });
    const onChainRecord = batchChecksForEvent?.onChainRecord ?? (event.anchorBatchId ? { status: "UNAVAILABLE", reason: "The referenced batch record is unavailable." } : { status: "NOT_APPLICABLE" });
    const transaction = batchChecksForEvent?.transaction ?? (event.anchorBatchId ? { status: "UNAVAILABLE", reason: "The referenced batch record is unavailable." } : { status: "NOT_APPLICABLE" });
    const checks = { provenance, batchRoot, onChainRecord, transaction };
    const failed = Object.entries(checks).filter(([, check]) => check.status === "FAILED");
    const unavailable = Object.entries(checks).some(([, check]) => check.status === "UNAVAILABLE");
    const scope = issues.length ? "EVENT" : firstRelevantChainError ? "CHAIN" : failed.some(([name]) => name === "batchRoot" || name === "onChainRecord" || name === "transaction") ? "BATCH" : "NONE";
    const verifiedExternalMismatch = onChainRecord.status === "FAILED" && (onChainRecord.reason?.startsWith("The returned on-chain") ?? false);
    const fieldDifferences = canonicalExpected && event.canonicalPayload !== canonicalExpected
      ? canonicalFieldDifferences(event.canonicalPayload, canonicalExpected)
      : [];
    return {
      eventId: id, sequence: id, entityType: event.entityType, entityId: event.entityId,
      eventType: event.eventType, occurredAt: event.occurredAt.toISOString(),
      payloadHash: { status: event.payloadHash === payloadHashExpected ? "PASSED" : "FAILED", observed: event.payloadHash, expected: payloadHashExpected },
      canonicalPayload: { status: event.canonicalPayload === canonicalExpected ? "PASSED" : "FAILED", fieldDifferences },
      previousHash: { status: event.chainHash === null ? "UNAVAILABLE" : issues.some((issue) => issue.reason.includes("previous_hash")) ? "FAILED" : "PASSED", observed: event.previous_hash },
      chainHash: { status: event.chainHash === null ? "UNAVAILABLE" : event.chainHash === chainHashExpected ? "PASSED" : "FAILED", observed: event.chainHash, expected: event.chainHash === null ? null : chainHashExpected },
      verification: checks,
      scope,
      severity: failed.length ? (verifiedExternalMismatch ? "CRITICAL" : "WARNING") : unavailable ? "OPERATIONAL" : "INFORMATIONAL",
      explanation: failed.length
        ? scope === "EVENT" ? "Stored event fields do not reproduce the canonical payload or its recorded hash-chain evidence. This localizes an inconsistency to this event; it does not identify who changed it or when."
          : "The batch or external anchor evidence is inconsistent. Events in this batch are potentially affected; this check does not attribute the inconsistency to one event."
        : unavailable ? "Verification could not be completed with the evidence currently available. This is not a confirmed integrity failure."
          : "The available provenance and anchor checks passed.",
      batch: batch ? {
        id: batch.id, key: batch.batchKey, auditRoot: batch.auditRoot, nonce: batch.nonce,
        expectedKey: expectedBatchKey, expectedAuditRoot,
        sequenceStart: batch.startSequence.toString(), sequenceEnd: batch.endSequence.toString(),
        eventCount: batch.eventCount, status: batch.status, pda: batch.anchorPda,
        transactionSignature: batch.solanaTxSignature, anchoredAt: batch.anchoredAt?.toISOString() ?? null,
      } : null,
    };
  }));

  const alertRows = detailed.flatMap<Prisma.IntegrityAlertCreateManyInput>((item) => {
    if (item.scope === "EVENT") {
      return [{
        dedupeKey: crypto.createHash("sha256").update(`${donationId}:${item.eventId}:provenance`).digest("hex"),
        donationId, ngoId: donation.ngoId, eventId: item.eventId, batchId: item.batch?.id ?? null,
        failureType: "PROVENANCE_EVENT_MISMATCH", source: "ON_DEMAND", severity: "WARNING",
        details: { scope: "EVENT", reasons: chainCheck.errors.filter((error) => error.eventId === item.eventId).map((error) => error.reason), observedAt: new Date().toISOString() },
      }];
    }
    if (item.scope !== "BATCH" || !item.batch) return [];
    const failedChecks = Object.entries(item.verification).filter(([, check]) => check.status === "FAILED");
    return failedChecks.map(([checkName, check]) => ({
      dedupeKey: crypto.createHash("sha256").update(`${donationId}:${item.batch!.id}:${checkName}`).digest("hex"),
      donationId, ngoId: donation.ngoId, eventId: null, batchId: item.batch!.id,
      failureType: `BATCH_${checkName.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_MISMATCH`,
      source: "ON_DEMAND", severity: checkName === "onChainRecord" && (check.reason?.startsWith("The returned on-chain") ?? false) ? "CRITICAL" : "WARNING",
      details: { scope: "BATCH", reason: check.reason ?? "Batch verification failed", observedAt: new Date().toISOString() },
    }));
  });
  if (alertRows.length) await prisma.integrityAlert.createMany({ data: alertRows, skipDuplicates: true });

  const completeCleanCheck = events.length > 0 && chainCheck.valid && detailed.every((event) => {
    const checks = [event.payloadHash.status, event.canonicalPayload.status, event.previousHash.status, event.chainHash.status,
      ...Object.values(event.verification).map((check) => check.status)];
    return checks.every((status) => status === "PASSED" || status === "NOT_APPLICABLE");
  });
  return {
    generatedAt: new Date().toISOString(), source: "ON_DEMAND",
    completeCleanCheck,
    chain: { status: chainCheck.valid ? "PASSED" : "FAILED", checkedEvents: chainCheck.checkedEvents, legacyEvents: chainCheck.legacyEvents, errors: chainCheck.errors },
    anchors: detailed,
    limitations: [
      "An on-chain batch commitment can identify a mismatching batch, but it cannot identify one changed event inside a consistently rewritten batch.",
      "Field differences compare current indexed event columns with the current canonical payload; they are not an independent historical copy.",
      "Pre-anchor changes and consistent rewrites before anchoring cannot be detected by the later commitment.",
      "Database audit and alert records remain in PostgreSQL and are not an independent tamper-proof log.",
    ],
  };
}

function canonicalFieldDifferences(observedPayload: string, expectedPayload: string) {
  try {
    const observed = JSON.parse(observedPayload) as Record<string, unknown>;
    const expected = JSON.parse(expectedPayload) as Record<string, unknown>;
    return [...new Set([...Object.keys(observed), ...Object.keys(expected)])]
      .filter((field) => JSON.stringify(observed[field]) !== JSON.stringify(expected[field]))
      .map((field) => ({ field, observed: observed[field] ?? null, expected: expected[field] ?? null }));
  } catch {
    return [{ field: "canonicalPayload", observed: "Invalid JSON", expected: "Canonical JSON" }];
  }
}
