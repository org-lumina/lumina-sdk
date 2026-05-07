import { LuminaClient, LuminaError } from "../src";

describe("LuminaClient — construction", () => {
  it("requires apiKey (allows empty string for onboarding)", () => {
    expect(() => new LuminaClient({ apiKey: "" })).not.toThrow();
    // @ts-expect-error — runtime check
    expect(() => new LuminaClient({})).toThrow(TypeError);
  });

  it("defaults to the production base URL", () => {
    const c = new LuminaClient({ apiKey: "test" });
    expect(c).toBeInstanceOf(LuminaClient);
  });

  it("accepts a custom base URL and strips trailing slashes", () => {
    const c = new LuminaClient({ apiKey: "test", baseUrl: "http://localhost:3000//" });
    expect(c).toBeInstanceOf(LuminaClient);
  });
});

describe("LuminaClient — fetch error mapping", () => {
  // We replace the global fetch with a stub for these tests so we don't hit
  // a real network. Restore after.
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps a JSON 4xx response into a LuminaError with code", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "invalid_api_key", message: "bad key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const c = new LuminaClient({ apiKey: "bad" });
    await expect(c.policies.list()).rejects.toMatchObject({
      name: "LuminaError",
      status: 401,
      message: "bad key",
      code: "invalid_api_key",
    });
  });

  it("maps a non-JSON 5xx into a LuminaError with statusText fallback", async () => {
    globalThis.fetch = (async () =>
      new Response("upstream timeout", {
        status: 504,
        statusText: "Gateway Timeout",
        headers: { "Content-Type": "text/plain" },
      })) as typeof fetch;

    const c = new LuminaClient({ apiKey: "x" });
    const err = await c.policies.list().catch((e) => e);
    expect(err).toBeInstanceOf(LuminaError);
    expect((err as LuminaError).status).toBe(504);
  });

  it("wraps network errors as LuminaError with code=network_error", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "x" });
    const err = await c.products.list().catch((e) => e);
    expect(err).toBeInstanceOf(LuminaError);
    expect((err as LuminaError).code).toBe("network_error");
    expect((err as LuminaError).status).toBe(0);
  });
});

describe("LuminaClient.getContracts — runtime address resolution", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const FULL_HEALTH = {
    status: "ok",
    service: "lumina-api",
    version: "0.1.0",
    uptimeSeconds: 1,
    chain: { chainId: 84532, block: 1, rpcConnected: true },
    relayer: { address: "0xrelayer", balanceWei: "0" },
    contracts: {
      coverRouter: "0x" + "1".repeat(40),
      policyManager: "0x" + "2".repeat(40),
      bondVault: "0x" + "3".repeat(40),
      claimBond: "0x" + "4".repeat(40),
      marketplace: "0x" + "5".repeat(40),
      usdc: "0x" + "6".repeat(40),
      luminaToken: "0x" + "7".repeat(40),
    },
  };

  it("returns the seven contract addresses keyed by the canonical names", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return new Response(JSON.stringify(FULL_HEALTH), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "x" });
    const contracts = await c.getContracts();
    expect(contracts).toEqual({
      coverRouter: "0x" + "1".repeat(40),
      policyManager: "0x" + "2".repeat(40),
      bondVault: "0x" + "3".repeat(40),
      claimBond: "0x" + "4".repeat(40),
      marketplace: "0x" + "5".repeat(40),
      usdc: "0x" + "6".repeat(40),
      luminaToken: "0x" + "7".repeat(40),
    });
    expect(callCount).toBe(1);
  });

  it("caches the result — concurrent + serial callers share one /health round-trip", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return new Response(JSON.stringify(FULL_HEALTH), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "x" });
    // 5 concurrent callers
    const [a, b, cc, d, e] = await Promise.all([
      c.getContracts(),
      c.getContracts(),
      c.getContracts(),
      c.getContracts(),
      c.getContracts(),
    ]);
    // 2 more serial after the cache settled
    const f = await c.getContracts();
    const g = await c.getContracts();

    expect(a).toBe(b);
    expect(a).toBe(cc);
    expect(a).toBe(d);
    expect(a).toBe(e);
    expect(a).toBe(f);
    expect(a).toBe(g);
    expect(callCount).toBe(1);
  });

  it("surfaces a clear LuminaError if /health.contracts is missing required keys", async () => {
    const incomplete = {
      ...FULL_HEALTH,
      contracts: { coverRouter: "0x" + "1".repeat(40) }, // missing the other 6
    };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(incomplete), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const c = new LuminaClient({ apiKey: "x" });
    const err = await c.getContracts().catch((e) => e);
    expect(err).toBeInstanceOf(LuminaError);
    expect((err as LuminaError).code).toBe("health_contracts_incomplete");
    expect((err as LuminaError).message).toMatch(/policyManager/);
    expect((err as LuminaError).message).toMatch(/marketplace/);
  });

  it("drops cache on failure so a transient outage doesn't pin permanent failure", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        // First call: simulate /health 503
        return new Response(JSON.stringify({ error: "upstream_down" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Subsequent calls: success
      return new Response(JSON.stringify(FULL_HEALTH), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "x" });
    await expect(c.getContracts()).rejects.toBeInstanceOf(LuminaError);
    // Cache cleared → second call retries.
    const ok = await c.getContracts();
    expect(ok.coverRouter).toBe("0x" + "1".repeat(40));
    expect(calls).toBe(2);
  });
});
