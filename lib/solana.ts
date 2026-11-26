'use client';

import { useCallback, useEffect, useState } from 'react';

export { RPC_URL, USDC_MINT, readBalances } from './chain';
import { readBalances } from './chain';

export type BalanceRead =
  | { kind: 'loading' }
  | { kind: 'error'; reason: string; at: number }
  | { kind: 'ready'; usdc: number; sol: number; at: number };

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
