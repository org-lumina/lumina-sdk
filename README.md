# lumina-sdk

Official TypeScript SDK for [Lumina Protocol](https://docs.lumina-org.com) — parametric DeFi insurance for AI agents.

```bash
npm install @lumina-org/sdk
```

Currently deployed on **Base Sepolia (chainId 84532)**. Mainnet soon.

## Lifecycle Overview

How Lumina goes from a USDC premium to a LUMINA payout, in 6 steps:

```
Buyer pays USDC premium
    │
    ▼
Active Policy
    │ (parametric event triggers, on-chain, automatic)
    ▼
ClaimBond NFT (ERC-1155, $1 face/unit, 730d maturity)
    │
    ▼ Decision: wait or sell?
    │
    ├──► OPTION A: Wait 730 days, redeem for $LUMINA
    │       (units × $1) ÷ LUMINA_price_at_maturity
    │
    └──► OPTION B: List on marketplace, get USDC now
            (price - 3% fees), buyer receives bond
                │
                ▼
            New holder, same choice at maturity
```

**Premium = USDC. Marketplace trade = USDC. Bond redeem at maturity = $LUMINA.**

Worked example: a $3 USDC premium covering $800 → trigger fires → 800-unit bond minted → wait 730d → at $0.50 LUMINA price → receive 1,600 LUMINA. See [end-to-end-flow.ts](./examples/end-to-end-flow.ts) for the SDK code.

Read the full lifecycle docs: [docs.lumina-org.com/concepts/lifecycle](https://docs.lumina-org.com/concepts/lifecycle).

## Quick start

```ts
import { LuminaClient } from '@lumina-org/sdk'

const lumina = new LuminaClient({ apiKey: process.env.LUMINA_API_KEY! })

// 1. Discover live config
const health = await lumina.health()
console.log('Connected to chain:', health.chain.chainId)

// 2. Buy a $50 policy on the 24h flash-crash BTC product.
//    Pass productName — the SDK 0.3.0+ resolves both the bytes32 productId
//    hash AND the per-shield asset literal (BTC/ETH/USDT/USDC) for you.
//    The `asset` field below means the COVERED asset (BTC). Premium is
//    always paid in USDC.
const policy = await lumina.policies.purchase({
  productName: 'FLASHBTC24-001',
  buyer: '0xYourWalletAddress',
  coverageAmount: '50000000',  // $50 in USDC base units (6 decimals)
})

console.log('Policy ID:', policy.policyId, 'tx:', policy.txHash)
```

> **Premium is always paid in USDC.** The `asset` field on a purchase or
> product refers to the *covered* asset (what the policy insures against),
> not the payment token.

> Hardcoding `asset: 'USDC'` for every shield reverts 7-of-9 with
> `InvalidAsset(bytes32("USDC"))` — only `RATESHOCK-001` actually expects USDC.
> See [products and assets](https://docs.lumina-org.com/agents/products-and-assets)
> for the registry.

## Get an API key (self-service)

```ts
import { Wallet } from 'ethers'
import { LuminaClient } from '@lumina-org/sdk'

const wallet = new Wallet(process.env.PRIVATE_KEY!)
const lumina = new LuminaClient({ apiKey: '' })  // empty for onboard

const result = await lumina.agent.onboard(wallet, { label: 'my-trading-bot' })
console.log('Save this now (shown once):', result.apiKey)
```

The SDK signs the canonical onboarding message
`Lumina onboarding for {address} at {timestamp}` with your wallet
(EIP-191 personal_sign), the API verifies the signature, and the response
includes a freshly-minted `lk_…` key. Up to 3 active keys per wallet.

## Resource sub-clients

```ts
lumina.health()                     // GET /health
lumina.products.list()              // GET /products
lumina.products.get(productId)      // GET /products/:id
lumina.products.quote(id, cover)    // GET /products/:id/quote

lumina.policies.list()              // GET /api/v1/policies
lumina.policies.get(prod, polId)    // GET /policies/:prod/:id (public)
lumina.policies.purchase({ … })     // POST /api/v1/policies

lumina.bonds.list()                 // GET /api/v1/bonds
lumina.marketplace.listings({ … })  // GET /api/v1/marketplace/listings

lumina.agent.onboard(signer, opts)
lumina.agent.listKeys()
lumina.agent.revokeKey(keyId)

lumina.webhooks.create({ url, events })
lumina.webhooks.list()
lumina.webhooks.delete(id)

lumina.sandbox.info()
lumina.sandbox.try(productId?)      // public, $1 cap, 10/h/IP
```

## Understanding products

Lumina currently exposes 9 parametric insurance products. Each product
insures against an event involving a specific **covered asset**, and SDK
0.4.0+ surfaces this explicitly via `Product.coveredAsset`,
`Product.paymentAsset`, and `Product.coverageDescription`.

| productName       | coveredAsset | coverageDescription                                          |
|-------------------|--------------|--------------------------------------------------------------|
| FLASHBTC1H-001    | BTC          | Insures BTC against rapid price crashes within 1 hour        |
| FLASHBTC4H-001    | BTC          | Insures BTC against rapid price crashes within 4 hours       |
| FLASHBTC24-001    | BTC          | Insures BTC against rapid price crashes within 24 hours      |
| FLASHBTC48-001    | BTC          | Insures BTC against rapid price crashes within 48 hours      |
| FLASHETH1H-001    | ETH          | Insures ETH against rapid price crashes within 1 hour        |
| FLASHETH24-001    | ETH          | Insures ETH against rapid price crashes within 24 hours      |
| FLASHETH48-001    | ETH          | Insures ETH against rapid price crashes within 48 hours      |
| MICRODEPEG-001    | USDT         | Insures against USDT losing its peg to $1.00                 |
| RATESHOCK-001     | USDC         | Insures against USDC borrow rate shocks on Aave V3           |

> **Premium is always paid in USDC.** The `asset` field on a purchase or
> product refers to the *covered* asset (what the policy insures against),
> not the payment token. Both `Product.paymentAsset` and the implicit
> settlement currency are always `USDC`.

See `examples/list-products-and-explain.ts` for a runnable script that
prints this table from a live `/products` call.

## Marketplace operations

The secondary marketplace lets agents trade ClaimBonds (the ERC-1155
receipts a triggered policy mints). SDK 0.5.0+ exposes the full
read+write surface, including ABI-bundled write helpers that handle
calldata encoding and ERC-20/ERC-1155 approvals for you.

| Method                  | Signature                                            | Brief                                              |
|-------------------------|------------------------------------------------------|----------------------------------------------------|
| `listings`              | `(params?) => Listing[]`                             | Browse active listings (limit/offset/sort).        |
| `listing`               | `(id) => Listing`                                    | Fetch one listing by id.                           |
| `stats`                 | `() => MarketplaceStats`                             | Floor, 24h volume, active count, total volume.     |
| `history`               | `({ limit, offset }?) => Trade[]`                    | Executed trades, most-recent first.                |
| `myListings`            | `(seller) => Listing[]`                              | Listings created by `seller`.                      |
| `list`                  | `(ListParams) => TxResult`                           | Create a listing (parses on-chain `Listed` event). |
| `buy`                   | `(BuyParams) => TxResult`                            | Execute a buy on a listing.                        |
| `cancel`                | `(CancelParams) => TxResult`                         | Cancel one of your own listings.                   |
| `approve`               | `({ amount }) => TxResult`                           | USDC approve to marketplace; no-op if sufficient.  |
| `approveBonds`          | `() => TxResult`                                     | ClaimBond `setApprovalForAll`; no-op if approved.  |

```ts
import { JsonRpcProvider, Wallet } from 'ethers'
import { LuminaClient, MarketplaceAPI, estimateBuyPrice } from '@lumina-org/sdk'

const provider = new JsonRpcProvider('https://sepolia.base.org')
const seller = new Wallet(process.env.SELLER_PRIVATE_KEY!, provider)

const client = new LuminaClient({ apiKey: process.env.LUMINA_API_KEY! })
const market = new MarketplaceAPI(client, seller)

await market.approveBonds()                                    // one-time
const r = await market.list({
  bondId: 202805n, amount: 10n, pricePerUnit: 1_500_000n, expiresAt: 0,
})
console.log('listed as', r.listingId)
```

> **Marketplace lives on Base Sepolia (chainId 84532).** Fees are 1.5%
> maker + 1.5% taker (3% round-trip). Anti-spam floor is $1.00 per unit.

See [`examples/marketplace-flow.ts`](./examples/marketplace-flow.ts) for an
end-to-end script: `approveBonds` → `list` → `buy` → `cancel`.

Read the full marketplace spec at
[https://docs.lumina-org.com/concepts/marketplace](https://docs.lumina-org.com/concepts/marketplace).

## Errors

Every non-2xx response throws `LuminaError`:

```ts
import { LuminaError } from '@lumina-org/sdk'

try {
  await lumina.policies.purchase({ … })
} catch (err) {
  if (err instanceof LuminaError) {
    console.error(err.status, err.code, err.message)
    if (err.code === 'shield_paused') { /* try later */ }
  }
}
```

Common codes: `invalid_api_key` (401), `validation_error` (400),
`shield_paused` / `exceeds_capacity` (422), `rate_limit` (429),
`network_error` (0 — local fetch failure).

## Webhooks

Subscribe a URL; the API will POST JSON payloads on each matching event with
an `X-Lumina-Signature` header equal to `hex(HMAC-SHA256(rawBody, secret))`.

```ts
const sub = await lumina.webhooks.create({
  url: 'https://my-bot.example.com/lumina',
  events: ['policy_purchased', 'policy_triggered'],
})
console.log('STORE THIS SECRET NOW:', sub.secret)
```

Receivers verify with the standard HMAC dance — see
[the docs](https://docs.lumina-org.com/agents/webhooks) for a worked example.

## Configuration

```ts
new LuminaClient({
  apiKey: 'lk_…',
  baseUrl: 'https://lumina-api-production-ac85.up.railway.app',  // default
})
```

Use `baseUrl: 'http://localhost:3000'` to talk to a local API checkout.

## Documentation

Full API reference, sequence diagrams, and integration recipes:
**https://docs.lumina-org.com**

## License

MIT — © 2026 Lumina Protocol
