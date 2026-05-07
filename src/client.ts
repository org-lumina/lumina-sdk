import { LuminaError } from "./errors";
import type { ContractAddresses, HealthResponse, LuminaConfig } from "./types";
import { PoliciesAPI } from "./policies";
import { BondsAPI } from "./bonds";
import { MarketplaceAPI } from "./marketplace";
import { AgentAPI } from "./agent";
import { WebhooksAPI } from "./webhooks";
import { SandboxAPI } from "./sandbox";
import { ProductsAPI } from "./products";

export const DEFAULT_API_BASE = "https://lumina-api-production-ac85.up.railway.app";

/**
 * Top-level Lumina Protocol client. Carries one API key and exposes the
 * resource sub-clients. Constructing a client never makes a network call —
 * call `.health()` to verify connectivity.
 */
export class LuminaClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  // Memoized result of GET /api/v1/auth/me. Resolved by `getMyWallet()`
  // and reused across all auto-resolving calls so a single key only
  // pays the round-trip once per process.
  private myWalletPromise: Promise<string> | null = null;
  // Memoized result of GET /health.contracts. Resolved by `getContracts()`
  // and shared by every sub-API that needs an on-chain address (no
  // hardcoded constants anywhere in the SDK after 0.5.2).
  private contractsPromise: Promise<ContractAddresses> | null = null;

  public readonly products: ProductsAPI;
  public readonly policies: PoliciesAPI;
  public readonly bonds: BondsAPI;
  public readonly marketplace: MarketplaceAPI;
  public readonly agent: AgentAPI;
  public readonly webhooks: WebhooksAPI;
  public readonly sandbox: SandboxAPI;

  constructor(config: LuminaConfig) {
    if (typeof config?.apiKey !== "string") {
      throw new TypeError("LuminaClient: apiKey is required (pass `\"\"` for the onboarding flow)");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, "");

    this.products = new ProductsAPI(this);
    this.policies = new PoliciesAPI(this);
    this.bonds = new BondsAPI(this);
    this.marketplace = new MarketplaceAPI(this);
    this.agent = new AgentAPI(this);
    this.webhooks = new WebhooksAPI(this);
    this.sandbox = new SandboxAPI(this);
  }

  async health(): Promise<HealthResponse> {
    const r = await this.fetch("/health");
    return (await r.json()) as HealthResponse;
  }

  /**
   * Resolve and cache the wallet associated with the configured API key
   * via `GET /api/v1/auth/me`. Used by `bonds.list()`, `policies.list()`,
   * and `marketplace.myListings()` when the caller doesn't pass a wallet
   * explicitly.
   *
   * The first call hits the API; subsequent calls return the cached
   * result. If the request fails (no key, /auth/me missing, 5xx) we
   * surface a clear error so callers can pass `wallet` explicitly.
   *
   * NOTE: requires API >= the release that ships `/api/v1/auth/me`
   * (added 2026-05-07). On older deployments the endpoint returns 404
   * `not_found` and this method throws `LuminaError` with the same code.
   */
  async getMyWallet(): Promise<string> {
    if (this.myWalletPromise) return this.myWalletPromise;
    this.myWalletPromise = (async () => {
      try {
        const r = await this.fetch("/api/v1/auth/me");
        const body = (await r.json()) as { wallet?: string };
        if (!body.wallet || typeof body.wallet !== "string") {
          throw new LuminaError(
            "GET /api/v1/auth/me did not return a `wallet` field. Pass {wallet} explicitly or check your API key.",
            500,
            "auth_me_invalid"
          );
        }
        return body.wallet;
      } catch (err) {
        // Drop the cached failure so a transient outage doesn't pin the
        // client into permanent-failure mode.
        this.myWalletPromise = null;
        throw err;
      }
    })();
    return this.myWalletPromise;
  }

  /**
   * Resolve and cache the canonical contract addresses from `GET /health`.
   * Used by every sub-API that needs an on-chain address (marketplace
   * write paths, allowance checks, etc.) so the SDK never carries a
   * hardcoded address that can desync from a redeploy.
   *
   * Caching: shared `Promise` per `LuminaClient` instance. The first call
   * makes one round-trip; subsequent calls (concurrent or serial) reuse
   * the result. On failure the cache is dropped so the next call retries.
   *
   * Errors: surfaces the underlying `LuminaError` from `fetch()` (network,
   * non-2xx). Each missing key in `health.contracts` is reported as a
   * single explicit `LuminaError(500, "health_contracts_incomplete")` so
   * callers don't get an `undefined` address downstream.
   */
  async getContracts(): Promise<ContractAddresses> {
    if (this.contractsPromise) return this.contractsPromise;
    this.contractsPromise = (async () => {
      try {
        const health = await this.health();
        const c = health.contracts ?? {};
        const required: Array<keyof ContractAddresses> = [
          "coverRouter",
          "policyManager",
          "bondVault",
          "claimBond",
          "marketplace",
          "usdc",
          "luminaToken",
        ];
        const missing = required.filter((k) => typeof c[k] !== "string" || !c[k]);
        if (missing.length > 0) {
          throw new LuminaError(
            `GET /health.contracts is missing required keys: ${missing.join(", ")}. Check that the API is on a supported network and version.`,
            500,
            "health_contracts_incomplete"
          );
        }
        return {
          coverRouter: c.coverRouter,
          policyManager: c.policyManager,
          bondVault: c.bondVault,
          claimBond: c.claimBond,
          marketplace: c.marketplace,
          usdc: c.usdc,
          luminaToken: c.luminaToken,
        };
      } catch (err) {
        this.contractsPromise = null;
        throw err;
      }
    })();
    return this.contractsPromise;
  }

  /**
   * Internal fetch with auth header injection + LuminaError mapping.
   *
   * - `x-api-key` is included whenever `this.apiKey` is non-empty.
   * - 4xx/5xx responses are surfaced as `LuminaError` with the API's
   *   `error` and `code` fields if the body is JSON.
   * - Non-JSON error bodies are wrapped as `LuminaError(statusText, status)`.
   */
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers ?? {});
    if (this.apiKey) headers.set("x-api-key", this.apiKey);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let r: Response;
    try {
      r = await fetch(url, { ...init, headers });
    } catch (err) {
      throw new LuminaError(
        `Network error contacting Lumina API at ${url}: ${(err as Error).message}`,
        0,
        "network_error"
      );
    }

    if (!r.ok) {
      let body: { error?: string; message?: string; code?: string } = {};
      try {
        body = (await r.clone().json()) as typeof body;
      } catch {
        // Non-JSON error response — fall through with empty body.
      }
      const message = body.message ?? body.error ?? r.statusText;
      const code = body.code ?? body.error;
      throw new LuminaError(message, r.status, code);
    }

    return r;
  }
}
