import 'server-only';
import type { Holding } from '@/lib/optimise';

/**
 * Stablecoin balances held directly in wallets, read from chain with plain
 * JSON-RPC. Nothing here signs or moves anything.
 */

const SOLANA_RPC = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

export const SOLANA_STABLES: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  PYUSD: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo',
};
export const BASE_STABLES: Record<string, { address: string; decimals: number }> = {
  USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
};

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`RPC returned ${r.status}`);
  const body = (await r.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

export type HoldingRead = { ok: true; holdings: Holding[] } | { ok: false; chain: string; address: string; error: string };

export async function readSolanaStables(owner: string): Promise<HoldingRead> {
  try {
    const out: Holding[] = [];
    for (const [asset, mint] of Object.entries(SOLANA_STABLES)) {
      const res = await rpc<{ value: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmountString: string } } } } } }> }>(
        SOLANA_RPC, 'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }],
      );
      const amount = res.value.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.uiAmountString), 0);
      if (amount > 0) out.push({ chain: 'Solana', address: owner, asset, amount });
    }
    return { ok: true, holdings: out };
  } catch (e) {
    return { ok: false, chain: 'Solana', address: owner, error: (e as Error).message.slice(0, 160) };
  }
}

export async function readBaseStables(owner: string): Promise<HoldingRead> {
  try {
    const out: Holding[] = [];
    for (const [asset, t] of Object.entries(BASE_STABLES)) {
      // balanceOf(address): selector 0x70a08231 + 32-byte padded owner.
      const data = `0x70a08231${owner.slice(2).toLowerCase().padStart(64, '0')}`;
      const hex = await rpc<string>(BASE_RPC, 'eth_call', [{ to: t.address, data }, 'latest']);
      const amount = Number(BigInt(hex)) / 10 ** t.decimals;
      if (amount > 0) out.push({ chain: 'Base', address: owner, asset, amount });
    }
    return { ok: true, holdings: out };
  } catch (e) {
    return { ok: false, chain: 'Base', address: owner, error: (e as Error).message.slice(0, 160) };
  }
}
