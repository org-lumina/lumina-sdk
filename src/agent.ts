import type { Signer } from "ethers";
import type { LuminaClient } from "./client";
import type { ApiKeyMetadata, OnboardOptions, OnboardResult } from "./types";

export class AgentAPI {
  constructor(private readonly client: LuminaClient) {}

  /**
   * Self-service onboarding. Signs the canonical message
   *
   *     `Lumina onboarding for {address} at {timestamp}`
   *
   * with the supplied wallet (any ethers v6 `Signer` works) and exchanges
   * the signature for a freshly-minted API key. The key is shown ONLY in
   * the response — store `result.apiKey` immediately.
   *
   * Caps:
   *   - 3 active keys per wallet (server enforces; throws 409 cap_reached)
   *   - 10 onboard requests per hour per IP (server enforces)
   *   - timestamp must be within ±300s of server time
   */
  async onboard(wallet: Signer, opts: OnboardOptions = {}): Promise<OnboardResult> {
    const address = await wallet.getAddress();
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `Lumina onboarding for ${address} at ${timestamp}`;
    const signature = await wallet.signMessage(message);

    const r = await this.client.fetch("/api/v1/agent/onboard", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: address,
        signature,
        timestamp,
        label: opts.label,
      }),
    });
    return (await r.json()) as OnboardResult;
  }

  /**
   * List the calling wallet's active keys. The plaintext is never returned
   * here — only metadata.
   */
  async listKeys(): Promise<ApiKeyMetadata[]> {
    const r = await this.client.fetch("/api/v1/agent/keys");
    const body = (await r.json()) as { wallet: string; keys: ApiKeyMetadata[] };
    return body.keys ?? [];
  }

  /**
   * Revoke one of the calling wallet's keys. Owner-only — the API key on
   * the request must belong to the same wallet that owns `keyId`.
   */
  async revokeKey(keyId: number): Promise<void> {
    await this.client.fetch(`/api/v1/agent/keys/${keyId}`, { method: "DELETE" });
  }
}
