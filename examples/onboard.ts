/**
 * examples/onboard.ts — self-service mint your first API key.
 *
 *   PRIVATE_KEY=0x… npx ts-node examples/onboard.ts
 */

import { Wallet } from "ethers";
import { LuminaClient } from "@lumina-org/sdk";

async function main() {
  const wallet = new Wallet(process.env.PRIVATE_KEY!);
  const lumina = new LuminaClient({ apiKey: "" }); // empty for onboard

  const result = await lumina.agent.onboard(wallet, { label: "my-trading-bot" });

  console.log("Save this NOW (shown only once):");
  console.log("  apiKey:", result.apiKey);
  console.log("  keyId :", result.keyId);
  console.log("  wallet:", result.wallet);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
