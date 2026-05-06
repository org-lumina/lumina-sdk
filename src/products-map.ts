// Canonical asset for each shield product. Each shield validates the on-chain
// `params.asset` against a hardcoded literal — sending the wrong asset reverts
// with `InvalidAsset(bytes32)` even though the payment token (USDC) is the
// same for every product. This map is the single source of truth in the SDK.
//
// Hashes are pre-computed (keccak256 of the canonical name) so callers can
// resolve productId → asset without re-running keccak on every purchase.

import { keccak256, toUtf8Bytes } from "ethers";

export type AssetSymbol = "BTC" | "ETH" | "USDC" | "USDT";

export const PRODUCT_ASSET_MAP: Readonly<Record<string, AssetSymbol>> = {
  "FLASHBTC1H-001": "BTC",
  "FLASHBTC4H-001": "BTC",
  "FLASHBTC24-001": "BTC",
  "FLASHBTC48-001": "BTC",
  "FLASHETH1H-001": "ETH",
  "FLASHETH24-001": "ETH",
  "FLASHETH48-001": "ETH",
  "MICRODEPEG-001": "USDT",
  "RATESHOCK-001": "USDC",
} as const;

// Pre-computed { productId(bytes32) → name } reverse index. Built once at
// module load so getExpectedAssetFromProductId is O(1) instead of O(n) per
// call (which matters once an agent batches dozens of purchases).
const PRODUCT_ID_TO_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.keys(PRODUCT_ASSET_MAP).map((name) => [
      keccak256(toUtf8Bytes(name)).toLowerCase(),
      name,
    ])
  )
);

export function getExpectedAsset(productName: string): AssetSymbol {
  const asset = PRODUCT_ASSET_MAP[productName];
  if (!asset) {
    throw new Error(
      `Unknown product: ${productName}. Known products: ${Object.keys(PRODUCT_ASSET_MAP).join(", ")}`
    );
  }
  return asset;
}

export function getExpectedAssetFromProductId(productId: string): AssetSymbol {
  const name = PRODUCT_ID_TO_NAME[productId.toLowerCase()];
  if (!name) {
    throw new Error(
      `Unknown productId: ${productId}. Compute keccak256 from a canonical name in PRODUCT_ASSET_MAP, or pass productName instead.`
    );
  }
  return PRODUCT_ASSET_MAP[name]!;
}

export function getProductIdFromName(productName: string): string {
  if (!(productName in PRODUCT_ASSET_MAP)) {
    throw new Error(
      `Unknown product: ${productName}. Known products: ${Object.keys(PRODUCT_ASSET_MAP).join(", ")}`
    );
  }
  return keccak256(toUtf8Bytes(productName));
}
