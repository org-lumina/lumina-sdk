import {
  Contract,
  Interface,
  ZeroAddress,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type InterfaceAbi,
  type Log,
  type Signer,
} from "ethers";
import type { LuminaClient } from "../client";
import type { Listing, ListListingsParams } from "../types";
import marketplaceAbiRaw from "../abi/LuminaBondMarketplace.json";
import erc20AbiRaw from "../abi/erc20.json";
import erc1155AbiRaw from "../abi/erc1155.json";

// JSON modules are typed as `readonly unknown[]` under
// `resolveJsonModule:true`; ethers' `InterfaceAbi` accepts the loose JSON
// fragment shape. Cast once here so call sites stay clean.
const marketplaceAbi = marketplaceAbiRaw as unknown as InterfaceAbi;
const erc20Abi = erc20AbiRaw as unknown as InterfaceAbi;
const erc1155Abi = erc1155AbiRaw as unknown as InterfaceAbi;
import type {
  ApproveParams,
  BuyParams,
  CancelParams,
  ListParams,
  MarketplaceStats,
  Trade,
  TxResult,
} from "./types";

/**
 * Truth-table constants (Base Sepolia 84532). Hardcoded because the
 * marketplace contract address is the canonical anchor for the SDK; USDC
 * and ClaimBond addresses can also be discovered via `/health`, with a
 * documented fallback to these constants.
 */
const MARKETPLACE_ADDRESS = "0xfaC56692c626718aC8953A3d5fAE67fac2f1Be6E";
const CLAIM_BOND_ADDRESS = "0x3d2F26B6BBcfDD6c7c1Ad0dE1FE52F22ed2e1730";
/** 1.5% maker + 1.5% taker = 3% round-trip. */
export const MAKER_FEE_BPS = 150;
export const TAKER_FEE_BPS = 150;
/** Anti-spam floor: $1.00 per unit (USDC, 6-dec base units). */
export const MIN_PRICE_PER_UNIT = 1_000_000n;

const MARKETPLACE_IFACE = new Interface(marketplaceAbi);

/**
 * Normalize a `string | bigint | number` input to a positive BigInt,
 * throwing a clear error otherwise.
 */
function toPositiveBigInt(value: string | bigint | number, name: string): bigint {
  let v: bigint;
  try {
    v = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new TypeError(`${name} must be a positive integer-like value, got ${String(value)}`);
  }
  if (v <= 0n) throw new TypeError(`${name} must be > 0, got ${v.toString()}`);
  return v;
}

/**
 * Wait for one confirmation on the given tx response and return the receipt.
 * Throws if the tx reverts. Useful as a small helper so callers don't have to
 * remember to `await tx.wait()` everywhere.
 */
export async function waitForTx(
  tx: ContractTransactionResponse
): Promise<ContractTransactionReceipt> {
  const receipt = await tx.wait(1);
  if (!receipt) {
    throw new Error(`Transaction ${tx.hash} did not produce a receipt`);
  }
  return receipt;
}

/**
 * Parse the `Listed` event from the receipt logs of a `list()` transaction
 * and return the freshly-minted `listingId` as a decimal string.
 *
 * @returns the listingId, or `null` if no `Listed` event was found in the
 *          receipt (indicates either the wrong tx was passed or the log
 *          shape changed).
 */
export function parseListingFromLog(
  receipt: ContractTransactionReceipt
): string | null {
  for (const log of receipt.logs as Log[]) {
    try {
      const parsed = MARKETPLACE_IFACE.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed && parsed.name === "Listed") {
        return (parsed.args.getValue("listingId") as bigint).toString();
      }
    } catch {
      // Not a marketplace log — skip.
    }
  }
  return null;
}

/**
 * Compute the total USDC due from a buyer for a given listing + amount,
 * including the 1.5% taker fee. Useful UI helper to show the user the
 * actual $ they'll pay before they sign.
 *
 * NOTE: The deployed contract `executeBuy(listingId)` purchases the FULL
 * listing — partial fills aren't supported on-chain today. The `amount`
 * parameter is therefore validated client-side against the listing.amount
 * but does not affect the price computation: the buyer always pays the
 * full listing price.
 */
