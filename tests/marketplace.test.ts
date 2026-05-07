import { Interface } from "ethers";
import { LuminaClient } from "../src";
import { MarketplaceAPI } from "../src/marketplace";
import marketplaceAbiRaw from "../src/abi/LuminaBondMarketplace.json";

/**
 * Tests use a hand-rolled mock signer/contract pair instead of
 * spinning up a real provider. The point is to verify SDK-level
 * behaviour (calldata shape, allowance gating, error surfacing) without
 * any network or chain dependency.
 */

const MARKETPLACE_ABI = marketplaceAbiRaw as unknown as ConstructorParameters<typeof Interface>[0];
const MARKETPLACE_IFACE = new Interface(MARKETPLACE_ABI);

interface MockTx {
  hash: string;
  wait: () => Promise<MockReceipt>;
}
interface MockReceipt {
  hash: string;
  blockNumber: number;
  logs: Array<{ topics: string[]; data: string }>;
}

const ZeroAddrConst = "0x0000000000000000000000000000000000000000";
const FAKE_SELLER = "0x" + "1".repeat(40);
const FAKE_BUYER = "0x" + "2".repeat(40);
const FAKE_USDC = "0x" + "3".repeat(40);
const FAKE_MARKETPLACE = "0xfaC56692c626718aC8953A3d5fAE67fac2f1Be6E";
const FAKE_CLAIMBOND = "0x3d2F26B6BBcfDD6c7c1Ad0dE1FE52F22ed2e1730";

