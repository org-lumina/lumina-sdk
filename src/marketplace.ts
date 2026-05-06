import type { LuminaClient } from "./client";
import type { Listing, ListListingsParams } from "./types";

export class MarketplaceAPI {
  constructor(private readonly client: LuminaClient) {}

  /**
   * Browse active secondary-market listings. Defaults to `price-asc`,
   * limit 50, offset 0.
   */
  async listings(params: ListListingsParams = {}): Promise<Listing[]> {
    const qs = new URLSearchParams();
    qs.set("limit", String(params.limit ?? 50));
    qs.set("offset", String(params.offset ?? 0));
    qs.set("sortBy", params.sortBy ?? "price-asc");
    if (params.maxPriceUsdc) qs.set("maxPriceUsdc", params.maxPriceUsdc);

    const r = await this.client.fetch(`/api/v1/marketplace/listings?${qs.toString()}`);
    const body = (await r.json()) as { count: number; listings: Listing[] };
    return body.listings ?? [];
  }
}
