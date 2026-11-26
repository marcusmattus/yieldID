import { describe, expect, it } from 'vitest';
import pools from './fixtures/llama-pools.json';
import bazaar from './fixtures/bazaar.json';
import { keepPool, liveVenuesFrom, MOVE_COST_MODEL, prettyProject, type LlamaPool } from '../lib/defi/pools';
import { LIVE_MAX_READ_AGE_SEC, parseHorizon, rankLive } from '../lib/defi/rank';
import { parseLiveQuery } from '../lib/defi/query';
import { rankServices, toPaidService, type BazaarItem } from '../lib/x402/bazaar';

const NOW = Date.parse('2026-11-26T06:00:00Z');
const all = pools as LlamaPool[];

describe('DefiLlama pools → live venues', () => {
  it('keeps plain stablecoin deposits on routed chains and drops the rest', () => {
    const kept = all.filter(keepPool).map((p) => `${p.chain}/${p.project}`);
    expect(kept).toEqual(['Solana/jupiter-lend', 'Solana/kamino-lend', 'Base/aave-v3', 'Base/veranta']);
    // Dropped: a BTC vault, an LP pair, a BSC pool, and a pool under $1m TVL.
  });

  it('uses base APY as gross, keeps rewards apart, and marks the source live', () => {
    const v = liveVenuesFrom(all, NOW);
    const jup = v.find((x) => x.project === 'jupiter-lend')!;
    const raw = all.find((p) => p.project === 'jupiter-lend')!;
    expect(jup).toMatchObject({ grossPct: raw.apyBase, chain: 'Solana', asset: 'USDC', source: 'live', readAt: NOW, moveCostPct: MOVE_COST_MODEL.Solana });
    expect(jup.url).toBe(`https://defillama.com/yields/pool/${raw.pool}`);
    const kam = v.find((x) => x.project === 'kamino-lend')!;
    expect(kam.sleeve).toBe('rwa'); // "Institutional Commodity Yield"
    expect(prettyProject('aave-v3')).toBe('Aave v3');
  });

  it('ranks by net: gross minus the move cost spread over the horizon', () => {
    const venues = liveVenuesFrom(all, NOW);
    const { rows } = rankLive(venues, { horizonDays: 7, now: NOW });
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].netPct).toBeGreaterThanOrEqual(rows[i].netPct);
    for (const r of rows) expect(r.netPct).toBeCloseTo(r.grossPct - (r.moveCostPct * 365) / 7, 3);
    expect(rows.every((r) => r.moveCostEstimated)).toBe(true);
  });

  it('filters by chain, asset and TVL floor, and stops ranking reads older than two hours', () => {
    const venues = liveVenuesFrom(all, NOW);
    expect(rankLive(venues, { horizonDays: 30, chains: ['Base'], now: NOW }).rows.map((r) => r.chain)).toEqual(['Base', 'Base']);
    expect(rankLive(venues, { horizonDays: 30, minTvlUsd: 100_000_000, now: NOW }).rows.map((r) => r.venue)).toEqual(['Jupiter Lend']);
    const late = rankLive(venues, { horizonDays: 30, now: NOW + (LIVE_MAX_READ_AGE_SEC + 1) * 1000 });
    expect(late.rows).toHaveLength(0);
    expect(late.notRanked.every((n) => n.reason === 'stale')).toBe(true);
  });

  it('parses agent queries strictly', () => {
    expect(parseHorizon('45')).toBe(30);
    const q = parseLiveQuery(new URLSearchParams('horizon=7&chain=solana,base,tron&asset=usdc&limit=999&minTvl=abc'));
    expect(q).toEqual({ horizonDays: 7, chains: ['Solana', 'Base'], assets: ['USDC'], minTvlUsd: undefined, limit: 200 });
  });
});

describe('x402 Bazaar → paid services', () => {
  const items = bazaar as BazaarItem[];

  it('prices each service in dollars from the stablecoin it accepts', () => {
    const s = toPaidService(items[0])!;
    expect(s.priceUsd).toBe(Number(items[0].accepts[0].amount) / 1e6);
    expect(s.stable).toBe('USDC');
    expect(s.networks).toContain('Base');
    expect(s.url.startsWith('https://')).toBe(true);
  });

  it('drops non-https resources and unknown assets', () => {
    const base = items[0];
    expect(toPaidService({ ...base, resource: 'http://example.com/x' })).toBeNull();
    expect(toPaidService({ ...base, accepts: [{ ...base.accepts[0], asset: '0x0000000000000000000000000000000000000001' }] })).toBeNull();
  });

  it('ranks by distinct payers and can filter to Solana', () => {
    const ranked = rankServices(items);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].payers30d).toBeGreaterThanOrEqual(ranked[i].payers30d);
    expect(new Set(ranked.map((r) => r.url)).size).toBe(ranked.length);
    const hosts = ranked.map((r) => r.host);
    expect(hosts.every((h) => hosts.filter((x) => x === h).length <= 2)).toBe(true);
    const sol = rankServices(items, { network: 'Solana' });
    expect(sol.length).toBeGreaterThan(0);
    expect(sol.every((r) => r.networks.includes('Solana'))).toBe(true);
  });
});

describe('review fixes', () => {
  it('treats an explicitly empty chain selection as no results', () => {
    const venues = liveVenuesFrom(all, NOW);
    expect(rankLive(venues, { horizonDays: 30, chains: [], now: NOW }).rows).toHaveLength(0);
    expect(rankLive(venues, { horizonDays: 30, now: NOW }).rows.length).toBeGreaterThan(0);
  });

  it('compares Solana mints exactly, so a case-changed key is not taken for USDC', () => {
    const sol = (bazaar as BazaarItem[]).find((i) => i.accepts.some((a) => a.network.startsWith('solana:')))!;
    const a = sol.accepts.find((x) => x.network.startsWith('solana:'))!;
    expect(toPaidService({ ...sol, accepts: [a] })?.stable).toBeTruthy();
    expect(toPaidService({ ...sol, accepts: [{ ...a, asset: a.asset.toLowerCase() }] })).toBeNull();
  });
});
