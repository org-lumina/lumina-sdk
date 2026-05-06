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
