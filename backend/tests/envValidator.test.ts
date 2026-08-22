import {
  requireEnvironmentVariable,
  validateEnvironment,
} from "../src/utils/envValidator";

describe("validateEnvironment", () => {
  it("fails fast in production when required secrets are missing", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "access-secret",
        JWT_REFRESH_SECRET: "",
      }),
    ).toThrow(
      "Missing required production environment variables: JWT_REFRESH_SECRET, RAZORPAY_WEBHOOK_SECRET",
    );
  });

  it("accepts production configuration with all required secrets", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "access-secret",
        JWT_REFRESH_SECRET: "refresh-secret",
        RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
      }),
    ).not.toThrow();
  });

  it("does not require production secrets outside production", () => {
    expect(() => validateEnvironment({ NODE_ENV: "test" })).not.toThrow();
  });

  it("rejects a missing security-sensitive environment value", () => {
    expect(() =>
      requireEnvironmentVariable("KYC_HMAC_KEY", { KYC_HMAC_KEY: " " }),
    ).toThrow("Missing required environment variable: KYC_HMAC_KEY");
  });

  it("returns a configured security-sensitive environment value", () => {
    expect(
      requireEnvironmentVariable("BLOCKCHAIN_HMAC_SECRET", {
        BLOCKCHAIN_HMAC_SECRET: "configured-hmac-key",
      }),
    ).toBe("configured-hmac-key");
  });
});
