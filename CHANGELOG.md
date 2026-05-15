# Changelog

## 0.5.3 — 2026-05-15
### Added
- `src/constants.ts` — public metadata constants for Sprint Z.2 (ADR-024) vesting fix:
  - `LUMINA_ORACLE_V2_SET_A = "0x8cAbC4645a3981FF59d39328f9F65FdFD19Bd194"` (canonical oracle per ADR-010).
  - `FOUNDER_VESTING_V2_ADDRESS = "TBD_POST_DEPLOY"` placeholder. The founder updates this constant to the captured deploy address after Phase 1.b of `TODO_FOUNDER.md` (lumina-protocol repo) and publishes the package to npm.
  - `FOUNDER_VESTING_LEGACY_ADDRESS = "0xa3e7685E21A141930F63432E927D679fD3FDE876"` (deprecated; balance 0 post-rescue).
  - `LUMINA_TOKEN_V2_PROXY = "0x7D3E392Bdb3258cF92C257C90391957d7b0Aff02"` (proxy stable; impl rotates V2 → RescueV1 → PostRescueV2 during Sprint Z.2 broadcast).
- All 4 constants re-exported from the package root.

### Notes
- Runtime address resolution (`LuminaClient.getContracts()`) remains the recommended path for SDK consumers. The new constants are PUBLIC METADATA — useful for `if (myAddr === FOUNDER_VESTING_V2_ADDRESS)` style checks and event filtering — not for replacing the `/health.contracts` lookup.

## 0.5.2 — 2026-05-07
### Fixed
- CRITICAL: `marketplace.*` write methods (`approveBonds`, `list`, `buy`, `cancel`, `approve`) read `health.contracts.bondMarketplace` — but the canonical key is `marketplace`. The lookup always returned `undefined` and silently fell back to a hardcoded constant. The constant happened to match prod, so marketplace itself worked, but the fallback for `claimBond` (`0x3d2F26B6…`) was stale (live: `0x3d2F5DB2…`). Fixed: now reads `marketplace` and never falls back. (P0)
- Removed all hardcoded contract addresses from `src/`. `MARKETPLACE_ADDRESS` and `CLAIM_BOND_ADDRESS` are gone; addresses are resolved at runtime from `GET /health` and cached.

### Added
- `LuminaClient.getContracts()` — cached helper that returns the typed `ContractAddresses` from `/health`. Memoized via shared `Promise` so concurrent callers share one round-trip. Cache is dropped on failure so transient `/health` outages don't pin the client into permanent failure.
- `ContractAddresses` interface exported from the package root: `{ coverRouter, policyManager, bondVault, claimBond, marketplace, usdc, luminaToken }`.
- Strict validation: if `/health.contracts` is missing any required key, the client throws `LuminaError(500, "health_contracts_incomplete")` listing the missing keys.

### Changed
- `MarketplaceAPI.{list,buy,cancel,approve,approveBonds}` now `await this.client.getContracts()` instead of using a function-local `resolveAddresses` with try/catch fallback. Failures are propagated, not swallowed.

### Removed
- Constants `MARKETPLACE_ADDRESS`, `CLAIM_BOND_ADDRESS` (`src/marketplace/index.ts`).
- Internal helper `resolveAddresses` (replaced by `LuminaClient.getContracts`).

## 0.5.1 — 2026-05-07
### Fixed
- `bonds.list()` no longer 404s — the slim 0.5.0 implementation hit `/api/v1/bonds` (no wallet) and the API only exposes `/api/v1/bonds/<wallet>`. The SDK now auto-resolves the caller's wallet from the API key and threads it into the URL. (P0-2)
- `policies.list()` returned `Policy[]` rows where every camelCase field was `undefined` — the API responds with snake_case keys (`policy_id`, `coverage_amount`, `tx_hash`, …) but the SDK type is camelCase and 0.5.0 had no normalizer. Rows are now converted via `snakeToCamel` before they leave the SDK. (P0-3)
- Coverage minimum aligned to **$100 USDC** across docs/skills/SDK examples — the on-chain `CoverRouterV2` enforces 100_000_000 base units, the docs and SDK examples used to show $50 (50_000_000) which reverts with `coverage_below_minimum`. (P0-1)
- `Bond.amount` example in docs corrected from `'50000000'` (=50M units) to `'50'` (50 units = $50 face). (P2-1)

### Added
- `LuminaClient.getMyWallet()` — resolves the wallet associated with the configured API key via `GET /api/v1/auth/me` and memoizes the result for the lifetime of the client.
- `src/utils/case-converter.ts` — exports `snakeToCamel(obj)` and `snakeToCamelKey(s)`. Recursive over arrays + nested objects, idempotent on camelCase input.

### Changed
- `lumina.bonds.list({ wallet? })` — `wallet` is now optional (back-compat: passing it explicitly still works; no extra round-trip).
- `lumina.policies.list({ wallet? })` — `wallet` is now optional. The SDK forwards `?owner=<wallet>` to the API so the server-side cross-wallet check still applies.
- `lumina.marketplace.myListings(seller?)` — `seller` is now optional with the same auto-resolution semantics.

### Requires
- API endpoint `GET /api/v1/auth/me` (added 2026-05-07). On older deployments the auto-resolve path throws `LuminaError(404, 'not_found')`; pass `wallet` explicitly to bypass.

## 0.5.0 — 2026-05-06
### Added
- `MarketplaceAPI.list/buy/cancel/approve/approveBonds/listing/stats/history/myListings` — full marketplace helpers (read + write).
- ABI bundles: `src/abi/LuminaBondMarketplace.json`, `erc20.json`, `erc1155.json`.
- Types: `MarketplaceStats`, `Trade`, `ListParams`, `BuyParams`, `CancelParams`, `ApproveParams`, `TxResult`.
- Helpers: `waitForTx`, `parseListingFromLog`, `estimateBuyPrice`.
- Example `examples/marketplace-flow.ts` — end-to-end approveBonds → list → buy → cancel.
### Changed
- README "Marketplace operations" section.
- Marketplace module restructured from `src/marketplace.ts` to `src/marketplace/index.ts` (back-compat: existing `client.marketplace.listings()` keeps working).

## 0.4.0 — 2026-05-06
### Added
- `Product.coveredAsset` (`'USDC' | 'USDT' | 'BTC' | 'ETH'`) — the asset whose event is insured against.
- `Product.paymentAsset` (`'USDC'`) — explicit confirmation premium is always USDC.
- `Product.coverageDescription` — plain-English one-liner.
- Example `examples/list-products-and-explain.ts`.

### Changed
- README: new "Understanding products" section.

### Notes
- These fields are optional in the type (server populates them when running the matching API version). Existing code using only the legacy fields keeps working unchanged.

## 0.3.0
- (Prior — productName auto-resolve, asset registry guidance.)
