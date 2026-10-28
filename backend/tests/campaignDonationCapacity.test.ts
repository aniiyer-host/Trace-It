import { remainingCampaignAmount } from "../src/utils/money.js";

describe("campaign donation capacity", () => {
  it("uses existing raised funds without double-counting successful donation rows", () => {
    expect(remainingCampaignAmount("100000.00", "75000.00", "75000.00", "0.00").toFixed(2)).toBe("25000.00");
  });

  it("adds initiated reservations to the recorded raised amount", () => {
    expect(remainingCampaignAmount("100000.00", "75000.00", "0.00", "20000.00").toFixed(2)).toBe("5000.00");
  });

  it("takes the larger successful total and then adds pending orders", () => {
    expect(remainingCampaignAmount("100000.00", "50000.00", "76000.00", "10000.00").toFixed(2)).toBe("14000.00");
  });

  it("never returns negative capacity for a fully funded campaign", () => {
    expect(remainingCampaignAmount("100000.00", "102000.00", "100000.00", "100.00").toFixed(2)).toBe("0.00");
  });
});
