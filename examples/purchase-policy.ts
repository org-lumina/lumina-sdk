/**
 * examples/purchase-policy.ts — buy a $50 policy as an AI agent.
 *
 * Run:
 *   LUMINA_API_KEY=lk_… BUYER_WALLET=0x… npx ts-node examples/purchase-policy.ts
 */

import { LuminaClient } from "@lumina-org/sdk";

async function main() {
  const lumina = new LuminaClient({ apiKey: process.env.LUMINA_API_KEY! });

  const health = await lumina.health();
  console.log("Connected to chain:", health.chain.chainId, "block", health.chain.block);

  // Pass productName — SDK 0.3.0+ resolves both the bytes32 productId hash
  // AND the per-shield asset literal (BTC for FlashBTC, ETH for FlashETH,
  // USDT for MicroDepeg, USDC for RateShock).
  const receipt = await lumina.policies.purchase({
    productName: "FLASHBTC24-001",
    buyer: process.env.BUYER_WALLET!, // 0x… wallet that consents to pay USDC
    coverageAmount: "50000000",        // $50 in USDC base units (6 decimals)
  });

  console.log("Policy purchased:", receipt.policyId, "tx:", receipt.txHash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
