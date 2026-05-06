import type { LuminaClient } from "./client";
import type { Product } from "./types";

export class ProductsAPI {
  constructor(private readonly client: LuminaClient) {}

  /** Returns every product registered with CoverRouter. */
  async list(): Promise<Product[]> {
    const r = await this.client.fetch("/products");
    const body = (await r.json()) as { count: number; products: Product[] };
    return body.products;
  }

  /** Look up a single product by its bytes32 productId. */
  async get(productId: string): Promise<Product> {
    const r = await this.client.fetch(`/products/${encodeURIComponent(productId)}`);
    return (await r.json()) as Product;
  }

  /**
   * Get a price quote for a coverage amount on a product. Returns the
   * premium in USDC base units along with the upstream context the API
   * uses to compute it.
   */
  async quote(productId: string, coverageAmount: string): Promise<unknown> {
    const r = await this.client.fetch(
      `/products/${encodeURIComponent(productId)}/quote?coverageAmount=${encodeURIComponent(
        coverageAmount
      )}`
    );
    return r.json();
  }
}
