import { buildReceiptHtml, isReceiptEligible } from "../src/services/receiptService.js";

describe("donation receipt presentation", () => {
  it("only allows a receipt after payment success", () => {
    expect(isReceiptEligible("INITIATED")).toBe(false);
    expect(isReceiptEligible("FAILED")).toBe(false);
    expect(isReceiptEligible("SUCCESS")).toBe(true);
  });

  const baseReceipt = {
    donorName: "A Donor",
    ngoName: "A Registered NGO",
    registrationNo: "NGO-123",
    amountInr: "25000.00",
    currencyCode: "INR",
    paymentMethod: "UPI",
    paymentReference: "pay_verified_123",
    orderReference: "order_verified_123",
    blockchainSignature: "verified-solana-signature",
    blockchainExplorerUrl: "https://explorer.solana.com/tx/verified-solana-signature?cluster=devnet",
    createdAt: new Date("2026-10-20T12:00:00.000Z"),
    receiptNo: "TI-cmabc123donorref",
    purpose: "Community meals",
    campaignCategory: "Food",
  };

  it("uses the confirmed INR amount and donor-safe reference with actual payment reference", () => {
    const html = buildReceiptHtml(baseReceipt);
    expect(html).toContain("₹25,000.00");
    expect(html).toContain("Currency: INR");
    expect(html).toContain("TI-cmabc123donorref");
    expect(html).toContain("Payment reference: pay_verified_123");
    expect(html).toContain("Order reference: order_verified_123");
    expect(html).toContain('<a href="https://explorer.solana.com/tx/verified-solana-signature?cluster=devnet"');
    expect(html).toContain("Blockchain reference:");
    expect(html).toContain("Campaign category:</strong> Food");
    expect(html).toContain("Rupees Twenty Five Thousand Only");
    expect(html).not.toContain("Donation ID:");
    expect(html).not.toContain("80G Approval Details");
    expect(html).not.toContain("Authorised Signatory");
    expect(html).not.toContain("__________________ Bank");
  });

  it("prints only the persisted payment reference and makes no tax claims", () => {
    const html = buildReceiptHtml({ ...baseReceipt, paymentReference: "pay_sim_abc123" });
    expect(html).toContain("Payment reference: pay_sim_abc123");
    expect(html).not.toContain("80G");
    expect(html).not.toContain("tax exempt");
  });

  it("clearly reports an unavailable blockchain reference without implying verification", () => {
    const html = buildReceiptHtml({
      ...baseReceipt,
      blockchainSignature: null,
      blockchainExplorerUrl: null,
    });
    expect(html).toContain("Blockchain reference unavailable");
    expect(html).not.toContain("verified-solana-signature");
    expect(html).not.toContain("audit root");
  });

  it("formats the disaster category as receipt context, not a standalone label", () => {
    const html = buildReceiptHtml({ ...baseReceipt, campaignCategory: "disaster" });
    expect(html).toContain("Campaign category:</strong> Disaster relief");
    expect(html).not.toContain(">disaster<");
  });

  it("formats the receipt date in India time and respects non-INR currencies", () => {
    const html = buildReceiptHtml({ ...baseReceipt, currencyCode: "USD" });
    expect(html).toContain("Date:</strong> 20 October 2026");
    expect(html).toContain("USD 25000.00");
    expect(html).toContain("$25,000.00");
  });
});
