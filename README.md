# YieldID

Wallet-first web app for YieldForge: name your wallets with a YieldID, rank stable venues **net of move cost**, and sign every switch yourself. Built for the Colosseum Arena hackathon.

Next.js 15 (App Router) · TypeScript · Privy (Phantom, Solana wallets, email) · `@solana/kit` · YieldForge design system.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill it in, see below
npm run dev                  # http://localhost:3000
npm test                     # 50 tests: ranking, policy, SIWS, YieldID records, Ramp webhook signatures, x402 pay flow, live pool and Bazaar mapping
```

### `.env.local`

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | From dashboard.privy.io. In the dashboard, enable **Wallet** and **Email** login and turn on **Solana**. |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | Optional app client ID. |
| `SESSION_SECRET` | 32+ random characters. Signs the session and nonce cookies. |
| `NEXT_PUBLIC_SOLANA_RPC` | Solana RPC URL. The public one rate-limits; use Helius, Triton or QuickNode. |
| `NEXT_PUBLIC_YID_DOMAIN` | Domain whose DNS holds YieldID records (`_yid.<handle>.<domain>`). |
| `NEXT_PUBLIC_RAMP_HOST_API_KEY` | Ramp Network host API key. Empty opens Ramp's test environment (Base Sepolia test USDC only). |
| `NEXT_PUBLIC_RAMP_ENV` | `production` or `demo`. Defaults to production when a key is set. |
| `X402_NETWORKS` | Networks the paid API accepts: `solana`, `solana-devnet`, `base`, `base-sepolia`. Default `solana-devnet,base-sepolia`. |
| `X402_PAY_TO_SOLANA`, `X402_PAY_TO_EVM` | Your own addresses that receive x402 payments. A network without one is left out. |
| `X402_PRICE_USD` | Price per paid call, in USDC. Default `0.001`. |
| `X402_FACILITATOR_URL` | Verifies and settles payments. Default `https://x402.org/facilitator` (testnets). For mainnet, e.g. `https://facilitator.payai.network`. |

Add `http://localhost:3000` (and your deploy URL) to **Allowed origins** in the Privy dashboard.

## The app

- `/` landing page: what YieldID does, the net-rate example, the YieldID record, three ways to add crypto, and **Connect wallet** buttons into the app.
- The signed-in app is a light shell (dark icon rail, rounded main card, Earn / Build switch, theme toggle). Home (`/forge`) shows your **live** wallet USDC balance read from Solana, linked wallets, quick actions, gross vs net per venue and next steps.
- `/yid` YieldID maker: pick a handle (DNS availability check), add wallets (each extra Solana wallet signs a link message verified by `/api/wallets/prove`; EVM addresses are listed as not signed), sign the record, publish and verify.
- `/add-crypto`: your address with QR code and copy, the exact network and USDC mint, a live balance that rechecks every 15 s and shows arrivals, and guides for exchange, CCTP bridge, and card/bank through Privy's `useFundWallet`.

## How sign-in works

1. **Connect wallet** (`/connect`): lists the Solana wallets the browser actually has, with each wallet's own icon from the Wallet Standard (Phantom shows Phantom's icon from its extension). Clicking one opens Privy's connect modal for that wallet. Phantom is linked to install if it is missing. Email through Privy is the secondary line and creates an embedded Solana wallet.
2. **Sign to verify** (`/sign`): the server issues a single-use nonce. The page shows the sign-in-with-Solana message verbatim, the wallet signs it, and `/api/siws/verify` checks domain, address, statement, expiry, nonce and the ed25519 signature before setting an httpOnly session cookie. Connecting alone is a public-key read; no transaction, no allowance.
3. **YieldID maker** (`/yid`): the wallet signs the record body; you paste the TXT record into your DNS; **Check DNS** resolves it and verifies the signature (`/api/yid/resolve`). Anyone can do the same check.

Every app route (`app/(app)/*`) is gated server-side on the session cookie.

## The arithmetic

`lib/rates.ts`:

```
net  = gross − (moveCost × 365 ÷ horizonDays)
edge = net − net(current)
```

Gross, annualised move cost, net and edge stay separate fields and columns. The board sorts by net. A venue whose read failed, is older than the rule's freshness limit, is under the capacity floor, or comes from an unverified adapter is never ranked; it is listed under **Not ranked** with its reason.

`lib/policy.ts` runs the same ten checks in the same order every time and returns every result, passed and failed. **Sign transaction** stays disabled until all ten pass.

## What is live and what is sample

