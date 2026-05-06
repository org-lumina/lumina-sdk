/**
 * examples/list-products-and-explain.ts — list every Lumina product and
 * print a tidy table explaining what each one covers.
 *
 * Run:
 *   LUMINA_API_KEY=lk_… npx ts-node examples/list-products-and-explain.ts
 *
 * Requires SDK 0.4.0+ AND an API server at the matching version. If the
 * server omits the new fields (older deployment), the script falls back to
 * a clear "API version < 0.4-compat" notice per row.
 */

import { LuminaClient, type Product } from "@lumina-org/sdk";

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value + " ".repeat(width - value.length);
}

async function main() {
  const lumina = new LuminaClient({ apiKey: process.env.LUMINA_API_KEY! });

  const products: Product[] = await lumina.products.list();

  const header =
    pad("displayName", 22) +
    pad("coveredAsset", 14) +
    pad("paymentAsset", 14) +
    "coverageDescription";
  console.log(header);
  console.log("-".repeat(header.length + 60));

  for (const p of products) {
    const covered = p.coveredAsset ?? "—";
    const payment = p.paymentAsset ?? "—";
    const desc =
      p.coverageDescription ??
      "(API version < 0.4-compat — coveredAsset not exposed)";
    console.log(
      pad(p.displayName, 22) +
        pad(covered, 14) +
        pad(payment, 14) +
        desc
    );
  }

  console.log("");
  console.log(
    "Reminder: premium is ALWAYS paid in USDC, regardless of coveredAsset."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
