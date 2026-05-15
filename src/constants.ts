// SPDX-License-Identifier: MIT
//
// Static constants for the Lumina SDK.
//
// Policy: the SDK does NOT hardcode contract addresses for runtime
// resource lookups — those are resolved from `GET /health.contracts` at
// runtime (see `LuminaClient.getContracts()`, added in 0.5.2). The
// constants below are PUBLIC METADATA that doesn't change per deploy and
// is safe to ship as a literal.
//
// Added in 0.5.3 (Sprint Z.2, 2026-05-15) to track the new
// FounderVestingV2 address once the founder broadcasts the deploy
// transaction described in `TODO_FOUNDER.md` (lumina-protocol repo).
// Until then the constant is a placeholder string `"TBD_POST_DEPLOY"`
// and SDK consumers should `await lumina.getContracts()` for runtime
// resolution if they need vesting addresses.

/**
 * LuminaOracleV2 SET A — canonical oracle per ADR-010 (and re-confirmed
 * in ADR-024 for FV V2 wiring). All 9 shields bind to this oracle as of
 * Sprint Oracle V2 2026-05-05.
 *
 * Base Sepolia (84532). Mainnet address TBD (Phase 4 deploy).
 */
export const LUMINA_ORACLE_V2_SET_A = "0x8cAbC4645a3981FF59d39328f9F65FdFD19Bd194" as const;

/**
 * FounderVestingV2 (Sprint Z.2) — re-deploy of FounderVesting with
 * corrected oracle wiring (LuminaOracleV2 SET A instead of the buggy
 * CapacityOracle in the legacy FV `0xa3e7…E876`) and tuning
 * SUSTAINED 7d→1d, FALLBACK 4y→3y.
 *
 * STATUS: `"TBD_POST_DEPLOY"` placeholder until the founder broadcasts
 * the deploy transaction (Phase 1.b of `TODO_FOUNDER.md` in
 * lumina-protocol repo). After deploy, the founder updates this
 * constant with the captured address and publishes 0.5.3 to npm.
 *
 * Until updated, SDK consumers should NOT depend on this constant —
 * use `await lumina.getContracts()` (currently returns the legacy FV;
 * post-Sprint-Z.2 broadcast + Railway env flip, returns the V2 address).
 */
export const FOUNDER_VESTING_V2_ADDRESS = "TBD_POST_DEPLOY" as const;

/**
 * FounderVesting legacy (deprecated post-Sprint-Z.2). Kept here for
 * historical reference and for SDK consumers that need to detect the
 * legacy contract on-chain (post-rescue balance == 0). Do NOT use this
 * for new vesting reads — use `FOUNDER_VESTING_V2_ADDRESS` instead.
 */
export const FOUNDER_VESTING_LEGACY_ADDRESS = "0xa3e7685E21A141930F63432E927D679fD3FDE876" as const;

/**
 * LuminaTokenV2 UUPS proxy. Address is stable across the 2-step rescue
 * upgrade (V2 → RescueV1 → PostRescueV2); only the implementation
 * rotates.
 */
export const LUMINA_TOKEN_V2_PROXY = "0x7D3E392Bdb3258cF92C257C90391957d7b0Aff02" as const;