export async function estimateBuyPrice(
  client: LuminaClient,
  listingId: string | bigint,
  amount?: string | bigint
): Promise<{ basePrice: string; takerFeeBps: number; totalDue: string }> {
  const listing = await new MarketplaceAPI(client).listing(listingId);
  if (amount !== undefined) {
    const requested = toPositiveBigInt(amount, "amount");
    const available = BigInt(listing.amount);
    if (requested > available) {
      throw new Error(
        `estimateBuyPrice: requested amount ${requested} exceeds listing amount ${available}`
      );
    }
  }
  const basePrice = BigInt(listing.totalPriceUsdc);
  const takerFee = (basePrice * BigInt(TAKER_FEE_BPS)) / 10_000n;
  const totalDue = basePrice + takerFee;
  return {
    basePrice: basePrice.toString(),
    takerFeeBps: TAKER_FEE_BPS,
    totalDue: totalDue.toString(),
  };
}

/**
 * Resolve marketplace + USDC + ClaimBond addresses. Prefers `/health` so a
 * redeploy can't desync the SDK from canonical state, falls back to the
 * hardcoded constants for offline use.
 */
async function resolveAddresses(
  client: LuminaClient
): Promise<{ marketplace: string; usdc: string; claimBond: string }> {
  try {
    const health = await client.health();
    return {
      marketplace: health.contracts.bondMarketplace ?? MARKETPLACE_ADDRESS,
      usdc: health.contracts.usdc ?? ZeroAddress,
      claimBond: health.contracts.claimBond ?? CLAIM_BOND_ADDRESS,
    };
  } catch {
    return {
      marketplace: MARKETPLACE_ADDRESS,
      usdc: ZeroAddress,
      claimBond: CLAIM_BOND_ADDRESS,
    };
  }
}

/**
 * MarketplaceAPI — secondary-market helpers for ClaimBonds.
 *
 * - Read methods (listings/listing/stats/history/myListings) hit the API.
 * - Write methods (list/buy/cancel/approve/approveBonds) submit on-chain
 *   transactions through the supplied `signer`. They throw if the API was
 *   constructed without a signer.
 *
 * Marketplace contract: `0xfaC56692c626718aC8953A3d5fAE67fac2f1Be6E`
 * (Base Sepolia 84532, UUPS proxy). Fees: 1.5% maker + 1.5% taker.
 */
export class MarketplaceAPI {
  constructor(
    private readonly client: LuminaClient,
    private readonly signer?: Signer
  ) {}

  // ---------------------------------------------------------------- READ ----

  /**
   * Browse active secondary-market listings. Defaults to `price-asc`,
   * limit 50, offset 0.
   *
   * @example
   * const cheap = await client.marketplace.listings({ sortBy: 'price-asc', limit: 5 });
   */
  async listings(params: ListListingsParams = {}): Promise<Listing[]> {
    const qs = new URLSearchParams();
    qs.set("limit", String(params.limit ?? 50));
    qs.set("offset", String(params.offset ?? 0));
    qs.set("sortBy", params.sortBy ?? "price-asc");
    if (params.maxPriceUsdc) qs.set("maxPriceUsdc", params.maxPriceUsdc);

    const r = await this.client.fetch(
      `/api/v1/marketplace/listings?${qs.toString()}`
    );
    const body = (await r.json()) as { count: number; listings: Listing[] };
    return body.listings ?? [];
  }

  /**
   * Fetch a single listing by id. Throws `LuminaError(404)` if not found.
   *
   * @example
   * const l = await client.marketplace.listing(42);
   */
  async listing(listingId: string | bigint): Promise<Listing> {
    const id = listingId.toString();
    const r = await this.client.fetch(
      `/api/v1/marketplace/listings/${encodeURIComponent(id)}`
    );
    return (await r.json()) as Listing;
  }

