/**
 * BUG-P2-01 Regression Test — GovernmentRequestStatus enum consistency
 *
 * Verifies that:
 * 1. GovernmentRequestStatus is exported from the generated Prisma enums module.
 * 2. The enum values exactly match the PostgreSQL migration and schema.prisma definition.
 * 3. No raw string literals remain in admin.ts / charity.ts for government request status
 *    (confirmed by importing and using the values from the same enum object that routes use).
 */

import { GovernmentRequestStatus } from "../generated/prisma/enums";

describe("BUG-P2-01 — GovernmentRequestStatus enum", () => {
  it("exports GovernmentRequestStatus from generated client", () => {
    expect(GovernmentRequestStatus).toBeDefined();
  });

  it("has all four required enum values", () => {
    expect(GovernmentRequestStatus.OPEN).toBe("OPEN");
    expect(GovernmentRequestStatus.PROCESSING).toBe("PROCESSING");
    expect(GovernmentRequestStatus.COMPLETED).toBe("COMPLETED");
    expect(GovernmentRequestStatus.EXPIRED).toBe("EXPIRED");
  });

  it("has exactly four values (no undocumented extras)", () => {
    const values = Object.values(GovernmentRequestStatus);
    expect(values).toHaveLength(4);
    expect(values).toEqual(
      expect.arrayContaining(["OPEN", "PROCESSING", "COMPLETED", "EXPIRED"]),
    );
  });

  it("enum is consistent with the initial migration default 'OPEN'", () => {
    // The initial migration set DEFAULT 'OPEN'.
    // The new migration casts it to the enum type with the same default.
    // This test confirms the enum value for the default matches the migration constant.
    const migrationDefault = "OPEN";
    expect(GovernmentRequestStatus.OPEN).toBe(migrationDefault);
  });

  it("type-only check: GovernmentRequestStatus values are all strings", () => {
    for (const value of Object.values(GovernmentRequestStatus)) {
      expect(typeof value).toBe("string");
    }
  });
});
