import { snakeToCamel, snakeToCamelKey } from "../src/utils/case-converter";

describe("snakeToCamelKey", () => {
  it("leaves camelCase keys untouched", () => {
    expect(snakeToCamelKey("policyId")).toBe("policyId");
    expect(snakeToCamelKey("foo")).toBe("foo");
  });

  it("converts simple snake_case", () => {
    expect(snakeToCamelKey("policy_id")).toBe("policyId");
    expect(snakeToCamelKey("coverage_amount")).toBe("coverageAmount");
    expect(snakeToCamelKey("tx_hash")).toBe("txHash");
  });

  it("handles multiple underscores", () => {
    expect(snakeToCamelKey("very_long_snake_name")).toBe("veryLongSnakeName");
  });

  it("preserves leading underscore", () => {
    expect(snakeToCamelKey("_internal_field")).toBe("_internal_field");
  });

  it("handles digits after underscore", () => {
    expect(snakeToCamelKey("policy_2_id")).toBe("policy2Id");
  });
});

describe("snakeToCamel (recursive)", () => {
  it("returns primitives as-is", () => {
    expect(snakeToCamel(1)).toBe(1);
    expect(snakeToCamel("foo")).toBe("foo");
    expect(snakeToCamel(true)).toBe(true);
    expect(snakeToCamel(null)).toBe(null);
    expect(snakeToCamel(undefined)).toBe(undefined);
  });

  it("converts top-level snake keys to camel", () => {
    const out = snakeToCamel<{ policyId: string; coverageAmount: string }>({
      policy_id: "1",
      coverage_amount: "100000000",
    });
    expect(out).toEqual({ policyId: "1", coverageAmount: "100000000" });
  });

  it("recurses into nested objects", () => {
    const out = snakeToCamel<{ triggerData: { firedAt: number } }>({
      trigger_data: { fired_at: 1700000000 },
    });
    expect(out).toEqual({ triggerData: { firedAt: 1700000000 } });
  });

  it("maps arrays element-wise", () => {
    const out = snakeToCamel<Array<{ policyId: string }>>([
      { policy_id: "1" },
      { policy_id: "2" },
    ]);
    expect(out).toEqual([{ policyId: "1" }, { policyId: "2" }]);
  });

  it("is idempotent — camelCase input stays camelCase", () => {
    const input = { policyId: "1", coverageAmount: "100000000" };
    expect(snakeToCamel(input)).toEqual(input);
  });

  it("preserves Date instances unchanged", () => {
    const d = new Date("2026-05-07T00:00:00Z");
    expect(snakeToCamel(d)).toBe(d);
  });

  it("normalizes a realistic Policy row", () => {
    const apiRow = {
      id: 17,
      product_id: "0xabc",
      policy_id: 3,
      buyer: "0xface",
      coverage_amount: "100000000",
      premium_paid: "900000",
      tx_hash: "0xfeed",
      submitted_by: 1,
      created_at: 1778093417000,
    };
    const out = snakeToCamel<Record<string, unknown>>(apiRow);
    expect(out).toEqual({
      id: 17,
      productId: "0xabc",
      policyId: 3,
      buyer: "0xface",
      coverageAmount: "100000000",
      premiumPaid: "900000",
      txHash: "0xfeed",
      submittedBy: 1,
      createdAt: 1778093417000,
    });
  });
});