  /**
   * Aggregate marketplace stats: floor, 24h volume, active listing count,
   * historical volume.
   *
   * @example
   * const s = await client.marketplace.stats();
   * console.log('floor:', s.floor, 'active:', s.totalListings);
   */
  async stats(): Promise<MarketplaceStats> {
    const r = await this.client.fetch("/api/v1/marketplace/stats");
    return (await r.json()) as MarketplaceStats;
  }

  /**
   * Trade history (executed buys) ordered most-recent first.
   *
   * @example
   * const trades = await client.marketplace.history({ limit: 20 });
   */
  async history(
    params: { limit?: number; offset?: number } = {}
  ): Promise<Trade[]> {
    const qs = new URLSearchParams();
    qs.set("limit", String(params.limit ?? 50));
    qs.set("offset", String(params.offset ?? 0));
    const r = await this.client.fetch(
      `/api/v1/marketplace/history?${qs.toString()}`
    );
    const body = (await r.json()) as
      | Trade[]
      | { count?: number; trades?: Trade[] };
    if (Array.isArray(body)) return body;
    return body.trades ?? [];
  }

  /**
   * Listings created by `seller` (any status). If `seller` is omitted the
   * SDK auto-resolves the wallet associated with the configured API key
   * via `GET /api/v1/auth/me`.
   *
   * @example
   * // 0.5.1+ — auto-resolved
   * const mine = await client.marketplace.myListings();
   *
   * @example
   * // back-compat — explicit
   * const mine = await client.marketplace.myListings('0xabc...');
   */
  async myListings(seller?: string): Promise<Listing[]> {
    const sellerWallet = seller ?? (await this.client.getMyWallet());
    const qs = new URLSearchParams();
    qs.set("seller", sellerWallet);
    qs.set("limit", "100");
    const r = await this.client.fetch(
      `/api/v1/marketplace/listings?${qs.toString()}`
    );
    const body = (await r.json()) as { count: number; listings: Listing[] };
    return body.listings ?? [];
  }

  // --------------------------------------------------------------- WRITE ----

