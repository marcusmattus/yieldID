import { USDC_BY_NETWORK } from './solana';
import {
  decodeHeader,
  encodeHeader,
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  X402_VERSION,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type SettleResponse,
  type SolanaNetwork,
  type VerifyResponse,
} from './types';

/**
 * x402 paywall for YieldID's own endpoints: agents and exchange tools pay
 * per call in USDC on Solana, no account needed.
 *
 * Verification and settlement go through a facilitator (X402_FACILITATOR_URL).
 * The facilitator also pays the Solana network fee; its address comes from
 * X402_FEE_PAYER or from the facilitator's GET /supported.
 */

export interface PaywallConfig {
  facilitatorUrl: string;
  network: SolanaNetwork;
  payTo: string;
  feePayer: string;
  fetchImpl?: typeof fetch;
}

export interface PriceSpec {
  amountMicro: bigint;
  resource: string;
  description: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
}

export function requirementsFor(cfg: PaywallConfig, p: PriceSpec): PaymentRequirements {
  return {
    scheme: 'exact',
    network: cfg.network,
    maxAmountRequired: p.amountMicro.toString(),
    resource: p.resource,
    description: p.description,
    mimeType: p.mimeType ?? 'application/json',
    payTo: cfg.payTo,
    maxTimeoutSeconds: p.maxTimeoutSeconds ?? 60,
    asset: USDC_BY_NETWORK[cfg.network],
    extra: { feePayer: cfg.feePayer },
  };
}

function paymentRequired(req: PaymentRequirements, error: string): Response {
  const body: PaymentRequired = { x402Version: X402_VERSION, error, accepts: [req] };
  return Response.json(body, { status: 402 });
}

async function facilitator<T>(cfg: PaywallConfig, path: 'verify' | 'settle', payload: PaymentPayload, req: PaymentRequirements): Promise<T> {
  const f = cfg.fetchImpl ?? fetch;
  const res = await f(`${cfg.facilitatorUrl.replace(/\/$/, '')}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: req }),
  });
  if (!res.ok) throw new Error(`Facilitator ${path} returned ${res.status}.`);
  return (await res.json()) as T;
}

export type PaywallResult = { paid: true; settlement: SettleResponse; payer?: string } | { paid: false; response: Response };

/**
 * Check the request's X-PAYMENT. Answers 402 with the requirements when it is
 * missing or bad. Settles before the caller serves anything, so content is
 * never handed out against an unsettled payment.
 */
export async function requirePayment(request: Request, cfg: PaywallConfig, price: PriceSpec): Promise<PaywallResult> {
  const req = requirementsFor(cfg, price);
  const header = request.headers.get(PAYMENT_HEADER);
  if (!header) return { paid: false, response: paymentRequired(req, 'X-PAYMENT header is required') };

  let payload: PaymentPayload;
  try {
    payload = decodeHeader<PaymentPayload>(header);
  } catch {
    return { paid: false, response: paymentRequired(req, 'X-PAYMENT is not base64 JSON') };
  }
  if (payload.x402Version !== X402_VERSION || payload.scheme !== 'exact' || payload.network !== cfg.network || typeof payload.payload?.transaction !== 'string') {
    return { paid: false, response: paymentRequired(req, `Payment must be x402 v1, exact, ${cfg.network}`) };
  }

  let verify: VerifyResponse;
  try {
    verify = await facilitator<VerifyResponse>(cfg, 'verify', payload, req);
  } catch (e) {
    return { paid: false, response: Response.json({ ok: false, reason: (e as Error).message, fix: 'Try again shortly.' }, { status: 502 }) };
  }
  if (!verify.isValid) return { paid: false, response: paymentRequired(req, verify.invalidReason ?? 'Payment did not verify') };

  let settle: SettleResponse;
  try {
    settle = await facilitator<SettleResponse>(cfg, 'settle', payload, req);
  } catch (e) {
    return { paid: false, response: Response.json({ ok: false, reason: (e as Error).message, fix: 'Try again shortly.' }, { status: 502 }) };
  }
  if (!settle.success) return { paid: false, response: paymentRequired(req, settle.errorReason ?? 'Settlement failed') };
  return { paid: true, settlement: settle, payer: verify.payer };
}

/** Attach X-PAYMENT-RESPONSE to a paid response. */
export function withSettlement(res: Response, settlement: SettleResponse): Response {
  res.headers.set(PAYMENT_RESPONSE_HEADER, encodeHeader(settlement));
  res.headers.set('Access-Control-Expose-Headers', PAYMENT_RESPONSE_HEADER);
  return res;
}

let cachedFeePayer: { network: string; address: string } | null = null;

/** Build the paywall config from env. Returns why it cannot, so routes can answer 503 with a fix. */
export async function paywallFromEnv(fetchImpl: typeof fetch = fetch): Promise<{ ok: true; cfg: PaywallConfig } | { ok: false; reason: string; fix: string }> {
  const facilitatorUrl = process.env.X402_FACILITATOR_URL;
  const payTo = process.env.X402_PAY_TO;
  const network = (process.env.X402_NETWORK ?? 'solana-devnet') as SolanaNetwork;
  if (!facilitatorUrl || !payTo) {
    return { ok: false, reason: 'x402 paywall is not configured.', fix: 'Set X402_FACILITATOR_URL and X402_PAY_TO (your Solana address) in .env.local.' };
  }
  if (network !== 'solana' && network !== 'solana-devnet') return { ok: false, reason: `X402_NETWORK ${network} is not supported.`, fix: 'Use solana or solana-devnet.' };
  let feePayer = process.env.X402_FEE_PAYER ?? (cachedFeePayer?.network === network ? cachedFeePayer.address : '');
  if (!feePayer) {
    try {
      const res = await fetchImpl(`${facilitatorUrl.replace(/\/$/, '')}/supported`);
      const body = (await res.json()) as { kinds?: { scheme: string; network: string; extra?: { feePayer?: string } }[] };
      feePayer = body.kinds?.find((k) => k.scheme === 'exact' && k.network === network)?.extra?.feePayer ?? '';
    } catch {
      /* handled below */
    }
    if (!feePayer) return { ok: false, reason: `The facilitator does not list a fee payer for ${network}.`, fix: 'Set X402_FEE_PAYER, or use a facilitator that supports Solana.' };
    cachedFeePayer = { network, address: feePayer };
  }
  return { ok: true, cfg: { facilitatorUrl, network, payTo, feePayer, fetchImpl } };
}
