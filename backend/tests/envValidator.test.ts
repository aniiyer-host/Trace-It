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
      "Missing required production environment variables: JWT_REFRESH_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_FROM, AES_DOCUMENT_KEY",
    );
  });

  it("accepts production configuration with all required secrets", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "access-secret",
        JWT_REFRESH_SECRET: "refresh-secret",
        RAZORPAY_KEY_ID: "rzp_test_key",
        RAZORPAY_KEY_SECRET: "razorpay-secret",
        RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
        GMAIL_USER: "sender@gmail.com",
        GMAIL_APP_PASSWORD: "gmail-app-password",
        EMAIL_FROM: "Trace-It <noreply@example.org>",
        AES_DOCUMENT_KEY: "a".repeat(64),
      }),
    ).not.toThrow();
  });

  it("does not require production secrets outside production", () => {
    expect(() => validateEnvironment({ NODE_ENV: "test" })).not.toThrow();
  });

  it("rejects invalid Gmail SMTP credentials in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "access-secret",
        JWT_REFRESH_SECRET: "refresh-secret",
        RAZORPAY_KEY_ID: "rzp_test_key",
        RAZORPAY_KEY_SECRET: "razorpay-secret",
        RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
        GMAIL_USER: "not-an-email",
        GMAIL_APP_PASSWORD: "app-password",
        EMAIL_FROM: "Trace-It <noreply@example.org>",
        AES_DOCUMENT_KEY: "a".repeat(64),
      }),
    ).toThrow("GMAIL_USER must be a valid email address for Gmail SMTP");
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
