// Public types surfaced to SDK consumers. Keep this file additive — adding
// optional fields is a minor bump; renaming or removing requires a major.

export interface LuminaConfig {
  /**
   * API key issued by `POST /api/v1/agent/onboard` (or pass `""` for the
   * onboarding flow itself, where the key is being minted).
   */
  apiKey: string;
  /**
   * Override the API base URL. Defaults to the production deployment.
   * Useful for local dev (`http://localhost:3000`) or for staging.
   */
  baseUrl?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  version: string;
  uptimeSeconds: number;
  chain: { chainId: number; block: number; rpcConnected: boolean };
  relayer: { address: string; balanceWei: string };
  contracts: Record<string, string>;
}

export interface Product {
  productId: string;
  /**
   * [10x10] Canonical keccak256 preimage (e.g. `"FLASHBTC1H-001"`). Lets
   * agents map productId → name without re-computing hashes from the docs.
   * `null` for products not in the canonical registry yet.
   */
  name: string | null;
  /** Human-friendly label (e.g. `"Flash BTC 1h"`). */
  displayName: string;
  shield: string;
  payoutRatioBps: number;
  triggerProbBps: number;
  marginBps: number;
  durationSeconds: number;
  active: boolean;
}

export interface Policy {
  productId: string;
  productName?: string;
  policyId: string;
  shield?: string;
  buyer: string;
  holder?: string;
  coverageAmount: string;
  payoutAmount?: string;
  premiumPaid: string;
  purchasedAt?: string;
  createdAt?: string;
  waitingEndsAt?: string | null;
  expiresAt?: string;
  status?: "Waiting" | "Active" | "Triggered" | "Expired" | "Cancelled";
  triggered?: boolean;
  expired?: boolean;
  productActive?: boolean;
  priceSnapshot?: string;
  triggeredAt?: string | null;
  bondId?: string | null;
  txHash?: string;
}

export interface PurchasePolicyParams {
  productId: string;
  buyer: string;
  /** USDC base units (6 decimals) as a decimal string. e.g. "50000000" = $50. */
  coverageAmount: string;
  /**
   * Asset to denominate cover/premium in. Pass the symbol (`"USDC"`) and the
   * SDK encodes it to bytes32 for you, OR pass a 32-byte hex string for full
   * control.
   */
  asset: "USDC" | string;
  /** Optional UUID for at-least-once delivery semantics. */
  idempotencyKey?: string;
}

export interface PurchaseReceipt {
  txHash: string;
  blockNumber: number | null;
  policyId: string;
  buyer: string;
  productId: string;
  coverageAmount: string;
  premiumPaid: string;
}

export interface Bond {
  bondId: string;
  owner: string;
  amount: string;
  faceValueUsdc: string;
  pricePerBondUsdc?: string;
  maturityEpoch?: number;
}

export interface Listing {
  listingId: string;
  sellerAddress: string;
  bondId: string;
  amount: string;
  totalPriceUsdc: string;
  txHash: string;
  blockNumber: number;
  status: "active" | "executed" | "cancelled";
  createdAt: string;
}

export interface ListListingsParams {
  limit?: number;
  offset?: number;
  sortBy?: "price-asc" | "price-desc" | "createdAt-desc" | "listedAt-desc";
  maxPriceUsdc?: string;
}

export interface OnboardOptions {
  /** Optional human-readable label for the issued key. Max 50 chars. */
  label?: string;
}

export interface OnboardResult {
  ok: boolean;
  keyId: number;
  apiKey: string;
  wallet: string;
  tier: "free" | "paid";
  label: string | null;
  createdAt: string;
  warning: string;
}

export interface ApiKeyMetadata {
  keyId: number;
  /** [10x10] Internal agent row id, exposed for debugging. */
  agentId?: number;
  label: string | null;
  tier: "free" | "paid";
  /** [10x10] First 8 chars of the SHA-256 hash, useful for UI key disambiguation. */
  hashPrefix?: string;
  createdAt: string;
  /** Unix-ms when this key was revoked (`null` for active keys). */
  revokedAt?: number | null;
}

export interface WebhookSubscription {
  id: number;
  url: string;
  events: string[];
  createdAt: string;
}

export interface CreateWebhookResult {
  ok: boolean;
  id: number;
  url: string;
  events: string[];
  /** 32-byte hex secret. STORE IT NOW — never returned again. */
  secret: string;
  warning: string;
}
