import type { LuminaClient } from "./client";

export interface SandboxInfo {
  ok: boolean;
  enabled: boolean;
  sandboxWallet: string | null;
  coverageCapUsdc: string;
  asset: { symbol: string; bytes32: string };
  defaultProductId: string;
  defaultProductName: string;
  rateLimit: { perIp: number; windowSeconds: number };
  docs?: string;
}

export interface SandboxTryResult {
  ok: boolean;
  sandbox: true;
  productId: string;
  policyId: string;
  buyer: string;
  coverageAmount: string;
  premiumPaid: string;
  txHash: string;
  blockExplorer: string;
  next?: string;
}

export class SandboxAPI {
  constructor(private readonly client: LuminaClient) {}

  /** No auth required. Returns whether the sandbox is enabled + caps. */
  async info(): Promise<SandboxInfo> {
    const r = await this.client.fetch("/sandbox/info");
    return (await r.json()) as SandboxInfo;
  }

  /**
   * Execute a server-fixed-cap demo policy purchase. No API key required.
   * Buyer + cap are server-controlled — the only knob the caller has is
   * `productId` (omitted = FLASHBTC1H-001 default). 10 req/h/IP.
   */
  async try(productId?: string): Promise<SandboxTryResult> {
    const r = await this.client.fetch("/sandbox/try", {
      method: "POST",
      body: JSON.stringify(productId ? { productId } : {}),
    });
    return (await r.json()) as SandboxTryResult;
  }
}
