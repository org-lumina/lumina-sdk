/**
 * examples/browse-marketplace.ts — browse active bond listings.
 *
 *   LUMINA_API_KEY=lk_… npx ts-node examples/browse-marketplace.ts
 */

import { LuminaClient } from "@lumina-org/sdk";

async function main() {
  const lumina = new LuminaClient({ apiKey: process.env.LUMINA_API_KEY! });

  const listings = await lumina.marketplace.listings({
    sortBy: "price-asc",
    limit: 10,
  });

  console.log(`Found ${listings.length} active listings (cheapest first):`);
  for (const l of listings) {
    console.log(`  bond ${l.bondId}  @  ${l.totalPriceUsdc} USDC base units (listing #${l.listingId})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