| Area | Status |
| --- | --- |
| Wallet connect, SIWS sign-in, sessions | Live |
| YieldID record signing and DNS verification | Live |
| Tracker: signatures for your address from Solana RPC, CSV export | Live |
| Wallet USDC and SOL balance on home and Add crypto | Live |
| Linking extra Solana wallets (signature-proven) | Live, list kept in this browser |
| Rule, spend policy, kill switch | Live in the app, stored in this browser. The on-chain policy PDA is not built; the policy screen says so. |
| Discover: stable venues ranked net (`/discover`, `/api/discover`) | Live, from DefiLlama's yields API. Base APY only; move cost is a stated estimate. |
| Discover: paid x402 services | Live, from the x402 Bazaar (Coinbase CDP). Listed by operators, not vetted. |
| Ramp on-ramp (Add crypto → Card or bank) | Live widget; production needs a Ramp host API key. Webhook at `/api/ramp/webhook` checks Ramp's signature. |
| Paid agent API `/api/x402/yields` | Live x402 v2. Takes test USDC until you set mainnet networks and payTo addresses. |
| Signal board venue rates, positions, routes | **Illustrative sample data** (`lib/sample.ts`), always inside an outlined region with the badge. Venue names are generic so no real venue is shown with an invented rate. |
| Building and simulating transactions | Not built. Sample venues have no adapter, so the slippage and simulation checks fail and say why. |
| Telegram, Discord, Slack bots | Not built. The channels screen shows scopes and a post preview. |
| y-stables (yUSD, yGBP, yUSDC, yUSDT) | Design only; issuer, custodian and authorities are placeholders. |

### Adding a live venue

Write an adapter that returns a `VenueRead` (see `lib/rates.ts`) with `source: 'live'` and a real `readAt`, and use it in `lib/useBoard.ts` in place of `sampleVenues`. The board, rule tester, proposal and channel preview all switch to it, and the data status becomes LIVE automatically. To make proposals signable, have the adapter build and simulate the transaction and pass `simulationOk` and `simulatedSlippageBp` into `runChecks`. Then sign with Privy's `useSignTransaction` from `@privy-io/react-auth/solana`.

## On-ramp, DeFi connection and the agent layer

**Ramp on-ramp.** `components/RampOnramp.tsx` opens Ramp Network's widget for `SOLANA_USDC` (or `BASE_USDC` to a linked EVM address), delivered to the user's own wallet. After a purchase starts, the page follows it with Ramp's purchase-status API using the purchase's own view token. Ramp's webhook (`webhookStatusUrl`, set automatically on https deploys) is verified in `lib/server/ramp.ts`: ECDSA secp256k1 over the key-sorted JSON body, against Ramp's published key for the configured environment.

**Live DeFi connection.** `lib/server/discovery.ts` reads DefiLlama's open pools every 5 minutes, keeps plain stablecoin deposits (single asset, no IL, at least $1m TVL) on Solana, Base, Arbitrum, Ethereum and Hyperliquid, and ranks them with the same `rankVenues` as the board. Gross is base APY; reward-token APY is shown, never counted. Move cost uses the estimate in `MOVE_COST_MODEL` (`lib/defi/pools.ts`).

**x402 agent API.** `lib/server/x402.ts` wraps a route with x402 v2 (`@x402/core`): no payment → `402` with a `PAYMENT-REQUIRED` header listing USDC on each configured network; a signed payment is verified by the facilitator, the handler runs, and the payment settles only if the handler succeeded. A failed read or a settle error never hands out paid data and never charges the agent for a failure on our side. The route declares the Bazaar discovery extension, so a facilitator that catalogues (CDP's) lists it for other agents.

**Discovery layer.** `/discover` shows both live indexes: where stablecoins earn net, and the stablecoin-priced x402 services agents pay for (ranked by distinct payers, at most two per host). Free summary at `/api/discover`; the full feed at `/api/x402/yields` costs `X402_PRICE_USD` per call.

```bash
curl "https://<your-deploy>/api/discover?horizon=30&chain=Solana,Base&asset=USDC"
curl -i "https://<your-deploy>/api/x402/yields?horizon=30&chain=Solana&asset=USDC"   # 402 + price
```

## Structure

```
app/
  page.tsx                Connect wallet
  sign/page.tsx           Sign to verify (SIWS)
  claim/                  Claim YieldID
  (app)/                  Signed-in screens: forge, board, rules, proposal,
                          stables, adapters, policy, channels, tracker
  api/siws/{nonce,verify} Sign-in
  api/session             Session read / disconnect
  api/yid/resolve         DNS resolve + signature check
  providers.tsx           PrivyProvider (Solana-only, Phantom first)
  styles/                 YieldForge tokens + component sheet + app additions
components/               Nav, wallet chip, data status, checks, math strip
lib/                      rates, policy, siws, yid, base58, store, sample data
lib/server/               session cookies, ed25519 verification (server only)
public/brand/             YieldID logo, mark and favicons
tests/                    vitest
```

## Notes

- `@solana/kit` is pinned to v5 and the `@solana-program/*` packages to the matching versions, because `@privy-io/react-auth` 3.x depends on kit v5.
- Nothing here is tax or legal advice. The y-stables involve regulated activity (issuing a GBP stablecoin in the UK falls under FCA rules); settle the issuer and custodian before building them.
