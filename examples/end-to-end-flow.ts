/**
 * end-to-end-flow.ts
 *
 * Full agent lifecycle: purchase → check bonds → decide → wait/sell → redeem/list.
 * Walks through the 6 steps documented at https://docs.lumina-org.com/concepts/lifecycle.
 *
 * Run:  ts-node examples/end-to-end-flow.ts
 */

import { LuminaClient } from '../src';

async function main() {
  const lumina = new LuminaClient({
    apiKey: process.env.LUMINA_API_KEY!,
    privateKey: process.env.BOT_PRIVATE_KEY!,
  });

  // STEP 1 — Buy a $100 policy on FlashBTC1h
  console.log('Step 1: purchase policy');
  const purchase = await lumina.policies.purchase({
    productName: 'FLASHBTC1H-001',
    coverageAmount: '100000000', // $100 USDC raw (6 decimals)
    asset: 'BTC', // covered asset (not payment token)
  });
  console.log(`  policyId=${purchase.policyId}  txHash=${purchase.txHash}`);

  // STEP 2 — Wait for the trigger (parametric, on-chain).
  // In production: subscribe to webhooks. For demo, simulate with sleep + bonds.list().

  // STEP 3 — After trigger, you receive a ClaimBond. List your bonds.
  console.log('Step 3: check bonds');
  const bonds = await lumina.bonds.list();
  console.log(`  ${bonds.length} bond(s) in wallet`);

  if (bonds.length === 0) {
    console.log('  No bonds yet (trigger has not fired). Demo ends here.');
    return;
  }

  const bond = bonds[0];
  console.log(`  bondId=${bond.epochId}  units=${bond.balance}  maturity=${bond.maturityDate}`);

  // STEP 4 — Decision time: wait OR sell.
  //
  // OPTION A: wait until maturity (730 days from mint), then call bonds.redeem.
  //   You receive $LUMINA = (units × $1) / LUMINA_price_at_redeem.
  //
  // OPTION B: list on marketplace now, receive USDC at a discount.
  //   Fees 1.5% maker + 1.5% taker = 3% total.

  const sellNow = process.env.SELL_NOW === 'true';

  if (sellNow) {
    // OPTION B
    console.log('Step 4 (B): list on marketplace');
    const stats = await lumina.marketplace.stats();
    console.log(`  current floor=${stats.floor}  totalListings=${stats.totalListings}`);

    // List at face value × 0.95 (5% discount for instant USDC).
    const pricePerUnit = '950000'; // $0.95 per unit raw USDC
    const listing = await lumina.marketplace.list({
      bondId: bond.epochId,
      amount: bond.balance,
      pricePerUnit,
      expiresAt: Math.floor(Date.now() / 1000) + 7 * 86400, // 7 days
    });
    console.log(`  listed: txHash=${listing.txHash}  listingId=${listing.listingId}`);
  } else {
    // OPTION A
    console.log('Step 4 (A): wait until maturity, then redeem');
    console.log('  Pseudocode:');
    console.log("  await sleep(730 * 86400 * 1000); // 730 days");
    console.log("  const redeem = await lumina.bonds.redeem({ bondId: bond.epochId });");
    console.log("  console.log(`  received ${redeem.luminaAmount} $LUMINA`);");
    console.log('  (Not actually waiting in this demo.)');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
