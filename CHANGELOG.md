# Changelog

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
