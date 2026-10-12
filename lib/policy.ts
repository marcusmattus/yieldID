import type { Chain, RankedVenue, SleeveKind } from './rates';

export interface Rule {
  edgeBp: number;
  horizonDays: number;
  minHoldMin: number;
  minCapacity: number;
  maxMove: number;
  maxReadAgeSec: number;
  assets: string[];
  chains: Chain[];
  sleeves: SleeveKind[];
  includeUnverified: boolean;
}

export interface SpendPolicy {
  perTxCap: number;
  dailyCap: number;
  slippageBp: number;
  allowList: string[];
  /** ms since epoch */
  expiresAt: number;
  killSwitch: boolean;
}

export interface ProposalInput {
  venue: RankedVenue;
  size: number;
  movedToday: number;
  /** When the current sleeve was opened, ms since epoch. Null if unknown. */
  heldSince: number | null;
  now: number;
  /** Null when the move could not be simulated. */
  simulatedSlippageBp: number | null;
  simulationOk: boolean | null;
}

export type CheckId =
  | 'edge'
  | 'fresh'
  | 'hold'
  | 'allow'
  | 'per_tx'
  | 'daily'
  | 'slippage'
  | 'simulation'
  | 'expiry'
  | 'kill';

export interface CheckResult {
  id: CheckId;
  name: string;
  pass: boolean;
  detail: string;
  fix?: string;
}

const n = (x: number) => x.toLocaleString('en-GB');

/**
 * Every check, in the same order every time. A refusal lists the failures and
 * the fix; a pass lists every check that passed. Nothing is skipped silently.
 */
export function runChecks(rule: Rule, policy: SpendPolicy, p: ProposalInput): CheckResult[] {
  const v = p.venue;
  const readAgeSec = v.readAt === null ? Infinity : Math.round((p.now - v.readAt) / 1000);
  const heldMin = p.heldSince === null ? null : Math.floor((p.now - p.heldSince) / 60000);
  const dailyAfter = p.movedToday + p.size;
  // The venue's quoted capacity caps the move too; unknown capacity allows nothing.
  const sizeCap = Math.min(policy.perTxCap, rule.maxMove, v.capacity ?? 0);

  const checks: CheckResult[] = [
    {
      id: 'edge',
      name: 'Edge clears rule',
      pass: v.edgeBp !== null && v.edgeBp >= rule.edgeBp,
      detail: `${v.edgeBp === null ? 'No current sleeve' : `${Math.round(v.edgeBp)} bp`} vs rule ${rule.edgeBp} bp`,
      fix: 'Wait for a wider edge or lower the rule threshold.',
    },
    {
      id: 'fresh',
      name: 'Rate read is fresh',
      pass: readAgeSec <= rule.maxReadAgeSec,
      detail: `Read ${Number.isFinite(readAgeSec) ? `${readAgeSec} s` : 'never'} ago, limit ${rule.maxReadAgeSec} s`,
      fix: 'Re-read the venue, then rebuild the proposal.',
    },
    {
      id: 'hold',
      name: 'Minimum hold met',
      pass: heldMin !== null && heldMin >= rule.minHoldMin,
      detail: heldMin === null ? `Hold time unknown, limit ${rule.minHoldMin} min` : `Held ${heldMin} min, limit ${rule.minHoldMin} min`,
      fix: 'Wait until the minimum hold has passed.',
    },
    {
      id: 'allow',
      name: 'Venue on allow-list',
      pass: policy.allowList.includes(v.id),
      detail: policy.allowList.includes(v.id) ? `${v.name} is listed` : `${v.name} is not on the allow-list`,
      fix: 'Add the venue program to the allow-list in your spend policy.',
    },
    {
      id: 'per_tx',
      name: 'Per-transaction cap',
      pass: p.size <= sizeCap,
      detail: `${n(p.size)} vs cap ${n(sizeCap)} (lowest of policy ${n(policy.perTxCap)}, rule ${n(rule.maxMove)}, venue capacity ${v.capacity === null ? 'unknown' : n(v.capacity)})`,
      fix: 'Lower the size, or raise the per-transaction cap. Venue capacity cannot be raised.',
    },
    {
      id: 'daily',
      name: 'Daily cap',
      pass: dailyAfter <= policy.dailyCap,
      detail: `Moved today ${n(p.movedToday)} + this ${n(p.size)} = ${n(dailyAfter)}, cap ${n(policy.dailyCap)}`,
      fix: `Move ${n(Math.max(0, policy.dailyCap - p.movedToday))} now and the rest after the cap resets, or raise the daily cap.`,
    },
    {
      id: 'slippage',
      name: 'Slippage limit',
      pass: p.simulatedSlippageBp !== null && p.simulatedSlippageBp <= policy.slippageBp,
      detail:
        p.simulatedSlippageBp === null
          ? `Not simulated, limit ${policy.slippageBp} bp`
          : `Simulated ${p.simulatedSlippageBp} bp, limit ${policy.slippageBp} bp`,
      fix: 'Lower the size or wait for deeper liquidity.',
    },
    {
      id: 'simulation',
      name: 'Simulation succeeded',
      pass: p.simulationOk === true,
      detail:
        p.simulationOk === null
          ? 'No transaction to simulate: this venue has no live adapter'
          : p.simulationOk
            ? 'No errors'
            : 'Simulation returned an error',
      fix: 'Connect a live adapter for this venue, then rebuild.',
    },
    {
      id: 'expiry',
      name: 'Policy not expired',
      pass: p.now < policy.expiresAt,
      detail: `Expires ${new Date(policy.expiresAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      fix: 'Extend the policy expiry.',
    },
    {
      id: 'kill',
      name: 'Kill switch off',
      pass: !policy.killSwitch,
      detail: policy.killSwitch ? 'Kill switch is engaged' : 'Off',
      fix: 'Release the kill switch in your spend policy.',
    },
  ];

  return checks;
}

export function verdict(checks: CheckResult[]) {
  const failed = checks.filter((c) => !c.pass);
  return { passed: failed.length === 0, failed, passCount: checks.length - failed.length };
}