  /**
   * Create a new listing for `amount` units of `bondId` at `pricePerUnit`
   * USDC base units per unit. Total on-chain price is `pricePerUnit *
   * amount`. Reverts if the seller hasn't approved the marketplace as an
   * ERC-1155 operator first (call `approveBonds()` once).
   *
   * NOTE: `expiresAt` is informational — the on-chain contract does not
   * enforce expiry today. Listings remain live until cancelled or bought.
   *
   * @returns `{ txHash, blockNumber, listingId }` — listingId is parsed
   *          from the `Listed` event.
   * @example
   * const r = await marketplace.list({
   *   bondId: 202805n, amount: 10n, pricePerUnit: 1_500_000n, expiresAt: 0,
   * });
   * console.log('listed as', r.listingId);
   */
  async list(params: ListParams): Promise<TxResult> {
    const signer = this.requireSigner("list");
    const bondId = toPositiveBigInt(params.bondId, "bondId");
    const amount = toPositiveBigInt(params.amount, "amount");
    const pricePerUnit = toPositiveBigInt(params.pricePerUnit, "pricePerUnit");
    if (pricePerUnit < MIN_PRICE_PER_UNIT) {
      throw new RangeError(
        `list: pricePerUnit ${pricePerUnit} below anti-spam floor ${MIN_PRICE_PER_UNIT} (= $1 USDC)`
      );
    }
    const totalPriceUSDC = pricePerUnit * amount;
    const { marketplace } = await resolveAddresses(this.client);
    const contract = new Contract(marketplace, marketplaceAbi, signer);
    const tx = (await contract.list(
      bondId,
      amount,
      totalPriceUSDC
    )) as ContractTransactionResponse;
    const receipt = await waitForTx(tx);
    const listingId = parseListingFromLog(receipt) ?? undefined;
    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      listingId,
    };
  }

  /**
   * Execute a buy on an active listing. The buyer pays `listing.totalPriceUsdc`
   * + 1.5% taker fee in USDC; the seller receives the price minus a 1.5%
   * maker fee. The buyer must have approved USDC spend first
   * (call `approve({ amount })`).
   *
   * NOTE: the deployed contract purchases the full listing in one call —
   * partial fills are not supported on-chain. `params.amount` is validated
   * client-side against the listing for early failure but is otherwise
   * unused on the wire.
   *
   * @example
   * await marketplace.approve({ amount: estimate.totalDue });
   * const r = await marketplace.buy({ listingId: 42n, amount: 10n });
   */
  async buy(params: BuyParams): Promise<TxResult> {
    const signer = this.requireSigner("buy");
    const listingId = toPositiveBigInt(params.listingId, "listingId");
    toPositiveBigInt(params.amount, "amount"); // validate shape; not sent on wire
    const { marketplace } = await resolveAddresses(this.client);
    const contract = new Contract(marketplace, marketplaceAbi, signer);
    const tx = (await contract.executeBuy(listingId)) as ContractTransactionResponse;
    const receipt = await waitForTx(tx);
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  /**
   * Cancel one of the caller's own listings. Reverts on-chain if the caller
   * is not the original seller (the SDK surfaces the revert reason). The
   * underlying ClaimBond units are returned to the seller's wallet.
   *
   * @example
   * await marketplace.cancel({ listingId: 42n });
   */
  async cancel(params: CancelParams): Promise<TxResult> {
    const signer = this.requireSigner("cancel");
    const listingId = toPositiveBigInt(params.listingId, "listingId");
    const { marketplace } = await resolveAddresses(this.client);
    const contract = new Contract(marketplace, marketplaceAbi, signer);
    const tx = (await contract.cancel(listingId)) as ContractTransactionResponse;
    const receipt = await waitForTx(tx);
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  /**
   * Approve the marketplace to spend USDC on behalf of the caller. NO-OP if
   * the existing allowance is already >= `amount` — in that case `txHash`
   * is the empty string and no transaction is sent. Always sends an exact
   * `approve(marketplace, amount)`; pass `MaxUint256` if you want
   * approve-once semantics.
   *
   * @example
   * await marketplace.approve({ amount: 100_000_000n });
   */
  async approve(params: ApproveParams): Promise<TxResult> {
    const signer = this.requireSigner("approve");
    const amount = toPositiveBigInt(params.amount, "amount");
    const { marketplace, usdc } = await resolveAddresses(this.client);
    if (usdc === ZeroAddress) {
      throw new Error(
        "approve: USDC address could not be resolved from /health. Check baseUrl."
      );
    }
    const owner = await signer.getAddress();
    const usdcContract = new Contract(usdc, erc20Abi, signer);
    const current = (await usdcContract.allowance(owner, marketplace)) as bigint;
    if (current >= amount) {
      return { txHash: "" };
    }
    const tx = (await usdcContract.approve(
      marketplace,
      amount
    )) as ContractTransactionResponse;
    const receipt = await waitForTx(tx);
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  /**
   * Approve the marketplace as an ERC-1155 operator over the caller's
   * ClaimBond holdings. NO-OP if already approved — in that case `txHash`
   * is the empty string and no transaction is sent. Required once per
   * wallet before the first `list()`.
   *
   * @example
   * await marketplace.approveBonds();
   */
  async approveBonds(): Promise<TxResult> {
    const signer = this.requireSigner("approveBonds");
    const { marketplace, claimBond } = await resolveAddresses(this.client);
    const owner = await signer.getAddress();
    const bond = new Contract(claimBond, erc1155Abi, signer);
    const already = (await bond.isApprovedForAll(owner, marketplace)) as boolean;
    if (already) {
      return { txHash: "" };
    }
    const tx = (await bond.setApprovalForAll(
      marketplace,
      true
    )) as ContractTransactionResponse;
    const receipt = await waitForTx(tx);
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  // -------------------------------------------------------------- HELPERS ---

  private requireSigner(method: string): Signer {
    if (!this.signer) {
      throw new Error(
        `MarketplaceAPI.${method}: no signer was supplied to the constructor. ` +
          `Pass an ethers Signer when instantiating MarketplaceAPI for write methods.`
      );
    }
    return this.signer;
  }
}

export type {
  ApproveParams,
  BuyParams,
  CancelParams,
  ListParams,
  MarketplaceStats,
  Trade,
  TxResult,
};
