import type { Connection } from "@solana/web3.js";
import {
  createRateLimitAwareFetch,
  createSolanaConnection,
  waitForSignatureConfirmation,
} from "../src/services/solanaRpc.js";

describe("Solana RPC retry and confirmation policy", () => {
  it("uses bounded jittered retries and honors Retry-After", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const sleep = jest.fn(async (_milliseconds: number) => undefined);
    const fetch = createRateLimitAwareFetch({ fetchImpl: fetchImpl as typeof globalThis.fetch, sleep, random: () => 0 });

    const response = await fetch("https://rpc.example", { method: "POST" });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("stops after the bounded retry budget when the provider keeps returning 429", async () => {
    const fetchImpl = jest.fn(async () => new Response("busy", { status: 429 }));
    const sleep = jest.fn(async (_milliseconds: number) => undefined);
    const fetch = createRateLimitAwareFetch({ fetchImpl: fetchImpl as typeof globalThis.fetch, sleep, random: () => 0.5 });

    const response = await fetch("https://rpc.example", { method: "POST" });

    expect(response.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([500, 1_000, 2_000]);
  });

  it("does not retry before a Retry-After value outside the bounded window", async () => {
    const fetchImpl = jest.fn(async () => new Response("busy", { status: 429, headers: { "retry-after": "60" } }));
    const sleep = jest.fn(async (_milliseconds: number) => undefined);
    const fetch = createRateLimitAwareFetch({ fetchImpl: fetchImpl as typeof globalThis.fetch, sleep });

    const response = await fetch("https://rpc.example", { method: "POST" });

    expect(response.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("creates a connection for the configured Devnet endpoint", () => {
    const connection = createSolanaConnection("https://api.devnet.solana.com", "confirmed");
    expect(connection.rpcEndpoint).toBe("https://api.devnet.solana.com");
  });

  it("confirms over HTTP status polling without calling confirmTransaction", async () => {
    const confirmTransaction = jest.fn();
    const getSignatureStatuses = jest.fn().mockResolvedValue({
      context: { slot: 1 },
      value: [{ err: null, confirmationStatus: "finalized" }],
    });
    const connection = { confirmTransaction, getSignatureStatuses } as unknown as Connection;

    await expect(waitForSignatureConfirmation(connection, "sig", "confirmed")).resolves.toEqual({ err: null });
    expect(getSignatureStatuses).toHaveBeenCalledWith(["sig"], { searchTransactionHistory: true });
    expect(confirmTransaction).not.toHaveBeenCalled();
  });

  it("accepts only finalized when the requested commitment is finalized", async () => {
    const connection = {
      getSignatureStatuses: jest.fn().mockResolvedValue({
        context: { slot: 1 },
        value: [{ err: null, confirmationStatus: "confirmed" }],
      }),
    } as unknown as Connection;
    let now = 0;

    await expect(waitForSignatureConfirmation(connection, "sig", "finalized", {
      pollIntervalMs: 1,
      timeoutMs: 2,
      sleep: async () => { now += 2; },
      now: () => now,
      random: () => 0.5,
    })).rejects.toThrow("did not reach finalized confirmation before timeout");
  });
});
