import type { LuminaClient } from "./client";
import type { Bond } from "./types";
import { snakeToCamel } from "./utils/case-converter";

export class BondsAPI {
  constructor(private readonly client: LuminaClient) {}

  /**
   * List ERC-1155 bond holdings for `wallet`. If `wallet` is omitted the
   * SDK auto-resolves the wallet associated with the configured API key
   * via `GET /api/v1/auth/me` (cached after the first call).
   *
   * The on-chain data is public, but the API refuses cross-wallet reads
   * — so passing a `wallet` other than the caller's own returns 403.
   *
   * @example
   * // 0.5.1+ — auto-resolved from the API key
   * const bonds = await lumina.bonds.list();
   *
   * @example
   * // back-compat — explicit wallet
   * const bonds = await lumina.bonds.list({ wallet: "0xabc..." });
   */
  async list(params: { wallet?: string } = {}): Promise<Bond[]> {
    const wallet = params.wallet ?? (await this.client.getMyWallet());
    const r = await this.client.fetch(`/api/v1/bonds/${wallet}`);
    const body = (await r.json()) as { wallet: string; totalBonds: number; bonds: unknown[] };
    return snakeToCamel<Bond[]>(body.bonds ?? []);
  }
}
