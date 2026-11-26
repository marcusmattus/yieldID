import 'server-only';
import { randomBytes } from 'node:crypto';
import { fromMicro, readBalances, toMicro, USDC_MINT } from '../chain';
import { DEFAULT_RULE } from '../policy';
import { rankVenues, type RankResult, type VenueRead } from '../rates';
import { sampleVenues } from '../sample';
import type { AgentKey, Proposal } from '../agent/store';
import { getStore } from '../agent/store';

/**
 * The yield pot: the owner's stablecoins, idle in the wallet or placed in a
 * venue. Agents read it and propose moves; only the owner signs.
 *
 * Wallet balances are live chain reads. Venue rates are the illustrative
 * sample set until a live VenueAdapter is registered; every response says
 * which it is. Without an adapter there is no position read and no
 * transaction to build, so proposals come back blocked with that reason.
 */

export interface BuiltMove {
  /** Unsigned base64 transaction for the owner to sign. */
  transaction: string;
  simulationOk: boolean;
  simulatedSlippageBp: number;
}

export interface VenueAdapter {
  venueId: string;
  read(now: number): Promise<VenueRead>;
  /** USDC the owner holds in this venue. */
  position(owner: string): Promise<number>;
  buildDeposit(owner: string, amountMicro: bigint): Promise<BuiltMove>;
  buildWithdraw(owner: string, amountMicro: bigint): Promise<BuiltMove>;
}

/** Register live adapters here. Empty until one is written and verified against chain. */
export const ADAPTERS: VenueAdapter[] = [];

export interface PotDeps {
  now: number;
  adapters: VenueAdapter[];
  readBalances: (owner: string) => Promise<{ usdc: number; sol: number }>;
}

const defaultDeps = (): PotDeps => ({ now: Date.now(), adapters: ADAPTERS, readBalances: (o) => readBalances(o, process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC) });

async function board(d: PotDeps): Promise<{ result: RankResult; source: 'live' | 'sample' | 'mixed' }> {
  const live = await Promise.all(d.adapters.map((a) => a.read(d.now).catch((e: Error) => ({ id: a.venueId, error: e.message }) as VenueRead)));
  const liveIds = new Set(live.map((v) => v.id));
  const venues = [...live, ...sampleVenues(d.now).filter((v) => !liveIds.has(v.id))];
  const result = rankVenues({
    venues,
    currentId: null,
    horizonDays: DEFAULT_RULE.horizonDays,
    maxReadAgeSec: DEFAULT_RULE.maxReadAgeSec,
    minCapacity: DEFAULT_RULE.minCapacity,
    includeUnverified: false,
    now: d.now,
  });
  return { result, source: live.length === 0 ? 'sample' : venues.length === live.length ? 'live' : 'mixed' };
}

export async function potRates(deps: Partial<PotDeps> = {}) {
  const d = { ...defaultDeps(), ...deps };
  const { result, source } = await board(d);
  return {
    dataSource: source,
    note: source === 'sample' ? 'Illustrative sample rates with generic venue names. No live adapter is registered yet.' : undefined,
    horizonDays: DEFAULT_RULE.horizonDays,
    ranked: result.ranked.map((v) => ({
      venueId: v.id,
      name: v.name,
      product: v.product,
      chain: v.chain,
      asset: v.asset,
      grossPct: v.grossPct,
      annualisedMovePct: Number(v.annualisedMovePct.toFixed(4)),
      netPct: Number(v.netPct.toFixed(4)),
      capacity: v.capacity,
      readAt: v.readAt ? new Date(v.readAt).toISOString() : null,
      source: v.source,
    })),
    notRanked: result.notRanked.map((n) => ({ venueId: n.venue.id, name: n.venue.name, reason: n.reason, detail: n.detail })),
  };
}

