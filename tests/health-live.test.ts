import { LuminaClient } from "../src";

// Live test against the production /health endpoint. Skipped automatically
// when LUMINA_LIVE_TESTS is unset so CI without internet doesn't fail.
const live = process.env.LUMINA_LIVE_TESTS === "1";
const itLive = live ? it : it.skip;

describe("LuminaClient.health() — live", () => {
  itLive("returns chainId 84532 (Base Sepolia)", async () => {
    const c = new LuminaClient({ apiKey: "" });
    const h = await c.health();
    expect(h.status).toBe("ok");
    expect(h.chain.chainId).toBe(84532);
    expect(h.contracts).toEqual(
      expect.objectContaining({
        coverRouter: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
        usdc: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
      })
    );
  });
});
