// Marketplace-specific types added in 0.5.0. Re-exported from `src/types.ts`
// for ergonomic top-level imports.

/**
 * Aggregated marketplace metrics. All `uint256` numeric fields are returned
 * as decimal strings to avoid precision loss on the JS number type.
 */
export interface MarketplaceStats {
  /** Lowest `pricePerUnit` of currently active listings (USDC base units). */
  floor: string;
  /** Sum of trade prices in the last 24 hours (USDC base units). */
  volume24h: string;
  /** Active listings count. */
  totalListings: number;
  /** Historical sum of all trade prices. */
  totalVolume: string;
}

/**
 * A single executed trade on the secondary marketplace.
 */
export interface Trade {
  listingId: string;
  buyer: string;
  seller: string;
  bondId: string;
  amount: string;
  pricePerUnit: string;
  txHash: string;
  /** Unix timestamp in seconds. */
  timestamp: number;
}

/**
 * Parameters for `MarketplaceAPI.list`. NOTE: the on-chain
 * `LuminaBondMarketplace.list(epochId, amount, priceUSDC)` takes a TOTAL
 * priceUSDC. The SDK accepts `pricePerUnit` for ergonomics and computes
 * `priceUSDC = pricePerUnit * amount` before encoding the call. `expiresAt`
 * is currently informational only — it is recorded in the off-chain index
 * but the on-chain contract has no native expiry, so listings stay live
 * until cancelled or bought.
 */
export interface ListParams {
  /** ERC-1155 token id of the ClaimBond / epoch being sold. */
  bondId: string | bigint;
  /** Quantity of bond units (ERC-1155 amount). */
  amount: string | bigint;
  /** Price per unit in USDC base units (6 decimals). Must be >= 1_000_000 ($1). */
  pricePerUnit: string | bigint;
  /** Unix timestamp seconds. Reserved for future on-chain expiry; no-op today. */
  expiresAt: number;
}

/**
 * Parameters for `MarketplaceAPI.buy`. NOTE: the deployed contract's
 * `executeBuy(listingId)` purchases the listing in full — it does not
 * support partial fills. `amount` is therefore validated client-side
 * against the listing and is otherwise ignored on the wire.
 */
export interface BuyParams {
  listingId: string | bigint;
  amount: string | bigint;
}

export interface CancelParams {
  listingId: string | bigint;
}

export interface ApproveParams {
  amount: string | bigint;
}

/**
 * Standard return shape for write methods. `listingId` is populated for
 * `list()` (parsed from the on-chain `Listed` event in the receipt).
 */
export interface TxResult {
  txHash: string;
  blockNumber?: number;
  listingId?: string;
}
