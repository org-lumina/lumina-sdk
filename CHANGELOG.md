# Changelog

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
