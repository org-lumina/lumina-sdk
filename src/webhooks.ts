import type { LuminaClient } from "./client";
import type { CreateWebhookResult, WebhookSubscription } from "./types";

export type WebhookEventName =
  | "policy_purchased"
  | "policy_triggered"
  | "bond_minted"
  | "bond_redeemed"
  | "listing_created"
  | "listing_purchased"
  | "*";

export interface CreateWebhookParams {
  url: string;
  /** Event allowlist. `"*"` (default) subscribes to all. */
  events?: WebhookEventName[] | "*";
}

export class WebhooksAPI {
  constructor(private readonly client: LuminaClient) {}

  /**
   * Subscribe a URL to push notifications. The response includes a 32-byte
   * hex `secret` — STORE IT NOW. Receivers verify the
   * `X-Lumina-Signature` header as `hex(HMAC-SHA256(rawBody, secret))`.
   */
  async create(params: CreateWebhookParams): Promise<CreateWebhookResult> {
    const events = params.events ?? "*";
    const r = await this.client.fetch("/api/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: params.url, events }),
    });
    return (await r.json()) as CreateWebhookResult;
  }

  /** List the calling wallet's active subscriptions (no secrets returned). */
  async list(): Promise<WebhookSubscription[]> {
    const r = await this.client.fetch("/api/v1/webhooks");
    const body = (await r.json()) as { count: number; webhooks: WebhookSubscription[] };
    return body.webhooks ?? [];
  }

  /** Deactivate a subscription. Owner-only. */
  async delete(id: number): Promise<void> {
    await this.client.fetch(`/api/v1/webhooks/${id}`, { method: "DELETE" });
  }
}
