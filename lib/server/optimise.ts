import 'server-only';
import { DEFAULT_MIN_AMOUNT, DEFAULT_MIN_TVL_USD, parseLookup, planHoldings, type Holding } from '@/lib/optimise';
import { readLiveVenues } from './discovery';
import { readBaseStables, readSolanaStables, type HoldingRead } from './holdings';
import { resolveYid } from './yidResolve';

export interface WalletRow {
  chain: 'Solana' | 'Base' | 'Hyperliquid';
  address: string;
  role: 'primary' | 'linked' | 'evm' | 'hyperliquid' | 'looked up';
  /** True when the record's signatures prove this wallet belongs to the name. */
  proven: boolean;
  read: 'ok' | 'failed' | 'not read';
  error?: string;
}

export type OptimiseReport =
  | { ok: false; status: string; message: string; httpStatus: number }
  | {
      ok: true;
      query: string;
      name: string | null;
      verified: boolean;
      horizonDays: number;
      wallets: WalletRow[];
      plans: ReturnType<typeof planHoldings>['plans'];
      totals: ReturnType<typeof planHoldings>['totals'];
      ratesReadAt: string | null;
      ratesError: string | null;
      balancesReadAt: string;
      notes: string[];
    };

const NOT_FOUND: Record<string, string> = {
  not_found: 'No YieldID record is published under this name.',
  no_yid_record: 'The name exists in DNS but holds no YieldID record.',
  invalid_handle: 'That is not a valid YieldID handle.',
  dns_error: 'DNS did not answer. Try again in a minute.',
  not_configured: 'This deployment has no YieldID domain set.',
};

/**
 * One lookup: name (or address) → wallets → idle stablecoins → where each
 * would earn most net. Read-only from end to end.
 */
export async function optimiseLookup(raw: string, horizonDays: number): Promise<OptimiseReport> {
  const domain = process.env.NEXT_PUBLIC_YID_DOMAIN;
  const target = parseLookup(raw, domain);
  if (target.kind === 'invalid') return { ok: false, status: 'invalid', message: target.reason, httpStatus: 400 };

  let wallets: WalletRow[];
  let name: string | null = null;
  let verified = false;
  if (target.kind === 'name') {
    const r = await resolveYid(target.handle, domain);
    if (r.status !== 'verified' && r.status !== 'bad_signature') {
      return { ok: false, status: r.status, message: NOT_FOUND[r.status] ?? r.status, httpStatus: r.status === 'dns_error' ? 502 : r.status === 'invalid_handle' ? 400 : 404 };
    }
    if (r.status === 'bad_signature') {
      return { ok: false, status: 'bad_signature', message: 'The record’s signature does not match its Solana key, so its wallets cannot be trusted.', httpStatus: 422 };
    }
    name = `${target.handle}@${domain}`;
    verified = true;
    const a = r.addresses;
    wallets = [
      { chain: 'Solana', address: a.sol, role: 'primary', proven: true, read: 'not read' },
      ...a.alt.map((w) => ({ chain: 'Solana' as const, address: w.address, role: 'linked' as const, proven: w.proven, read: 'not read' as const })),
      ...(a.evm ? [{ chain: 'Base' as const, address: a.evm, role: 'evm' as const, proven: false, read: 'not read' as const }] : []),
      ...(a.hl ? [{ chain: 'Hyperliquid' as const, address: a.hl, role: 'hyperliquid' as const, proven: false, read: 'not read' as const }] : []),
    ];
  } else {
    wallets = [{ chain: target.kind === 'evm' ? 'Base' : 'Solana', address: target.address, role: 'looked up', proven: false, read: 'not read' }];
  }

  // Only wallets the record proves belong to the name are counted (plus the EVM
  // address, which the signed record body itself lists). Unproven linked wallets are shown, not counted.
  const reads = await Promise.all(
    wallets.map((w): Promise<HoldingRead | null> =>
      w.role === 'linked' && !w.proven ? Promise.resolve(null)
        : w.chain === 'Solana' ? readSolanaStables(w.address)
        : w.chain === 'Base' ? readBaseStables(w.address)
        : Promise.resolve(null),
    ),
  );
  const holdings: Holding[] = [];
  reads.forEach((r, i) => {
    if (!r) return;
    if (r.ok) {
      wallets[i].read = 'ok';
      holdings.push(...r.holdings);
    } else {
      wallets[i].read = 'failed';
      wallets[i].error = r.error;
    }
  });

  const venues = await readLiveVenues();
  const plan = planHoldings({
    holdings,
    venues: venues.ok ? venues.data : [],
    horizonDays,
    minTvlUsd: DEFAULT_MIN_TVL_USD,
    minAmount: DEFAULT_MIN_AMOUNT,
    now: Date.now(),
  });

  return {
    ok: true,
    query: raw.trim(),
    name,
    verified,
    horizonDays,
    wallets,
    plans: plan.plans,
    totals: plan.totals,
    ratesReadAt: venues.ok ? new Date(venues.readAt).toISOString() : null,
    ratesError: venues.ok ? null : venues.error,
    balancesReadAt: new Date().toISOString(),
    notes: [
      'Balances are stablecoins held directly in each wallet, which earn nothing there. Deposits already inside protocols are not read yet.',
      `Options are venues with at least $${(DEFAULT_MIN_TVL_USD / 1e6).toFixed(0)}m TVL, ranked by base APY minus the estimated move cost spread over ${horizonDays} days.`,
      'Yearly figures use today’s rate, which changes. They are estimates, not promises. Not financial advice.',
    ],
  };
}
