import { address as toAddress, createSolanaRpc } from '@solana/kit';

/**
 * Chain reads shared by the browser and the server (agent API, MCP).
 * No 'use client' here so route handlers can import it.
 */
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com';
/** Circle's USDC mint on Solana mainnet. */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** Circle's USDC mint on Solana devnet. */
export const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const USDC_DECIMALS = 6;

/** Read the wallet's own USDC and SOL from chain. Nothing here is custodied by us. */
export async function readBalances(owner: string, rpcUrl: string = RPC_URL): Promise<{ usdc: number; sol: number }> {
  const rpc = createSolanaRpc(rpcUrl);
  const addr = toAddress(owner);
  const [lamports, tokens] = await Promise.all([
    rpc.getBalance(addr).send(),
    rpc.getTokenAccountsByOwner(addr, { mint: toAddress(USDC_MINT) }, { encoding: 'jsonParsed' }).send(),
  ]);
  let usdc = 0;
  for (const acc of tokens.value) {
    const info = (acc.account.data as unknown as { parsed: { info: { tokenAmount: { uiAmountString: string } } } }).parsed.info;
    usdc += Number(info.tokenAmount.uiAmountString);
  }
  return { usdc, sol: Number(lamports.value) / 1e9 };
}

/** USDC as an integer count of micro-units (6 decimals). Rejects NaN, negatives and sub-micro precision. */
export function toMicro(usdc: number): bigint {
  if (!Number.isFinite(usdc) || usdc < 0) throw new Error('Amount must be a non-negative number.');
  const micro = Math.round(usdc * 1e6);
  if (Math.abs(micro - usdc * 1e6) > 1e-6) throw new Error('Amount has more than 6 decimal places.');
  return BigInt(micro);
}

export function fromMicro(micro: bigint | string): number {
  return Number(BigInt(micro)) / 1e6;
}
