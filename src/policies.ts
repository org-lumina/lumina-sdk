import {
  Contract,
  MaxUint256,
  encodeBytes32String,
  isHexString,
  type ContractTransactionReceipt,
  type Signer,
} from "ethers";
import type { LuminaClient } from "./client";
import type { Policy, PurchasePolicyParams, PurchaseReceipt } from "./types";
import {
  getExpectedAsset,
  getExpectedAssetFromProductId,
  getProductIdFromName,
} from "./products-map";
import { snakeToCamel } from "./utils/case-converter";

/**
 * Minimal ERC-20 ABI fragment used by `ensureAllowance` to read the buyer's
 * current allowance and (when needed) submit `approve(spender, MaxUint256)`.
 * Kept tiny so the SDK doesn't pull in the full OpenZeppelin or USDC ABI.
 */
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

export class PoliciesAPI {
  constructor(private readonly client: LuminaClient) {}

  /**
   * List policies for `wallet`. If `wallet` is omitted, defaults to the
   * wallet associated with the configured API key (resolved once via
   * `GET /api/v1/auth/me` and cached). The API still validates server-side
   * that the requested `wallet` matches the key's wallet — cross-wallet
   * reads return 403 even if explicitly requested.
   *
   * The API returns rows in snake_case (Postgres convention); the SDK
   * normalizes them to the camelCase `Policy` type before returning.
   *
   * @example
   * // 0.5.1+ — auto-resolved from the API key
   * const policies = await lumina.policies.list();
   *
   * @example
   * // back-compat — explicit wallet
   * const policies = await lumina.policies.list({ wallet: "0xabc..." });
   */
  async list(params: { wallet?: string } = {}): Promise<Policy[]> {
    const wallet = params.wallet ?? (await this.client.getMyWallet());
    const r = await this.client.fetch(
      `/api/v1/policies?owner=${encodeURIComponent(wallet)}`
    );
    const body = (await r.json()) as {
      count: number;
      policies: unknown[];
      owner: string;
    };
    return snakeToCamel<Policy[]>(body.policies ?? []);
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
   * [10x10] Ensure the buyer wallet has approved CoverRouter to spend at
   * least `amount` USDC. If the current allowance is already sufficient,
   * no transaction is sent and `null` is returned. Otherwise an
   * `approve(coverRouter, MaxUint256)` is submitted and the wait-mined
   * receipt is returned.
   *
   * The CoverRouter and USDC addresses are resolved from `GET /health`
   * so a redeploy can't desync the SDK from canonical state.
   *
   * @param buyer  Any ethers v6 `Signer` connected to a Base Sepolia provider.
   * @param amount Minimum allowance required (USDC base units, 6-dec). Defaults
   *               to `MaxUint256` if you want to authorize once and forget.
   * @returns The approve tx receipt, or `null` if no approval was necessary.
   */
  async ensureAllowance(
    buyer: Signer,
    amount: bigint = MaxUint256
  ): Promise<ContractTransactionReceipt | null> {
    const health = await this.client.health();
    const usdcAddr = health.contracts.usdc;
    const coverRouterAddr = health.contracts.coverRouter;
    if (!usdcAddr || !coverRouterAddr) {
      throw new Error(
        "ensureAllowance: /health did not return usdc + coverRouter addresses. Are you on a supported network?"
      );
    }
    const buyerAddr = await buyer.getAddress();
    const usdc = new Contract(usdcAddr, ERC20_ABI, buyer);
    const current = (await usdc.allowance(buyerAddr, coverRouterAddr)) as bigint;
    if (current >= amount) return null;
    const tx = await usdc.approve(coverRouterAddr, MaxUint256);
    return (await tx.wait()) as ContractTransactionReceipt;
  }

  /**
   * Purchase a policy via the relayer. The relayer pays gas; the buyer pays
   * the USDC premium. Pass either `productName` (recommended — the SDK then
   * auto-resolves the productId hash AND the per-shield asset literal) or
   * `productId` (advanced — the SDK still auto-resolves the asset from the
   * product's bytes32 hash).
   *
   * The buyer wallet must have approved CoverRouter for at least the
   * premium amount in advance — call `ensureAllowance(buyerSigner, premium)`
   * once per buyer to set this up. Without it, the API returns
   * `400 insufficient_allowance` with the exact approve calldata.
   */
  async purchase(params: PurchasePolicyParams): Promise<PurchaseReceipt> {
    if (!params.productId && !params.productName) {
      throw new TypeError(
        "purchase: must supply productId or productName (productName is preferred — the SDK then auto-resolves both the id hash and the per-shield asset)."
      );
    }
    const productId = params.productId ?? getProductIdFromName(params.productName!);
    // Auto-resolve asset when caller didn't override. Using productName is
    // preferred because the lookup is direct; productId requires a reverse
    // index lookup which still must match a known canonical product.
    const assetSymbol =
      params.asset ??
      (params.productName
        ? getExpectedAsset(params.productName)
        : getExpectedAssetFromProductId(productId));
    const asset = normalizeAssetBytes32(assetSymbol);
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) headers["Idempotency-Key"] = params.idempotencyKey;

    const r = await this.client.fetch("/api/v1/policies", {
      method: "POST",
      headers,
      body: JSON.stringify({
        productId,
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
