import { LuminaClient } from "../src";

describe("PoliciesAPI.purchase", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("encodes asset='USDC' to bytes32 on the wire", async () => {
    let captured: { url: string; body: unknown } | undefined;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null };
      return new Response(
        JSON.stringify({
          ok: true,
          txHash: "0xfeed",
          blockNumber: 1,
          policyId: "1",
          buyer: "0x" + "a".repeat(40),
          productId: "0x" + "1".repeat(64),
          coverageAmount: "1000000",
          premiumPaid: "10000",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    const r = await c.policies.purchase({
      productId: "0x" + "1".repeat(64),
      buyer: "0x" + "a".repeat(40),
      coverageAmount: "1000000",
      asset: "USDC",
    });

    expect(r.policyId).toBe("1");
    expect(captured?.url).toMatch(/\/api\/v1\/policies$/);
    expect((captured?.body as { asset: string }).asset).toBe(
      "0x5553444300000000000000000000000000000000000000000000000000000000"
    );
  });

  it("passes through a 32-byte hex asset unchanged", async () => {
    let captured: unknown;
    const customAsset = "0x" + "9".repeat(64);
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(
        JSON.stringify({
          ok: true,
          txHash: "0x",
          blockNumber: null,
          policyId: "0",
          buyer: "",
          productId: "",
          coverageAmount: "0",
          premiumPaid: "0",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    await c.policies.purchase({
      productId: "0x" + "1".repeat(64),
      buyer: "0x" + "a".repeat(40),
      coverageAmount: "1000",
      asset: customAsset,
    });
    expect((captured as { asset: string }).asset).toBe(customAsset);
  });

  it("rejects an invalid asset shape", async () => {
    const c = new LuminaClient({ apiKey: "lk_test" });
    await expect(
      c.policies.purchase({
        productId: "0x" + "1".repeat(64),
        buyer: "0x" + "a".repeat(40),
        coverageAmount: "1",
        asset: "this string is way longer than 31 characters and is not hex",
      })
    ).rejects.toThrow(TypeError);
  });

  it("forwards Idempotency-Key header when supplied", async () => {
    let captured: Headers | undefined;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          ok: true,
          txHash: "0x",
          blockNumber: null,
          policyId: "1",
          buyer: "",
          productId: "",
          coverageAmount: "0",
          premiumPaid: "0",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    await c.policies.purchase({
      productId: "0x" + "1".repeat(64),
      buyer: "0x" + "a".repeat(40),
      coverageAmount: "1",
      asset: "USDC",
      idempotencyKey: "abc-123",
    });
    expect(captured?.get("idempotency-key")).toBe("abc-123");
    expect(captured?.get("x-api-key")).toBe("lk_test");
  });
});

describe("PoliciesAPI.list — wallet auto-injection + casing normalize", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("auto-resolves wallet via /auth/me and normalizes snake_case rows", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (String(url).endsWith("/api/v1/auth/me")) {
        return new Response(
          JSON.stringify({ wallet: "0xWallet", apiKeyPrefix: "lk_x", tier: "free" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          owner: "0xWallet",
          count: 2,
          policies: [
            {
              id: 17,
              product_id: "0xabc",
              policy_id: 3,
              buyer: "0xWallet",
              coverage_amount: "100000000",
              premium_paid: "900000",
              tx_hash: "0xfeed",
              created_at: 1778093417000,
            },
            {
              id: 18,
              product_id: "0xdef",
              policy_id: 4,
              buyer: "0xWallet",
              coverage_amount: "150000000",
              premium_paid: "1200000",
              tx_hash: "0xbeef",
              created_at: 1778093427000,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    const policies = await c.policies.list();
    expect(policies).toHaveLength(2);
    // Casing normalized
    expect(policies[0]).toMatchObject({
      productId: "0xabc",
      policyId: 3,
      coverageAmount: "100000000",
      premiumPaid: "900000",
      txHash: "0xfeed",
      createdAt: 1778093417000,
    });
    // Snake_case original keys are NOT preserved
    expect((policies[0] as unknown as Record<string, unknown>).policy_id).toBeUndefined();
    expect((policies[0] as unknown as Record<string, unknown>).coverage_amount).toBeUndefined();
    // /auth/me hit + /policies hit
    expect(calls.length).toBe(2);
    expect(calls[0]).toMatch(/\/api\/v1\/auth\/me$/);
    expect(calls[1]).toMatch(/\/api\/v1\/policies\?owner=0xWallet$/);
  });

  it("preserves back-compat with explicit { wallet }", async () => {
    let captured: string | undefined;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      captured = String(url);
      return new Response(
        JSON.stringify({ owner: "0xExplicit", count: 0, policies: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "lk_test" });
    const out = await c.policies.list({ wallet: "0xExplicit" });
    expect(out).toEqual([]);
    expect(captured).toMatch(/\/api\/v1\/policies\?owner=0xExplicit$/);
  });
});