export async function potStatus(owner: string, deps: Partial<PotDeps> = {}) {
  const d = { ...defaultDeps(), ...deps };
  const [wallet, positions, rates] = await Promise.all([
    d.readBalances(owner).then(
      (b) => ({ ok: true as const, ...b, readAt: new Date(d.now).toISOString() }),
      (e: Error) => ({ ok: false as const, error: e.message.split('\n')[0].slice(0, 160) }),
    ),
    Promise.all(
      d.adapters.map(async (a) => {
        try {
          return { venueId: a.venueId, usdc: await a.position(owner) };
        } catch (e) {
          return { venueId: a.venueId, usdc: null, error: (e as Error).message };
        }
      }),
    ),
    potRates(d),
  ]);
  const inPot = positions.reduce((a, p) => a + (p.usdc ?? 0), 0);
  const best = rates.ranked[0] ?? null;
  const idle = wallet.ok ? wallet.usdc : 0;
  return {
    owner,
    wallet: wallet.ok ? { usdc: wallet.usdc, sol: wallet.sol, source: 'live' as const, readAt: wallet.readAt } : { error: wallet.error, source: 'live' as const },
    positions,
    positionsNote: d.adapters.length === 0 ? 'No live venue adapter is registered, so no venue positions can be read.' : undefined,
    totals: { idleUsdc: idle, inPotUsdc: inPot, totalUsdc: idle + inPot },
    stats: best
      ? {
          bestVenue: { venueId: best.venueId, name: best.name, netPct: best.netPct },
          /** What a year at the best net rate would earn on idle plus placed funds. An estimate, not a promise. */
          projectedAnnualUsdcAtBest: Number((((idle + inPot) * best.netPct) / 100).toFixed(2)),
          rateSource: rates.dataSource,
        }
      : null,
  };
}

export interface ProposeInput {
  kind: 'deposit' | 'withdraw';
  venueId: string;
  amountUsdc: number;
}

type Check = Proposal['checks'][number];

/**
 * Run the pot checks and store the proposal, passed or blocked, so the owner
 * sees every request an agent made. A passing proposal carries an unsigned
 * transaction; nothing is signed or sent here.
 */
