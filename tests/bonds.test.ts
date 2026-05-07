import { LuminaClient } from "../src";

describe("BondsAPI.list — wallet auto-injection", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("auto-injects wallet from /auth/me when called without args", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (String(url).endsWith("/api/v1/auth/me")) {
        return new Response(
          JSON.stringify({ wallet: "0xAaa", apiKeyPrefix: "lk_a1b2c3d4", tier: "free" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      // Any subsequent call for bonds — return empty bond list
      return new Response(
        JSON.stringify({ wallet: "0xAaa", totalBonds: 0, bonds: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    const bonds = await c.bonds.list();
    expect(bonds).toEqual([]);
    // 1st call: /auth/me. 2nd call: /api/v1/bonds/0xAaa.
    expect(calls.length).toBe(2);
    expect(calls[0]).toMatch(/\/api\/v1\/auth\/me$/);
    expect(calls[1]).toMatch(/\/api\/v1\/bonds\/0xAaa$/);
  });

  it("preserves back-compat with explicit { wallet }", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ wallet: "0xBbb", totalBonds: 0, bonds: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    await c.bonds.list({ wallet: "0xBbb" });
    // Only 1 call — no /auth/me round-trip when wallet is explicit.
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatch(/\/api\/v1\/bonds\/0xBbb$/);
  });

  it("getMyWallet caches across calls (one /auth/me per client)", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (String(url).endsWith("/api/v1/auth/me")) {
        return new Response(
          JSON.stringify({ wallet: "0xCcc", apiKeyPrefix: "lk_aaaaaaaa", tier: "free" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ wallet: "0xCcc", totalBonds: 0, bonds: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    await c.bonds.list();
    await c.bonds.list();
    await c.bonds.list();

    const authMeCalls = calls.filter((u) => u.endsWith("/api/v1/auth/me"));
    expect(authMeCalls.length).toBe(1);
    const bondsCalls = calls.filter((u) => /\/api\/v1\/bonds\//.test(u));
    expect(bondsCalls.length).toBe(3);
  });

  it("throws a clear LuminaError when /auth/me is unavailable (404)", async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/api/v1/auth/me")) {
        return new Response(
          JSON.stringify({ error: "not_found", code: "not_found", message: "Route not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error("should not reach bonds endpoint");
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    await expect(c.bonds.list()).rejects.toMatchObject({
      name: "LuminaError",
      status: 404,
    });
  });

  it("normalizes snake_case bond rows to camelCase", async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/api/v1/auth/me")) {
        return new Response(
          JSON.stringify({ wallet: "0xDdd", apiKeyPrefix: "lk_xx", tier: "free" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          wallet: "0xDdd",
          totalBonds: 1,
          bonds: [
            {
              bond_id: "202805",
              owner: "0xDdd",
              amount: "50",
              face_value_usdc: "50000000",
              maturity_epoch: 12345,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    const bonds = await c.bonds.list();
    expect(bonds).toHaveLength(1);
    expect(bonds[0]).toMatchObject({
      bondId: "202805",
      owner: "0xDdd",
      amount: "50",
      faceValueUsdc: "50000000",
      maturityEpoch: 12345,
    });
  });
});
