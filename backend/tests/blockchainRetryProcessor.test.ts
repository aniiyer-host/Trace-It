import { getRetryEligibilityFilter } from "../src/services/blockchainRetryProcessor.js";

describe("getRetryEligibilityFilter", () => {
  it("requires both an available retry count and that retry count's backoff interval", () => {
    const now = new Date("2026-08-21T00:00:00.000Z");

    expect(getRetryEligibilityFilter(now, 5, 30_000)).toEqual({
      retryCount: { lt: 5 },
      OR: [
        {
          retryCount: 0,
          lastAttempt: { lte: new Date("2026-08-20T23:59:30.000Z") },
        },
        {
          retryCount: 1,
          lastAttempt: { lte: new Date("2026-08-20T23:59:00.000Z") },
        },
        {
          retryCount: 2,
          lastAttempt: { lte: new Date("2026-08-20T23:58:00.000Z") },
        },
        {
          retryCount: 3,
          lastAttempt: { lte: new Date("2026-08-20T23:56:00.000Z") },
        },
        {
          retryCount: 4,
          lastAttempt: { lte: new Date("2026-08-20T23:52:00.000Z") },
        },
      ],
    });
  });

  it("does not create an eligibility branch for exhausted retry counts", () => {
    const filter = getRetryEligibilityFilter(new Date(), 5, 30_000);

    expect(filter.retryCount).toEqual({ lt: 5 });
    expect(filter.OR).toHaveLength(5);
    expect(filter.OR.some((condition) => condition.retryCount === 5)).toBe(false);
  });
});
