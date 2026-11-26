/**
 * x402 v1 wire types (https://github.com/coinbase/x402, "exact" scheme).
 *
 * A server answers 402 with PaymentRequired. The client retries the same
 * request with an X-PAYMENT header holding base64(JSON PaymentPayload). The
 * server verifies and settles through a facilitator and returns
 * X-PAYMENT-RESPONSE with base64(JSON SettleResponse).
 */

export const X402_VERSION = 1;
export const PAYMENT_HEADER = 'X-PAYMENT';
export const PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE';

export type SolanaNetwork = 'solana' | 'solana-devnet';

export interface PaymentRequirements {
  scheme: 'exact' | string;
  network: SolanaNetwork | string;
  /** Atomic units of `asset` (micro-USDC for USDC), as a decimal string. */
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  /** Token mint for Solana networks. */
  asset: string;
  /** Solana: { feePayer } is the facilitator's address that pays the network fee. */
  extra?: Record<string, unknown> | null;
  outputSchema?: unknown;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  accepts: PaymentRequirements[];
}

export interface SolanaExactPayload {
  /** Base64 wire transaction, signed by the payer, fee payer signature left empty. */
  transaction: string;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: SolanaNetwork;
  payload: SolanaExactPayload;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  /** Solana transaction signature. */
  transaction: string;
  network: string;
  payer?: string;
}

export function encodeHeader(v: unknown): string {
  return Buffer.from(JSON.stringify(v)).toString('base64');
}

export function decodeHeader<T>(v: string): T {
  return JSON.parse(Buffer.from(v, 'base64').toString('utf8')) as T;
}
