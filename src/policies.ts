import { encodeBytes32String, isHexString } from "ethers";
import type { LuminaClient } from "./client";
import type { Policy, PurchasePolicyParams, PurchaseReceipt } from "./types";

export class PoliciesAPI {
  constructor(private readonly client: LuminaClient) {}

  /**
   * List the calling wallet's policies. The API filters by `req.agent.wallet`
   * server-side; cross-wallet listing is forbidden (403).
   */
  async list(): Promise<Policy[]> {
    const r = await this.client.fetch("/api/v1/policies");
    const body = (await r.json()) as { count: number; policies: Policy[]; owner: string };
    return body.policies;
  }

  /**
   * Read one policy by its (productId, policyId) composite key. Public —
   * no API key required.
   */
  async get(productId: string, policyId: string | number | bigint): Promise<Policy> {
    const r = await this.client.fetch(
      `/policies/${encodeURIComponent(productId)}/${encodeURIComponent(String(policyId))}`
    );
    return (await r.json()) as Policy;
  }

  /**
   * Purchase a policy via the relayer. Premium is charged in the asset
   * specified (USDC by default); the relayer pays gas.
   *
   * `params.asset` accepts either the symbol `"USDC"` (encoded to bytes32
   * for you) or a literal 32-byte hex string.
   */
  async purchase(params: PurchasePolicyParams): Promise<PurchaseReceipt> {
    const asset = normalizeAssetBytes32(params.asset);
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) headers["Idempotency-Key"] = params.idempotencyKey;

    const r = await this.client.fetch("/api/v1/policies", {
      method: "POST",
      headers,
      body: JSON.stringify({
        productId: params.productId,
        coverageAmount: params.coverageAmount,
        asset,
        buyer: params.buyer,
      }),
    });
    const body = (await r.json()) as { ok: boolean } & PurchaseReceipt;
    // The route returns { ok, txHash, blockNumber, policyId, buyer, productId,
    // coverageAmount, premiumPaid } — return the receipt fields.
    const { ok: _ok, ...receipt } = body;
    return receipt as PurchaseReceipt;
  }
}

/**
 * Normalize the SDK-friendly asset input to the bytes32 hex string the API
 * expects on the wire.
 */
function normalizeAssetBytes32(asset: string): string {
  if (asset === "USDC") return encodeBytes32String("USDC");
  if (isHexString(asset, 32)) return asset;
  // Best-effort: treat any other ≤31-char ASCII string as a symbol that
  // should be padded out to bytes32. Avoids a footgun where `"USDC.e"` would
  // otherwise be passed through as-is.
  if (asset.length > 0 && asset.length <= 31) return encodeBytes32String(asset);
  throw new TypeError(
    `Invalid asset: expected "USDC", a ≤31-char symbol, or a 32-byte hex string. Got: ${asset}`
  );
}
