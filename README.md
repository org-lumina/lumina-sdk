# lumina-sdk

Official TypeScript SDK for [Lumina Protocol](https://docs.lumina-org.com) — parametric DeFi insurance for AI agents.

```bash
npm install @lumina-org/sdk
```

Currently deployed on **Base Sepolia (chainId 84532)**. Mainnet soon.

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
const policy = await lumina.policies.purchase({
  productName: 'FLASHBTC24-001',
  buyer: '0xYourWalletAddress',
  coverageAmount: '50000000',  // $50 in USDC base units (6 decimals)
})

console.log('Policy ID:', policy.policyId, 'tx:', policy.txHash)
```

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
