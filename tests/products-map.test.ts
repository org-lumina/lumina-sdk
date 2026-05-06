import { keccak256, toUtf8Bytes } from "ethers";
import {
  PRODUCT_ASSET_MAP,
  getExpectedAsset,
  getExpectedAssetFromProductId,
  getProductIdFromName,
} from "../src/products-map";
import { LuminaClient } from "../src";

describe("products-map", () => {
  it("covers all 9 deployed shields", () => {
    expect(Object.keys(PRODUCT_ASSET_MAP)).toHaveLength(9);
  });

  it.each([
    ["FLASHBTC1H-001", "BTC"],
    ["FLASHBTC4H-001", "BTC"],
    ["FLASHBTC24-001", "BTC"],
    ["FLASHBTC48-001", "BTC"],
    ["FLASHETH1H-001", "ETH"],
    ["FLASHETH24-001", "ETH"],
    ["FLASHETH48-001", "ETH"],
    ["MICRODEPEG-001", "USDT"],
    ["RATESHOCK-001", "USDC"],
  ])("getExpectedAsset(%s) = %s", (name, asset) => {
    expect(getExpectedAsset(name)).toBe(asset);
  });

  it("reverse-resolves asset from on-chain productId hash", () => {
    const productId = keccak256(toUtf8Bytes("FLASHBTC24-001"));
    expect(getExpectedAssetFromProductId(productId)).toBe("BTC");
    // Mixed case is normalized.
    expect(getExpectedAssetFromProductId(productId.toUpperCase())).toBe("BTC");
  });

  it("getProductIdFromName matches on-chain registry hash for FLASHBTC1H-001", () => {
    // This hex is read from the live `/products` endpoint and is the canonical
    // productId the CoverRouter accepts. If keccak ever drifts (e.g. extra
    // whitespace in the name), this assertion catches it.
    expect(getProductIdFromName("FLASHBTC1H-001")).toBe(
      "0xe87625ef7415a58c92f2639b16d176521429aac002386dddf1e47e419dfeaddd"
    );
  });

  it("throws on unknown product name", () => {
    expect(() => getExpectedAsset("UNKNOWN-001")).toThrow(/Unknown product/);
    expect(() => getProductIdFromName("UNKNOWN-001")).toThrow(/Unknown product/);
  });

  it("throws on unknown productId hash", () => {
    expect(() => getExpectedAssetFromProductId("0x" + "0".repeat(64))).toThrow(
      /Unknown productId/
    );
  });
});

describe("PoliciesAPI.purchase auto-resolve", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockOk(): { captured: () => unknown } {
    let body: unknown;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = init?.body ? JSON.parse(String(init.body)) : null;
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
    return { captured: () => body };
  }

  it("auto-resolves asset='BTC' when productName is FLASHBTC1H-001", async () => {
    const m = mockOk();
    const c = new LuminaClient({ apiKey: "lk_test" });
    await c.policies.purchase({
      productName: "FLASHBTC1H-001",
      buyer: "0x" + "a".repeat(40),
      coverageAmount: "1000000",
    });
    const sent = m.captured() as { asset: string; productId: string };
    expect(sent.asset).toBe(
      "0x4254430000000000000000000000000000000000000000000000000000000000"
    );
    expect(sent.productId).toBe(
      "0xe87625ef7415a58c92f2639b16d176521429aac002386dddf1e47e419dfeaddd"
    );
  });

  it("auto-resolves asset='USDT' when productName is MICRODEPEG-001", async () => {
    const m = mockOk();
    const c = new LuminaClient({ apiKey: "lk_test" });
    await c.policies.purchase({
      productName: "MICRODEPEG-001",
      buyer: "0x" + "a".repeat(40),
      coverageAmount: "1000000",
    });
    const sent = m.captured() as { asset: string };
    expect(sent.asset).toBe(
      "0x5553445400000000000000000000000000000000000000000000000000000000"
    );
  });

  it("reverse-resolves asset from productId hash when productName is omitted", async () => {
    const m = mockOk();
    const c = new LuminaClient({ apiKey: "lk_test" });
    await c.policies.purchase({
      productId: "0x6cedbccfc3dc131aec7bdd9a9761ac0a8e665daa87763328ffca700f9b678915",
      buyer: "0x" + "a".repeat(40),
      coverageAmount: "1000000",
    });
    const sent = m.captured() as { asset: string };
    // FLASHETH1H-001 → ETH
    expect(sent.asset).toBe(
      "0x4554480000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("explicit asset override beats auto-resolve", async () => {
    const m = mockOk();
    const c = new LuminaClient({ apiKey: "lk_test" });
    await c.policies.purchase({
      productName: "FLASHBTC1H-001",
      buyer: "0x" + "a".repeat(40),
      coverageAmount: "1000000",
      asset: "USDC", // wrong, but caller insists
    });
    const sent = m.captured() as { asset: string };
    expect(sent.asset).toBe(
      "0x5553444300000000000000000000000000000000000000000000000000000000"
    );
  });

  it("throws when neither productId nor productName is supplied", async () => {
    const c = new LuminaClient({ apiKey: "lk_test" });
    await expect(
      c.policies.purchase({
        buyer: "0x" + "a".repeat(40),
        coverageAmount: "1000000",
      })
    ).rejects.toThrow(TypeError);
  });
});