function healthFetchStub(): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "lumina-api",
      version: "0.0.0",
      uptimeSeconds: 1,
      chain: { chainId: 84532, block: 1, rpcConnected: true },
      relayer: { address: "0x0", balanceWei: "0" },
      contracts: {
        coverRouter: "0x" + "a".repeat(40),
        policyManager: "0x" + "b".repeat(40),
        bondVault: "0x" + "c".repeat(40),
        claimBond: FAKE_CLAIMBOND,
        marketplace: FAKE_MARKETPLACE,
        usdc: FAKE_USDC,
        luminaToken: "0x" + "d".repeat(40),
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Build a minimal Signer-shaped mock that records every contract call so
 * tests can assert on the calldata. We monkey-patch ethers.Contract via a
 * custom signer with a `call`/`sendTransaction` shim — but ethers v6
 * Contract dispatches to `signer.sendTransaction({to, data, value})`.
 */
class MockSigner {
  public readonly sent: Array<{ to: string; data: string; value?: bigint }> = [];
  public readonly calls: Array<{ to: string; data: string }> = [];
  // Map from `${to}|${selector}` → return value (already abi-encoded result)
  // for `call()` (read) requests.
  public readReturns: Record<string, string> = {};
  public readonly provider: unknown;

  constructor(private readonly addr: string) {
    // ethers v6 needs `signer.provider` to dispatch reads. Provide a stub
    // that proxies `call` back to this signer.
    this.provider = {
      call: async (tx: { to: string; data: string }) => this._handleCall(tx),
      // Some ethers paths inspect provider.getNetwork.
      getNetwork: async () => ({ chainId: 84532n, name: "base-sepolia" }),
      // ContractTransactionResponse.wait() polls getTransactionReceipt;
      // return a synthetic receipt with the same hash + block #100.
      getTransactionReceipt: async (hash: string) => ({
        hash,
        blockNumber: 100,
        blockHash: "0x" + "f".repeat(64),
        index: 0,
        from: this.addr,
        to: ZeroAddrConst,
        cumulativeGasUsed: 0n,
        gasUsed: 0n,
        effectiveGasPrice: 0n,
        status: 1,
        type: 0,
        logs: [],
        logsBloom: "0x" + "0".repeat(512),
        contractAddress: null,
        confirmations: async () => 1,
      }),
      getBlockNumber: async () => 200,
      getBlock: async (_n: number) => ({
        number: 200,
        timestamp: 1_700_000_000,
        hash: "0x" + "e".repeat(64),
      }),
      getTransaction: async (hash: string) => ({
        hash,
        blockNumber: 100,
        from: this.addr,
        to: ZeroAddrConst,
      }),
      // ethers' AbstractProvider polls _detectNetwork.
      _detectNetwork: async () => ({ chainId: 84532n, name: "base-sepolia" }),
      broadcastTransaction: async () => {
        throw new Error("broadcastTransaction unsupported in mock");
      },
    };
  }
  async getAddress(): Promise<string> {
    return this.addr;
  }
  connect(_provider: unknown): MockSigner {
    return this;
  }
  async sendTransaction(tx: { to: string; data: string; value?: bigint }): Promise<MockTx> {
    this.sent.push({ to: tx.to, data: tx.data, value: tx.value });
    const hash = "0x" + (this.sent.length.toString(16).padStart(64, "0"));
    return {
      hash,
      wait: async () => ({ hash, blockNumber: 100 + this.sent.length, logs: [] }),
    };
  }
  // Pre-program a return value for a (to, selector) pair.
  setReadReturn(to: string, selector: string, abiEncodedReturn: string): void {
    this.readReturns[`${to.toLowerCase()}|${selector.toLowerCase()}`] = abiEncodedReturn;
  }
  async _handleCall(tx: { to: string; data: string }): Promise<string> {
    this.calls.push({ to: tx.to, data: tx.data });
    const selector = tx.data.slice(0, 10);
    const key = `${tx.to.toLowerCase()}|${selector.toLowerCase()}`;
    if (this.readReturns[key] !== undefined) return this.readReturns[key];
    // Default: return zero (works for allowance/isApprovedForAll defaults
    // when the test wants "not approved" / "no allowance").
    return "0x" + "0".repeat(64);
  }
  async resolveName(_name: string): Promise<string | null> {
    return null;
  }
}

// ethers v6 `populateTransaction` calls `provider.estimateGas`, but the
// Contract write path goes through `signer.sendTransaction` directly,
// which our mock handles. For `view` calls it goes through
// `signer.provider.call`. That's enough for these unit tests.

describe("MarketplaceAPI — calldata + validation", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("list builds correct calldata for LuminaBondMarketplace.list(epochId, amount, priceUSDC)", async () => {
    globalThis.fetch = (async () => healthFetchStub()) as typeof fetch;
    const signer = new MockSigner(FAKE_SELLER);
    const client = new LuminaClient({ apiKey: "lk_test" });
    const market = new MarketplaceAPI(client, signer as never);

    await market.list({
      bondId: 202805n,
      amount: 10n,
      pricePerUnit: 1_500_000n, // $1.50 per unit -> total $15
      expiresAt: 0,
    });

    expect(signer.sent).toHaveLength(1);
    const sentTx = signer.sent[0];
    expect(sentTx.to.toLowerCase()).toBe(FAKE_MARKETPLACE.toLowerCase());

    const decoded = MARKETPLACE_IFACE.parseTransaction({ data: sentTx.data });
    expect(decoded?.name).toBe("list");
    expect(decoded?.args[0]).toBe(202805n); // epochId/bondId
    expect(decoded?.args[1]).toBe(10n); // amount
    expect(decoded?.args[2]).toBe(15_000_000n); // total priceUSDC = pricePerUnit * amount
  });

  it("list rejects pricePerUnit below the $1 anti-spam floor", async () => {
    globalThis.fetch = (async () => healthFetchStub()) as typeof fetch;
    const signer = new MockSigner(FAKE_SELLER);
    const market = new MarketplaceAPI(
      new LuminaClient({ apiKey: "lk_test" }),
      signer as never
    );
    await expect(
      market.list({
        bondId: 1n,
        amount: 1n,
        pricePerUnit: 999_999n,
        expiresAt: 0,
      })
    ).rejects.toThrow(/anti-spam floor/);
    expect(signer.sent).toHaveLength(0);
  });

  it("buy validates listingId is a positive number/bigint", async () => {
    const signer = new MockSigner(FAKE_BUYER);
    const market = new MarketplaceAPI(
      new LuminaClient({ apiKey: "lk_test" }),
      signer as never
    );

    await expect(
      market.buy({ listingId: 0n, amount: 1n })
    ).rejects.toThrow(/listingId must be > 0/);
    await expect(
      market.buy({ listingId: "-1", amount: 1n })
    ).rejects.toThrow(/listingId must be > 0/);
    await expect(
      market.buy({ listingId: "not-a-number", amount: 1n })
    ).rejects.toThrow(/listingId must be a positive integer-like value/);

    expect(signer.sent).toHaveLength(0);
  });

  it("cancel surfaces useful error when contract reverts", async () => {
    globalThis.fetch = (async () => healthFetchStub()) as typeof fetch;
    const signer = new MockSigner(FAKE_SELLER);
    // Override sendTransaction to simulate an on-chain revert.
    signer.sendTransaction = async () => {
      throw new Error('execution reverted: "NotSeller"');
    };
    const market = new MarketplaceAPI(
      new LuminaClient({ apiKey: "lk_test" }),
      signer as never
    );

    await expect(market.cancel({ listingId: 42n })).rejects.toThrow(/NotSeller/);
  });

  it("stats returns expected MarketplaceStats shape", async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/api/v1/marketplace/stats")) {
        return new Response(
          JSON.stringify({
            floor: "1500000",
            volume24h: "150000000",
            totalListings: 7,
            totalVolume: "9876543210",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return healthFetchStub();
    }) as typeof fetch;

    const client = new LuminaClient({ apiKey: "lk_test" });
    const stats = await client.marketplace.stats();
    expect(stats).toEqual({
      floor: "1500000",
      volume24h: "150000000",
      totalListings: 7,
      totalVolume: "9876543210",
    });
  });

  it("approve only fires tx if current allowance < requested amount", async () => {
    globalThis.fetch = (async () => healthFetchStub()) as typeof fetch;

    // Pre-program allowance(buyer, marketplace) = 1_000_000_000 (1B base units).
    // Selector for `allowance(address,address)` = 0xdd62ed3e.
    const allowanceSelector = "0xdd62ed3e";
    const oneBillion = 1_000_000_000n;
    const oneBillionEncoded =
      "0x" + oneBillion.toString(16).padStart(64, "0");

    const signer = new MockSigner(FAKE_BUYER);
    signer.setReadReturn(FAKE_USDC, allowanceSelector, oneBillionEncoded);

    const market = new MarketplaceAPI(
      new LuminaClient({ apiKey: "lk_test" }),
      signer as never
    );

    // Requested < current → no-op, returns empty txHash.
    const noop = await market.approve({ amount: 100_000_000n });
    expect(noop.txHash).toBe("");
    expect(signer.sent).toHaveLength(0);

    // Requested > current → submits approve.
    const sent = await market.approve({ amount: 5_000_000_000n });
    expect(sent.txHash).not.toBe("");
    expect(signer.sent).toHaveLength(1);
    expect(signer.sent[0].to.toLowerCase()).toBe(FAKE_USDC.toLowerCase());
  });
});
