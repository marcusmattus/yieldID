# YieldID for agents

YieldID gives AI agents, bots and exchange-side tools a narrow, capped way to work with a user's stablecoins:

- **x402 payments**: agents pay for APIs in USDC on Solana from their own wallet, and YieldID can charge agents per call.
- **Yield pot**: read the wallet balance, positions, ranked rates and projected yield; propose deposits and withdrawals.
- **Stablecoin cards**: issue virtual cards that spend USDC, freeze them, change limits; the owner adds them to Apple Pay or Google Pay.
- **Access**: scoped API keys, a REST API, a remote MCP endpoint and a local MCP server.

The one rule everywhere: **no agent can sign for the owner's wallet.** Moves come back as proposals the owner signs in the app. Payments an agent makes come from the agent's own wallet, inside caps the owner set.

## Keys

The owner creates keys on the **Agents** screen (`/agents`). A key looks like `yid_sk_<id>_<secret>`; only a hash of the secret is stored, and the full key is shown once.

| Scope | Lets the key |
| --- | --- |
| `pot:read` | Read wallet balance, pot status, rates, proposals and the deposit address |
| `pot:propose` | Propose deposits and withdrawals for the owner to sign |
| `x402:pay` | Get x402 payments authorised against the key's caps |
| `card:read` | List cards |
| `card:manage` | Issue virtual cards, freeze, unfreeze, change limits |

Every key also has a per-transaction cap, a daily cap (UTC day), an expiry (max 365 days) and, for `x402:pay`, an optional recipient allow-list. **Pause all agents** on the Agents screen is a kill switch that refuses every key at once.

Presets: **Read only** (`pot:read`, `card:read`) suits exchange dashboards and portfolio trackers. **Assistant** proposes moves. **Paying agent** pays for APIs.

## Connect

### Remote MCP (no install)

```
URL:    https://<your-yieldid>/api/mcp
Header: Authorization: Bearer yid_sk_…
```

Streamable HTTP, stateless. Works with Claude (custom connector), Cursor and any MCP client that can send a bearer header.

### Local MCP (adds x402 payments)

```bash
YIELDID_API_URL=https://<your-yieldid> \
YIELDID_API_KEY=yid_sk_… \
YIELDID_AGENT_WALLET_SECRET='[…64 numbers…]' \   # optional: the agent's own Solana keypair
YIELDID_X402_NETWORKS=solana \                    # or solana-devnet
YIELDID_X402_MAX_USDC=1 \                         # local ceiling per payment
npm run mcp
```

Claude Desktop / Claude Code config:

```json
{
  "mcpServers": {
    "yieldid": {
      "command": "npx",
      "args": ["tsx", "/path/to/yieldID/mcp/stdio.ts"],
      "env": { "YIELDID_API_URL": "https://<your-yieldid>", "YIELDID_API_KEY": "yid_sk_…" }
    }
  }
}
```

The agent wallet secret never leaves the agent's machine. Fund that wallet with a small amount of USDC; it needs no SOL because the x402 facilitator pays the network fee.

### Tools

| Tool | Scope | What it does |
| --- | --- | --- |
| `yieldid_whoami` | any | Owner, scopes, caps, spend today, kill switch |
| `pot_status` | `pot:read` | Live wallet USDC/SOL, positions, totals, projected yield at the best net rate |
| `pot_rates` | `pot:read` | Venues ranked by net, and venues not ranked with the reason |
| `pot_deposit_address` | `pot:read` | Address, network and USDC mint to fund the pot from an exchange, with warnings |
| `pot_propose` / `pot_proposals` | `pot:propose` / `pot:read` | Propose a deposit or withdrawal; see every check |
| `card_list` / `card_issue` / `card_update` | `card:read` / `card:manage` | Cards, issue, freeze/unfreeze, limits |
| `x402_fetch` | `x402:pay` | Fetch a URL; if it answers 402, authorise with YieldID, pay, retry (local only) |
| `x402_ledger` | any | Payments this key made |
| `agent_wallet` | local only | The agent's own paying address |

### REST

