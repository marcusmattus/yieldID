import 'server-only';
import { fromMicro } from '../chain';
import { issueCard, listCards, setCardLimit, setCardStatus } from '../card';
import type { LimitWindow } from '../card/issuer';
import { depositInstructions, listProposals, potRates, potStatus, propose, viewProposal, type ProposeInput } from '../pot';
import { isSolanaNetwork, USDC_BY_NETWORK } from '../x402/solana';
import { authorizeSpend, recordSettlement, releaseSpend, spentToday, viewKey } from './keys';
import { SCOPES, type Scope } from './scopes';
import { getStore, type AgentKey } from './store';

/**
 * Everything an agent key can do, in one place. The REST routes and the
 * in-process MCP backend both call these, so the checks are the same on
 * every path.
 */

export class ScopeError extends Error {
  constructor(public scope: Scope) {
    super(`This key does not have ${scope}.`);
  }
}

function need(key: AgentKey, scope: Scope) {
  if (!key.scopes.includes(scope)) throw new ScopeError(scope);
}

export async function whoami(key: AgentKey) {
  const s = await getStore().read();
  const now = Date.now();
  return {
    owner: key.owner,
    key: viewKey(key),
    scopes: key.scopes.map((sc) => ({ scope: sc, means: SCOPES[sc] })),
    spentTodayUsdc: fromMicro(spentToday(s.ledger, key.id, now)),
    killSwitch: s.owners[key.owner]?.killSwitch ?? false,
    cannot: ["Sign for the owner's wallet", 'Change its own caps or scopes', 'Add a card to Apple Pay or Google Pay', 'Release the kill switch'],
  };
}

export async function svcPotStatus(key: AgentKey) {
  need(key, 'pot:read');
  return potStatus(key.owner);
}
export async function svcPotRates(key: AgentKey) {
  need(key, 'pot:read');
  return potRates();
}
export async function svcDepositAddress(key: AgentKey) {
  need(key, 'pot:read');
  return depositInstructions(key.owner);
}
export async function svcProposals(key: AgentKey) {
  need(key, 'pot:read');
  return listProposals(key.owner, key.id);
}
export async function svcPropose(key: AgentKey, input: ProposeInput) {
  need(key, 'pot:propose');
  return viewProposal(await propose(key, input));
}

export async function svcCards(key: AgentKey) {
  need(key, 'card:read');
  return listCards(key.owner);
}
export async function svcIssueCard(key: AgentKey, input: { label?: string; spendLimitUsdc: number; limitWindow?: LimitWindow }) {
  need(key, 'card:manage');
  return issueCard(key.owner, input, key.id);
}
export async function svcUpdateCard(key: AgentKey, cardId: string, patch: { status?: 'active' | 'frozen'; spendLimitUsdc?: number; limitWindow?: LimitWindow }) {
  need(key, 'card:manage');
  // Agents may freeze and unfreeze; closing a card is the owner's call.
  if (patch.status && patch.status !== 'active' && patch.status !== 'frozen') throw new Error('Agents can set status to active or frozen only.');
  let out = null;
  if (patch.status) out = await setCardStatus(key.owner, cardId, patch.status);
  if (patch.spendLimitUsdc !== undefined) out = await setCardLimit(key.owner, cardId, patch.spendLimitUsdc, patch.limitWindow);
  if (!out) throw new Error('Nothing to change. Send status or spendLimitUsdc.');
  return out;
}

export interface X402AuthorizeInput {
  amountMicro: string;
  payTo: string;
  resource: string;
  network: string;
  asset: string;
}

export async function svcX402Authorize(key: AgentKey, input: X402AuthorizeInput) {
  need(key, 'x402:pay');
  if (!isSolanaNetwork(input.network)) return { ok: false, reason: `Network ${input.network} is not supported.`, fix: 'Only solana and solana-devnet USDC are supported.' };
  if (input.asset !== USDC_BY_NETWORK[input.network]) return { ok: false, reason: 'Asset is not USDC.', fix: 'Only native USDC payments are authorised.' };
  let amount: bigint;
  try {
    amount = BigInt(input.amountMicro);
  } catch {
    return { ok: false, reason: 'amountMicro must be an integer string.', fix: 'Send micro-USDC, e.g. "10000" for 0.01 USDC.' };
  }
  if (amount <= 0n) return { ok: false, reason: 'Amount must be positive.', fix: 'Send a positive amountMicro.' };
  const r = await authorizeSpend(key.id, { kind: 'x402', amountMicro: amount, ref: String(input.resource), payTo: String(input.payTo), scope: 'x402:pay' });
  const failed = r.checks.filter((c) => !c.pass);
  return {
    ok: r.ok,
    reservationId: r.entry?.id,
    spentTodayUsdc: fromMicro(r.spentTodayMicro),
    checks: r.checks,
    reason: r.ok ? undefined : failed.map((c) => c.name).join(', ') + ' failed',
    fix: failed[0]?.fix,
  };
}

export async function svcX402Settled(key: AgentKey, reservationId: string, txSignature: string) {
  need(key, 'x402:pay');
  return { ok: await recordSettlement(key.id, reservationId, txSignature) };
}
export async function svcX402Release(key: AgentKey, reservationId: string) {
  need(key, 'x402:pay');
  return { ok: await releaseSpend(key.id, reservationId) };
}
export async function svcLedger(key: AgentKey) {
  const s = await getStore().read();
  return s.ledger
    .filter((e) => e.keyId === key.id)
    .slice(-100)
    .reverse()
    .map((e) => ({ id: e.id, kind: e.kind, amountUsdc: fromMicro(e.amountMicro), at: new Date(e.at).toISOString(), ref: e.ref, payTo: e.payTo, txSignature: e.txSignature ?? null }));
}
