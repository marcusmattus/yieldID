import { createSolanaRpc, type TransactionSigner } from '@solana/kit';
import { buildSolanaPayment, isSolanaNetwork, USDC_BY_NETWORK } from './solana';
import {
  decodeHeader,
  encodeHeader,
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  type PaymentRequired,
  type PaymentRequirements,
  type SettleResponse,
  type SolanaNetwork,
} from './types';

/**
 * x402 client for agents: fetch a URL, and if it answers 402, pay in USDC on
 * Solana from the agent's own wallet and retry once.
 *
 * `authorize` runs before anything is signed. The MCP server points it at the
 * YieldID API, which checks the key's scope, caps, recipient list and the
 * owner's kill switch, and reserves the amount on the ledger.
 */

export class X402Error extends Error {
  constructor(
    message: string,
    public fix: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export async function readPaymentRequired(res: Response): Promise<PaymentRequired> {
  if (res.headers.get('payment-required')) {
    throw new X402Error('This server speaks x402 v2.', 'This client supports x402 v1 (X-PAYMENT). Ask the provider for a v1 endpoint, or upgrade the client.');
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new X402Error('402 response had no JSON body.', 'The server is not an x402 server, or is misconfigured.');
  }
  const pr = body as PaymentRequired;
  if (!pr || typeof pr !== 'object' || !Array.isArray(pr.accepts)) {
    throw new X402Error('402 response has no accepts list.', 'The server is not an x402 server, or is misconfigured.');
  }
  if (pr.x402Version !== 1) throw new X402Error(`Unsupported x402 version ${pr.x402Version}.`, 'This client supports x402 v1.');
  return pr;
}

export interface SelectOptions {
  networks: SolanaNetwork[];
  /** Largest amount the caller will pay, micro-USDC. */
  maxMicro: bigint;
}

export type Selection = { ok: true; requirement: PaymentRequirements; amountMicro: bigint } | { ok: false; reasons: string[] };

/** Pick the cheapest Solana USDC "exact" option within the ceiling, saying why each other one was skipped. */
export function selectRequirement(accepts: PaymentRequirements[], opts: SelectOptions): Selection {
  const reasons: string[] = [];
  let best: { requirement: PaymentRequirements; amountMicro: bigint } | null = null;
  for (const r of accepts) {
    const tag = `${r.scheme}/${r.network}`;
    if (r.scheme !== 'exact') {
      reasons.push(`${tag}: scheme not supported`);
      continue;
    }
    if (!isSolanaNetwork(r.network) || !opts.networks.includes(r.network)) {
      reasons.push(`${tag}: network not enabled (enabled: ${opts.networks.join(', ')})`);
      continue;
    }
    if (r.asset !== USDC_BY_NETWORK[r.network]) {
      reasons.push(`${tag}: asset ${r.asset} is not USDC`);
      continue;
    }
    let amount: bigint;
    try {
      amount = BigInt(r.maxAmountRequired);
    } catch {
      reasons.push(`${tag}: amount ${r.maxAmountRequired} is not an integer`);
      continue;
    }
    if (amount > opts.maxMicro) {
      reasons.push(`${tag}: asks ${amount} micro-USDC, ceiling ${opts.maxMicro}`);
      continue;
    }
    if (!best || amount < best.amountMicro) best = { requirement: r, amountMicro: amount };
  }
  return best ? { ok: true, ...best } : { ok: false, reasons };
}

export interface Authorization {
  ok: boolean;
  /** Ledger reservation, released if the payment never lands. */
  reservationId?: string;
  reason?: string;
  fix?: string;
  checks?: unknown;
}

export interface PayingFetchOptions {
  signer: TransactionSigner;
  rpcUrl: string;
  networks: SolanaNetwork[];
  maxMicro: bigint;
  authorize?: (r: PaymentRequirements, amountMicro: bigint) => Promise<Authorization>;
  onSettled?: (reservationId: string | undefined, settlement: SettleResponse | null) => Promise<void>;
  onFailed?: (reservationId: string | undefined) => Promise<void>;
  fetchImpl?: typeof fetch;
  getLatestBlockhash?: () => Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
}

export interface PaidResult {
  response: Response;
  paid: null | { requirement: PaymentRequirements; amountMicro: bigint; settlement: SettleResponse | null };
}

export async function fetchWithPayment(url: string, init: RequestInit, o: PayingFetchOptions): Promise<PaidResult> {
  const f = o.fetchImpl ?? fetch;
  const first = await f(url, init);
  if (first.status !== 402) return { response: first, paid: null };

  const pr = await readPaymentRequired(first);
  const sel = selectRequirement(pr.accepts, { networks: o.networks, maxMicro: o.maxMicro });
  if (!sel.ok) throw new X402Error('No payment option this agent can use.', 'Raise the ceiling, enable the network, or use another provider.', sel.reasons);

  const auth = o.authorize ? await o.authorize(sel.requirement, sel.amountMicro) : { ok: true };
  if (!auth.ok) throw new X402Error(auth.reason ?? 'Payment not authorised.', auth.fix ?? 'Check the key caps on the Agents screen.', auth.checks);

  try {
    const latest = o.getLatestBlockhash
      ? await o.getLatestBlockhash()
      : (await createSolanaRpc(o.rpcUrl).getLatestBlockhash({ commitment: 'confirmed' }).send()).value;
    const payment = await buildSolanaPayment({
      requirement: sel.requirement,
      signer: o.signer,
      latestBlockhash: latest as Parameters<typeof buildSolanaPayment>[0]['latestBlockhash'],
    });
    const headers = new Headers(init.headers);
    headers.set(PAYMENT_HEADER, encodeHeader(payment));
    const second = await f(url, { ...init, headers });
    const raw = second.headers.get(PAYMENT_RESPONSE_HEADER);
    const settlement = raw ? decodeHeader<SettleResponse>(raw) : null;
    if (!second.ok || (settlement && !settlement.success)) {
      await o.onFailed?.(auth.reservationId);
      return { response: second, paid: null };
    }
    await o.onSettled?.(auth.reservationId, settlement);
    return { response: second, paid: { requirement: sel.requirement, amountMicro: sel.amountMicro, settlement } };
  } catch (e) {
    await o.onFailed?.(auth.reservationId);
    throw e;
  }
}
