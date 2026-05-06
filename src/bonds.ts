import type { LuminaClient } from "./client";
import type { Bond } from "./types";

export class BondsAPI {
  constructor(private readonly client: LuminaClient) {}

  /**
   * List ERC-1155 bond holdings for the calling wallet. The API returns
   * the wallet's positions — cross-wallet listing is forbidden.
   */
  async list(): Promise<Bond[]> {
    const r = await this.client.fetch("/api/v1/bonds");
    const body = (await r.json()) as { count: number; bonds: Bond[] };
    return body.bonds ?? [];
  }
}
