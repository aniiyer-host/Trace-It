import crypto from "crypto";
import { verifyRazorpaySignature } from "../src/services/donationService";

describe("verifyRazorpaySignature configuration", () => {
  const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

  afterEach(() => {
    if (originalKeySecret === undefined) {
      delete process.env.RAZORPAY_KEY_SECRET;
      return;
    }

    process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
  });

  it("rejects signature verification without an explicit secret", () => {
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(() =>
      verifyRazorpaySignature("order_1", "payment_1", "signature"),
    ).toThrow("Missing required environment variable: RAZORPAY_KEY_SECRET");
  });

  it("uses the configured secret for signature verification", () => {
    process.env.RAZORPAY_KEY_SECRET = "test-razorpay-secret";
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update("order_1|payment_1")
      .digest("hex");

    expect(
      verifyRazorpaySignature("order_1", "payment_1", signature),
    ).toBe(true);
  });
});
