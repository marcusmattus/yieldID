'use client';

import { address as toAddress, createSolanaRpc } from '@solana/kit';
import { useCallback, useEffect, useState } from 'react';

export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com';
/** Circle's USDC mint on Solana mainnet. */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export type BalanceRead =
  | { kind: 'loading' }
  | { kind: 'error'; reason: string; at: number }
  | { kind: 'ready'; usdc: number; sol: number; at: number };

/** Read the wallet's own USDC and SOL from chain. Nothing here is custodied by us. */
export async function readBalances(owner: string): Promise<{ usdc: number; sol: number }> {
  const rpc = createSolanaRpc(RPC_URL);
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

export function useBalances(owner: string | null, pollMs = 0) {
  const [state, setState] = useState<BalanceRead>({ kind: 'loading' });
  const read = useCallback(async () => {
    if (!owner) return;
    try {
      const b = await readBalances(owner);
      setState({ kind: 'ready', ...b, at: Date.now() });
    } catch (e) {
      setState({ kind: 'error', reason: (e as Error).message.split('\n')[0].slice(0, 160), at: Date.now() });
    }
  }, [owner]);
  useEffect(() => {
    read();
    if (!pollMs) return;
    const t = setInterval(read, pollMs);
    return () => clearInterval(t);
  }, [read, pollMs]);
  return { state, read };
}

export function fmtUsdc(n: number): { whole: string; cents: string } {
  const [w, c] = n.toFixed(2).split('.');
  return { whole: Number(w).toLocaleString('en-GB'), cents: c };
}
