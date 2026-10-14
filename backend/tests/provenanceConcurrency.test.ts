import { prisma } from "../src/db/prisma.js";
import {
  acquireProvenanceChainLock,
  verifyProvenanceChain,
} from "../src/services/provenanceChainService.js";

describe("PostgreSQL provenance chain lock", () => {
  it("verifies database provenance records without changing them", async () => {
    const verification = await verifyProvenanceChain();

    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  it("returns a Prisma-compatible result and serializes competing transactions", async () => {
    let releaseFirst!: () => void;
    let signalFirstAcquired!: () => void;
    let signalSecondAttempting!: () => void;
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstAcquired = new Promise<void>((resolve) => {
      signalFirstAcquired = resolve;
    });
    const secondAttempting = new Promise<void>((resolve) => {
      signalSecondAttempting = resolve;
    });
    let secondPid = 0;

    try {
      const firstTransaction = prisma.$transaction(async (tx) => {
        await acquireProvenanceChainLock(tx);
        await acquireProvenanceChainLock(tx);
        signalFirstAcquired();
        await holdFirst;
      });
      await firstAcquired;

      const secondTransaction = prisma.$transaction(async (tx) => {
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid()::int AS pid
        `;
        secondPid = pid;
        signalSecondAttempting();
        await acquireProvenanceChainLock(tx);
      });
      await secondAttempting;

      let observedAdvisoryWait = false;
      const deadline = Date.now() + 5000;
      while (!observedAdvisoryWait && Date.now() < deadline) {
        const waitState = await prisma.$queryRaw<
          Array<{ wait_event_type: string | null; wait_event: string | null }>
        >`
          SELECT wait_event_type, wait_event
          FROM pg_stat_activity
          WHERE pid = ${secondPid}
        `;
        observedAdvisoryWait =
          waitState[0]?.wait_event_type === "Lock" &&
          waitState[0]?.wait_event === "advisory";
        if (!observedAdvisoryWait) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      releaseFirst();
      await Promise.all([firstTransaction, secondTransaction]);

      expect(observedAdvisoryWait).toBe(true);
    } finally {
      releaseFirst();
    }
  }, 15000);
});
