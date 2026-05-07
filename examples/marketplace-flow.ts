/**
 * examples/marketplace-flow.ts — end-to-end secondary-market flow.
 *
 * For broader lifecycle context (purchase → trigger → bond → wait/sell → redeem),
 * see [./end-to-end-flow.ts](./end-to-end-flow.ts).
 *
 *   LUMINA_API_KEY=lk_…             \
 *   SELLER_PRIVATE_KEY=0x…           \
 *   BUYER_PRIVATE_KEY=0x…            \
 *   BOND_ID=202805                   \
 *   RPC_URL=https://sepolia.base.org \
 *   npx ts-node examples/marketplace-flow.ts
 *
 * Walks through the full lifecycle:
 *   1. seller approves the marketplace as ERC-1155 operator (one-time)
 *   2. seller lists 10 units of `BOND_ID` at $1.50 each
 *   3. browser-agent fetches listings, picks the freshly-listed one,
 *      previews the total due (price + 1.5% taker fee)
 *   4. buyer approves USDC and executes the buy
 *   5. for unsold listings, the seller cancels and recovers their bonds
 */

import { JsonRpcProvider, Wallet } from "ethers";
import { LuminaClient, MarketplaceAPI, estimateBuyPrice } from "@lumina-org/sdk";

async function main() {
  const apiKey = process.env.LUMINA_API_KEY!;
  const sellerPk = process.env.SELLER_PRIVATE_KEY!;
  const buyerPk = process.env.BUYER_PRIVATE_KEY!;
  const bondId = BigInt(process.env.BOND_ID ?? "202805");
  const rpcUrl = process.env.RPC_URL ?? "https://sepolia.base.org";

  const provider = new JsonRpcProvider(rpcUrl);
  const seller = new Wallet(sellerPk, provider);
  const buyer = new Wallet(buyerPk, provider);

  const client = new LuminaClient({ apiKey });
  const sellerMarket = new MarketplaceAPI(client, seller);
  const buyerMarket = new MarketplaceAPI(client, buyer);

  // 1. approveBonds — one-time setup per seller wallet (no-op if already done).
  console.log("[1/5] approving ClaimBond for marketplace operator...");
  const approveBondsResult = await sellerMarket.approveBonds();
  console.log(
    approveBondsResult.txHash
      ? `      tx ${approveBondsResult.txHash}`
      : "      already approved — no tx needed"
  );

  // 2. list a bond at $1.50/unit, 10 units (= $15 total face).
  console.log("[2/5] listing 10 units of bond", bondId, "at $1.50/unit...");
  const listResult = await sellerMarket.list({
    bondId,
    amount: 10n,
    pricePerUnit: 1_500_000n,
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 86_400, // 7d (informational)
  });
  console.log(`      listed as #${listResult.listingId} (tx ${listResult.txHash})`);

  // 3. another agent reads listings + previews the buy.
  console.log("[3/5] previewing buy as the buyer...");
  const detail = await client.marketplace.listing(listResult.listingId!);
  const estimate = await estimateBuyPrice(client, detail.listingId);
  console.log(
    `      base price=${estimate.basePrice} USDC base units, ` +
      `taker fee=${estimate.takerFeeBps}bps, total due=${estimate.totalDue}`
  );

  // 4. buyer approves USDC for the total due, then executes the buy.
  console.log("[4/5] buyer approves USDC + executes buy...");
  await buyerMarket.approve({ amount: BigInt(estimate.totalDue) });
  const buyResult = await buyerMarket.buy({
    listingId: detail.listingId,
    amount: BigInt(detail.amount),
  });
  console.log(`      bought! tx ${buyResult.txHash}`);

  // 5. seller cancels any unsold listings (no-op here since we just sold,
  //    but shows the cancel path).
  console.log("[5/5] seller cancels any leftover listings...");
  const mine = await client.marketplace.myListings(seller.address);
  const stillActive = mine.filter((l) => l.status === "active");
  for (const l of stillActive) {
    const r = await sellerMarket.cancel({ listingId: l.listingId });
    console.log(`      cancelled #${l.listingId} (tx ${r.txHash})`);
  }
  if (stillActive.length === 0) {
    console.log("      nothing to cancel — all listings filled or already cancelled");
  }

  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