export async function propose(key: AgentKey, input: ProposeInput, deps: Partial<PotDeps> = {}): Promise<Proposal> {
  const d = { ...defaultDeps(), ...deps };
  if (input.kind !== 'deposit' && input.kind !== 'withdraw') throw new Error('kind must be deposit or withdraw.');
  const amountMicro = toMicro(input.amountUsdc);
  if (amountMicro <= 0n) throw new Error('Amount must be more than zero.');

  const { result } = await board(d);
  const venue = result.ranked.find((v) => v.id === input.venueId);
  const notRanked = result.notRanked.find((n) => n.venue.id === input.venueId);
  const adapter = d.adapters.find((a) => a.venueId === input.venueId) ?? null;
  const state = await getStore().read();
  const killed = state.owners[key.owner]?.killSwitch ?? false;
  const dayStart = d.now - (d.now % 86_400_000);
  const proposedToday = state.proposals
    .filter((p) => p.keyId === key.id && p.createdAt >= dayStart && p.status !== 'blocked' && p.status !== 'cancelled')
    .reduce((a, p) => a + BigInt(p.amountMicro), 0n);
  const perTx = BigInt(key.perTxCapMicro);
  const daily = BigInt(key.dailyCapMicro);
  const u = (m: bigint) => `${fromMicro(m).toLocaleString('en-GB')} USDC`;

  const checks: Check[] = [
    { id: 'scope', name: 'Key may propose', pass: key.scopes.includes('pot:propose'), detail: `Key scopes: ${key.scopes.join(', ')}`, fix: 'Create a key with pot:propose.' },
    { id: 'kill', name: 'Kill switch off', pass: !killed, detail: killed ? 'Engaged' : 'Off', fix: 'The owner releases it on the Agents screen.' },
    {
      id: 'venue',
      name: 'Venue is ranked',
      pass: !!venue,
      detail: venue ? `${venue.name} ranked, net ${venue.netPct.toFixed(2)}%` : notRanked ? `${notRanked.venue.name} not ranked: ${notRanked.detail}` : `Unknown venue ${input.venueId}`,
      fix: 'Pick a venue from pot_rates.',
    },
    { id: 'per_tx', name: 'Per-transaction cap', pass: amountMicro <= perTx, detail: `${u(amountMicro)} vs cap ${u(perTx)}`, fix: 'Lower the amount or ask the owner for a higher cap.' },
    {
      id: 'daily',
      name: 'Daily cap',
      pass: proposedToday + amountMicro <= daily,
      detail: `Proposed today ${u(proposedToday)} + this ${u(amountMicro)}, cap ${u(daily)}`,
      fix: 'Wait for 00:00 UTC or ask the owner to raise the cap.',
    },
  ];

  if (input.kind === 'deposit') {
    const bal = await d.readBalances(key.owner).catch(() => null);
    checks.push({
      id: 'balance',
      name: 'Wallet holds the amount',
      pass: bal !== null && toMicro(Math.floor(bal.usdc * 1e6) / 1e6) >= amountMicro,
      detail: bal === null ? 'Wallet balance could not be read' : `Wallet has ${bal.usdc.toLocaleString('en-GB')} USDC`,
      fix: bal === null ? 'Retry; check the RPC.' : 'Lower the amount or add USDC to the wallet.',
    });
  } else {
    const pos = adapter ? await adapter.position(key.owner).catch(() => null) : null;
    checks.push({
      id: 'balance',
      name: 'Position holds the amount',
      pass: pos !== null && toMicro(Math.floor(pos * 1e6) / 1e6) >= amountMicro,
      detail: pos === null ? 'Position could not be read: no live adapter for this venue' : `Position is ${pos.toLocaleString('en-GB')} USDC`,
      fix: pos === null ? 'Register a live adapter for this venue.' : 'Lower the amount.',
    });
  }

  let built: BuiltMove | null = null;
  let buildError: string | null = null;
  const preChecksPass = checks.every((c) => c.pass);
  if (adapter && preChecksPass) {
    try {
      built = input.kind === 'deposit' ? await adapter.buildDeposit(key.owner, amountMicro) : await adapter.buildWithdraw(key.owner, amountMicro);
    } catch (e) {
      buildError = (e as Error).message;
    }
  }
  checks.push({
    id: 'simulation',
    name: 'Transaction built and simulated',
    pass: built?.simulationOk === true,
    detail: !adapter
      ? 'No transaction to build: this venue has no live adapter'
      : !preChecksPass
        ? 'Not built: an earlier check failed'
        : buildError
          ? `Build failed: ${buildError}`
          : built?.simulationOk
            ? `Simulated, slippage ${built.simulatedSlippageBp} bp`
            : 'Simulation returned an error',
    fix: 'Connect a live adapter for this venue, then propose again.',
  });

  const passed = checks.every((c) => c.pass);
  const proposal: Proposal = {
    id: randomBytes(8).toString('hex'),
    owner: key.owner,
    keyId: key.id,
    kind: input.kind,
    venueId: input.venueId,
    amountMicro: amountMicro.toString(),
    createdAt: d.now,
    status: passed ? 'awaiting_signature' : 'blocked',
    checks,
    transaction: passed ? built?.transaction : undefined,
  };
  await getStore().update((s) => {
    s.proposals.push(proposal);
    // Keep the newest 500 per store; older ones are history the owner already saw.
    if (s.proposals.length > 500) s.proposals.splice(0, s.proposals.length - 500);
  });
  return proposal;
}

export function viewProposal(p: Proposal) {
  return {
    id: p.id,
    kind: p.kind,
    venueId: p.venueId,
    amountUsdc: fromMicro(p.amountMicro),
    status: p.status,
    createdAt: new Date(p.createdAt).toISOString(),
    checks: p.checks,
    transaction: p.transaction,
    next:
      p.status === 'awaiting_signature'
        ? 'The owner reviews and signs this in the YieldID app. Agents cannot sign it.'
        : p.status === 'blocked'
          ? 'Blocked. Each failed check lists its fix.'
          : undefined,
  };
}

export async function listProposals(owner: string, keyId?: string) {
  const s = await getStore().read();
  return s.proposals.filter((p) => p.owner === owner && (!keyId || p.keyId === keyId)).slice(-50).reverse().map(viewProposal);
}

/** Where to send USDC to fund the pot: the owner's own wallet. For exchange withdrawals. */
export function depositInstructions(owner: string) {
  return {
    network: 'Solana mainnet',
    address: owner,
    asset: 'USDC (native, issued by Circle)',
    mint: USDC_MINT,
    warnings: [
      'Withdraw on the Solana network only. Sending on another network loses the funds.',
      'Send native USDC, not a bridged or wrapped version.',
      'Send a small test amount first.',
    ],
  };
}
