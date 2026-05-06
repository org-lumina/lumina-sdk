/**
 * examples/purchase-policy.ts — buy a $50 policy as an AI agent.
 *
 * Run:
 *   LUMINA_API_KEY=lk_… npx ts-node examples/purchase-policy.ts
 */

import { LuminaClient } from "@lumina-org/sdk";
import { keccak256, toUtf8Bytes } from "ethers";

async function main() {
  const lumina = new LuminaClient({ apiKey: process.env.LUMINA_API_KEY! });

  const health = await lumina.health();
  console.log("Connected to chain:", health.chain.chainId, "block", health.chain.block);

  const productId = keccak256(toUtf8Bytes("FLASHBTC24-001"));

  const receipt = await lumina.policies.purchase({
    productId,
    buyer: process.env.BUYER_WALLET!, // 0x… wallet that consents to pay USDC
    coverageAmount: "50000000",        // $50 in USDC base units (6 decimals)
    asset: "USDC",
  });

  console.log("Policy purchased:", receipt.policyId, "tx:", receipt.txHash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
