import {
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit';
import { findAssociatedTokenPda, getTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { USDC_DECIMALS, USDC_MINT, USDC_MINT_DEVNET } from '../chain';
import type { PaymentPayload, PaymentRequirements, SolanaNetwork } from './types';

/** The only assets this client pays with: native USDC on each network. */
export const USDC_BY_NETWORK: Record<SolanaNetwork, string> = {
  solana: USDC_MINT,
  'solana-devnet': USDC_MINT_DEVNET,
};

export const isSolanaNetwork = (n: string): n is SolanaNetwork => n === 'solana' || n === 'solana-devnet';

const COMPUTE_BUDGET = address('ComputeBudget111111111111111111111111111111');

function u32le(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function u64le(n: bigint) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

export function setComputeUnitLimit(units: number): Instruction {
  return { programAddress: COMPUTE_BUDGET, data: new Uint8Array([2, ...u32le(units)]) };
}
export function setComputeUnitPrice(microLamports: bigint): Instruction {
  return { programAddress: COMPUTE_BUDGET, data: new Uint8Array([3, ...u64le(microLamports)]) };
}

export interface BuildPaymentInput {
  requirement: PaymentRequirements;
  signer: TransactionSigner;
  latestBlockhash: { blockhash: Blockhash; lastValidBlockHeight: bigint };
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: bigint;
}

/**
 * Build the x402 "exact" payment for Solana: compute budget, then one
 * TransferChecked of `maxAmountRequired` USDC from the payer's token account
 * to payTo's. The facilitator is the fee payer and adds its signature when it
 * settles, so the payer needs no SOL.
 */
export async function buildSolanaPayment(input: BuildPaymentInput): Promise<PaymentPayload> {
  const r = input.requirement;
  if (r.scheme !== 'exact') throw new Error(`Unsupported scheme ${r.scheme}.`);
  if (!isSolanaNetwork(r.network)) throw new Error(`Unsupported network ${r.network}.`);
  if (r.asset !== USDC_BY_NETWORK[r.network]) throw new Error(`Asset ${r.asset} is not USDC on ${r.network}.`);
  const feePayer = typeof r.extra?.feePayer === 'string' ? r.extra.feePayer : null;
  if (!feePayer) throw new Error('Payment requirement has no extra.feePayer; the facilitator must name one for Solana.');
  const amount = BigInt(r.maxAmountRequired);
  if (amount <= 0n) throw new Error('Amount must be positive.');

  const mint = address(r.asset);
  const [source] = await findAssociatedTokenPda({ owner: input.signer.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const [destination] = await findAssociatedTokenPda({ owner: address(r.payTo), mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });

  const transfer = getTransferCheckedInstruction({
    source,
    mint,
    destination,
    authority: input.signer,
    amount,
    decimals: USDC_DECIMALS,
  });

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(input.latestBlockhash, m),
    (m) =>
      appendTransactionMessageInstructions(
        [setComputeUnitLimit(input.computeUnitLimit ?? 40_000), setComputeUnitPrice(input.computeUnitPriceMicroLamports ?? 1n), transfer],
        m,
      ),
  );
  const signed = await partiallySignTransactionMessageWithSigners(message);
  return {
    x402Version: 1,
    scheme: 'exact',
    network: r.network,
    payload: { transaction: getBase64EncodedWireTransaction(signed) },
  };
}
