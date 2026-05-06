import type { Product } from "../src/types";

describe("Product type (0.4.0 fields)", () => {
  it("accepts the legacy fields with the new optional fields omitted", () => {
    const p: Product = {
      productId: "0x" + "1".repeat(64),
      name: "FLASHBTC1H-001",
      displayName: "Flash BTC 1h",
      shield: "0x" + "a".repeat(40),
      payoutRatioBps: 10_000,
      triggerProbBps: 500,
      marginBps: 100,
      durationSeconds: 3_600,
      active: true,
    };
    expect(p.coveredAsset).toBeUndefined();
    expect(p.paymentAsset).toBeUndefined();
    expect(p.coverageDescription).toBeUndefined();
  });

  it("accepts the new optional fields with valid literal values", () => {
    const p: Product = {
      productId: "0x" + "2".repeat(64),
      name: "FLASHBTC1H-001",
      displayName: "Flash BTC 1h",
      shield: "0x" + "b".repeat(40),
      payoutRatioBps: 10_000,
      triggerProbBps: 500,
      marginBps: 100,
      durationSeconds: 3_600,
      active: true,
      coveredAsset: "BTC",
      paymentAsset: "USDC",
      coverageDescription:
        "Insures BTC against rapid price crashes within 1 hour",
    };
    expect(p.coveredAsset).toBe("BTC");
    expect(p.paymentAsset).toBe("USDC");
    expect(p.coverageDescription).toMatch(/BTC/);
  });

  it("accepts each documented coveredAsset literal", () => {
    const assets: Array<NonNullable<Product["coveredAsset"]>> = [
      "USDC",
      "USDT",
      "BTC",
      "ETH",
    ];
    // If any of the four literals is rejected by the type, this file fails
    // to compile under tsc.
    expect(assets).toHaveLength(4);
  });

  it("paymentAsset is constrained to the literal 'USDC'", () => {
    const payment: NonNullable<Product["paymentAsset"]> = "USDC";
    expect(payment).toBe("USDC");
  });

  it("survives JSON round-trip preserving the new fields", () => {
    const p: Product = {
      productId: "0x" + "3".repeat(64),
      name: "MICRODEPEG-001",
      displayName: "Micro Depeg",
      shield: "0x" + "c".repeat(40),
      payoutRatioBps: 10_000,
      triggerProbBps: 250,
      marginBps: 100,
      durationSeconds: 86_400,
      active: true,
      coveredAsset: "USDT",
      paymentAsset: "USDC",
      coverageDescription: "Insures against USDT losing its peg to $1.00",
    };
    const round = JSON.parse(JSON.stringify(p)) as Product;
    expect(round.coveredAsset).toBe("USDT");
    expect(round.paymentAsset).toBe("USDC");
    expect(round.coverageDescription).toMatch(/peg/);
  });
});
