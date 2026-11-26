import { beforeEach, describe, expect, it } from 'vitest';
import { createKey } from '../lib/agent/keys';
import { MemoryStore, setStore, type AgentKey } from '../lib/agent/store';
import { getStore } from '../lib/agent/store';
import { issueCard, listCards, provisionCard, setCardLimit, setCardStatus, setIssuer } from '../lib/card';
import { IssuerNotConfigured } from '../lib/card/issuer';
import { PartnerIssuer } from '../lib/card/partner';
import { SandboxIssuer } from '../lib/card/sandbox';
import { potStatus, propose, type VenueAdapter } from '../lib/pot';

const OWNER = 'So11111111111111111111111111111111111111112';
const now = 1_800_000_000_000;
const wallet = async () => ({ usdc: 1_000, sol: 0.1 });

async function agentKey(scopes = ['pot:read', 'pot:propose'], perTx = 500, daily = 800): Promise<AgentKey> {
  const { key } = await createKey(OWNER, { label: 'a', scopes: scopes as never, perTxCapUsdc: perTx, dailyCapUsdc: daily, expiresInDays: 1 }, now);
  return (await getStore().read()).keys.find((k) => k.id === key.id)!;
}

beforeEach(() => {
  setStore(new MemoryStore());
  setIssuer(new SandboxIssuer());
});

describe('yield pot', () => {
  it('reports the live wallet, says rates are sample, and projects at the best net rate', async () => {
    const s = await potStatus(OWNER, { now, adapters: [], readBalances: wallet });
    expect(s.wallet).toMatchObject({ usdc: 1_000, source: 'live' });
    expect(s.totals.totalUsdc).toBe(1_000);
    expect(s.stats?.rateSource).toBe('sample');
    expect(s.stats?.projectedAnnualUsdcAtBest).toBeCloseTo((1_000 * s.stats!.bestVenue.netPct) / 100, 1);
    expect(s.positionsNote).toMatch(/No live venue adapter/);
  });

  it('blocks a deposit when no live adapter can build the transaction', async () => {
    const p = await propose(await agentKey(), { kind: 'deposit', venueId: 'venue-b', amountUsdc: 100 }, { now, adapters: [], readBalances: wallet });
    expect(p.status).toBe('blocked');
    expect(p.checks.find((c) => c.id === 'simulation')).toMatchObject({ pass: false });
    expect(p.checks.filter((c) => c.id !== 'simulation').every((c) => c.pass)).toBe(true);
  });

  it('returns an unsigned transaction for the owner when a live adapter builds and simulates', async () => {
    const adapter: VenueAdapter = {
      venueId: 'venue-b',
      read: async (t) => ({ id: 'venue-b', name: 'Venue B', product: 'USDC lending', chain: 'Solana', sleeve: 'forge', asset: 'USDC', grossPct: 7, moveCostPct: 0.05, capacity: 500_000, readAt: t, source: 'live' }),
      position: async () => 0,
      buildDeposit: async () => ({ transaction: 'BASE64TX', simulationOk: true, simulatedSlippageBp: 2 }),
      buildWithdraw: async () => ({ transaction: 'BASE64TX', simulationOk: true, simulatedSlippageBp: 2 }),
    };
    const key = await agentKey();
    const p = await propose(key, { kind: 'deposit', venueId: 'venue-b', amountUsdc: 400 }, { now, adapters: [adapter], readBalances: wallet });
    expect(p.status).toBe('awaiting_signature');
    expect(p.transaction).toBe('BASE64TX');
    // Daily cap counts proposals already waiting: 400 + 401 > 800.
    const over = await propose(key, { kind: 'deposit', venueId: 'venue-b', amountUsdc: 401 }, { now, adapters: [adapter], readBalances: wallet });
    expect(over.checks.find((c) => c.id === 'daily')?.pass).toBe(false);
    expect(over.transaction).toBeUndefined();
  });

  it('refuses a proposal over the wallet balance or without the scope', async () => {
    const big = await propose(await agentKey(['pot:read', 'pot:propose'], 5_000, 5_000), { kind: 'deposit', venueId: 'venue-b', amountUsdc: 2_000 }, { now, adapters: [], readBalances: wallet });
    expect(big.checks.find((c) => c.id === 'balance')?.pass).toBe(false);
    const noScope = await propose(await agentKey(['pot:read']), { kind: 'deposit', venueId: 'venue-b', amountUsdc: 1 }, { now, adapters: [], readBalances: wallet });
    expect(noScope.checks[0]).toMatchObject({ id: 'scope', pass: false });
  });

  it('does not rank a stale venue', async () => {
    const p = await propose(await agentKey(), { kind: 'deposit', venueId: 'venue-f', amountUsdc: 1 }, { now, adapters: [], readBalances: wallet });
    expect(p.checks.find((c) => c.id === 'venue')?.detail).toMatch(/not ranked/);
  });
});

describe('cards', () => {
  it('issues, freezes, re-limits and provisions sandbox cards, labelled as sandbox', async () => {
    const card = await issueCard(OWNER, { label: 'Travel', spendLimitUsdc: 250, limitWindow: 'daily' }, null);
    expect(card).toMatchObject({ label: 'Travel', status: 'active', sandbox: true, spendLimitUsdc: 250 });
    expect((await setCardStatus(OWNER, card.id, 'frozen')).status).toBe('frozen');
    await expect(provisionCard(OWNER, card.id, { wallet: 'apple_pay', certificates: ['a'], nonce: 'n', nonceSignature: 's' })).rejects.toThrow(/frozen/);
    await setCardStatus(OWNER, card.id, 'active');
    expect((await setCardLimit(OWNER, card.id, 100)).spendLimitUsdc).toBe(100);
    const apple = await provisionCard(OWNER, card.id, { wallet: 'apple_pay', certificates: ['a'], nonce: 'n', nonceSignature: 's' });
    expect(apple).toMatchObject({ wallet: 'apple_pay', sandbox: true });
    const google = await provisionCard(OWNER, card.id, { wallet: 'google_pay', stableHardwareId: 'h', activeWalletId: 'w' });
    expect(google).toMatchObject({ wallet: 'google_pay', sandbox: true });
    expect(await listCards(OWNER)).toHaveLength(1);
    expect(await listCards('someone-else')).toHaveLength(0);
  });

  it('a partner issuer that is not built refuses with what is missing', async () => {
    setIssuer(new PartnerIssuer('rain'));
    const err = await issueCard(OWNER, { spendLimitUsdc: 10 }, null).catch((e) => e);
    expect(err).toBeInstanceOf(IssuerNotConfigured);
    expect(err.fix).toMatch(/CARD_ISSUER_RAIN_API_KEY/);
  });
});