Same key as `Authorization: Bearer yid_sk_…`. Errors are always `{ ok: false, reason, fix }`.

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/api/agent/me` | any |
| GET | `/api/agent/pot` | `pot:read` |
| GET | `/api/agent/pot/rates` | `pot:read` |
| GET | `/api/agent/pot/deposit-address` | `pot:read` |
| GET / POST | `/api/agent/pot/proposals` | `pot:read` / `pot:propose` |
| GET / POST | `/api/agent/cards` | `card:read` / `card:manage` |
| PATCH | `/api/agent/cards/:id` | `card:manage` |
| POST | `/api/agent/x402/authorize` | `x402:pay` |
| POST | `/api/agent/x402/settled`, `/api/agent/x402/release` | `x402:pay` |
| GET | `/api/agent/x402/ledger` | any |

Owner-only (session cookie, API keys refused): `/api/agent/keys`, `/api/agent/kill`, `/api/agent/owner`, `POST /api/agent/cards/:id/provision`.

## x402

**Paying (agent side).** `lib/x402/client.ts` implements x402 v1, scheme `exact`, on `solana` and `solana-devnet`, USDC only. On a 402 it picks the cheapest usable offer under the ceiling, asks YieldID to authorise it (`/api/agent/x402/authorize` checks scope, caps, recipient list and kill switch, and reserves the amount atomically), then builds a transaction (compute budget + one `TransferChecked` to `payTo`, facilitator as fee payer), signs it with the agent wallet and retries with `X-PAYMENT`. The settlement signature is written back to the ledger; a failed payment releases the reservation. x402 v2 servers are detected and refused with a clear message.

**Charging (YieldID side).** `lib/x402/server.ts` is a paywall for route handlers: it answers 402 with requirements, verifies and **settles before serving**, and returns `X-PAYMENT-RESPONSE`. `GET /api/x402/rates` uses it to sell the ranked venue board for 0.01 USDC a call, no account needed. Configure with `X402_FACILITATOR_URL`, `X402_PAY_TO`, `X402_NETWORK` (see `.env.example`).

## Yield pot

`lib/pot` reads the owner's wallet live from Solana. Venue rates are the existing illustrative sample set until a live `VenueAdapter` is registered in `lib/pot/index.ts`; every response says `dataSource: "sample"` until then. Without an adapter there are no position reads and no transaction to build, so proposals come back **blocked**, with each check and its fix. With an adapter that builds and simulates, a passing proposal carries an unsigned transaction and waits for the owner's signature.

## Cards and phone wallets

`lib/card` defines a `CardIssuer` interface. `CARD_ISSUER=sandbox` (default) issues labelled sandbox records: no card number, nothing spendable, and wallet payloads Apple and Google will reject. Any other value uses `PartnerIssuer`, which refuses every call and names what is missing until it is implemented.

Adding a card to a phone is owner-only by design:

- **Apple Pay**: the iOS app shows `PKAddPaymentPassViewController`; its delegate gets `certificates`, `nonce`, `nonceSignature`; the app posts them to `/api/agent/cards/:id/provision` with `wallet: "apple_pay"`; the issuer returns `activationData`, `encryptedPassData`, `ephemeralPublicKey` for `PKAddPaymentPassRequest`.
- **Google Pay**: the Android app reads `stableHardwareId` and `activeWalletId` from TapAndPay, posts them with `wallet: "google_pay"`, and passes the returned `opaquePaymentCard` to `pushTokenize`.

## What you need to supply to go live

| Needed for | What | Where it goes |
| --- | --- | --- |
| Agent layer in production | A database (Postgres, Upstash Redis, …). The file store does not work on serverless. | Implement `AgentStore` in `lib/agent/store.ts` |
| x402 charging | A facilitator that supports Solana (e.g. the x402.org facilitator for devnet, or a mainnet one such as PayAI or Coinbase CDP, which needs CDP API keys), and a Solana address to receive USDC | `X402_FACILITATOR_URL`, `X402_PAY_TO`, `X402_NETWORK`, optional `X402_FEE_PAYER` and facilitator API keys |
| Pot reads and agent payments | A paid Solana RPC (Helius, Triton, QuickNode) | `SOLANA_RPC_URL`, `YIELDID_SOLANA_RPC` |
| Live pot moves | A `VenueAdapter` per venue (read, position, build + simulate deposit/withdraw) | `lib/pot/index.ts` `ADAPTERS` |
| Real cards | A card issuing partner for USDC-funded cards (Rain, Bridge by Stripe, Baanx; or Lithic/Marqeta with your own stablecoin leg): program agreement, BIN sponsor, KYC, API keys | `CARD_ISSUER=<partner>`, `CARD_ISSUER_<PARTNER>_API_KEY`, implement `lib/card/partner.ts` |
| Apple Pay | Apple Developer account, the In-App Provisioning entitlement (`com.apple.developer.payment-pass-provisioning`, requested via the issuer and Apple), a native iOS app | iOS app |
| Google Pay | Google Pay push provisioning API access (requested via the issuer), a native Android app with the TapAndPay SDK | Android app |

Card issuing, stablecoin spending and payments are regulated. The issuer partner normally carries the licences and KYC; confirm the program terms before launching, especially for UK users (FCA).
