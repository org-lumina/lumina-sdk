import { LuminaError } from "./errors";
import type { HealthResponse, LuminaConfig } from "./types";
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
