import { describe, expect, it } from 'vitest';
import { runChecks, verdict, type Rule, type SpendPolicy } from '../lib/policy';
import { rankVenues } from '../lib/rates';
import { sampleVenues } from '../lib/sample';

const now = 1_800_000_000_000;
const rule: Rule = {
  edgeBp: 100,
  horizonDays: 30,
  minHoldMin: 1440,
  minCapacity: 10_000,
  maxMove: 100_000,
  maxReadAgeSec: 120,
  assets: ['USDC'],
  chains: ['Solana'],
  sleeves: ['forge', 'rwa'],
  includeUnverified: false,
};
const policy: SpendPolicy = {
  perTxCap: 50_000,
  dailyCap: 50_000,
  slippageBp: 30,
  allowList: ['venue-b', 'venue-c'],
  expiresAt: now + 86_400_000,
  killSwitch: false,
};
const venueB = rankVenues({
  venues: sampleVenues(now),
  currentId: 'venue-c',
  horizonDays: 30,
  maxReadAgeSec: 120,
  minCapacity: 10_000,
  includeUnverified: false,
  now,
}).ranked[0];

const base = { venue: venueB, movedToday: 30_000, heldSince: now - 2 * 86_400_000, now, simulatedSlippageBp: 3, simulationOk: true };

describe('runChecks', () => {
  it('returns all ten checks in a fixed order', () => {
    const ids = runChecks(rule, policy, { ...base, size: 20_000 }).map((c) => c.id);
    expect(ids).toEqual(['edge', 'fresh', 'hold', 'allow', 'per_tx', 'daily', 'slippage', 'simulation', 'expiry', 'kill']);
  });

  it('refuses on the daily cap and names the fix', () => {
    const checks = runChecks(rule, policy, { ...base, size: 40_000 });
    const v = verdict(checks);
    expect(v.passed).toBe(false);
    expect(v.failed.map((c) => c.id)).toEqual(['daily']);
    expect(v.passCount).toBe(9);
    expect(v.failed[0].fix).toContain('20,000');
  });

  it('passes all ten when the size fits', () => {
    expect(verdict(runChecks(rule, policy, { ...base, size: 20_000 })).passed).toBe(true);
  });

  it('fails simulation for a venue with no live adapter instead of skipping it', () => {
    const checks = runChecks(rule, policy, { ...base, size: 20_000, simulationOk: null, simulatedSlippageBp: null });
    expect(verdict(checks).failed.map((c) => c.id)).toEqual(['slippage', 'simulation']);
  });

  it('fails the hold check when hold time is unknown', () => {
    const checks = runChecks(rule, policy, { ...base, size: 20_000, heldSince: null });
    expect(verdict(checks).failed.map((c) => c.id)).toEqual(['hold']);
  });

  it('caps the move at the venue capacity', () => {
    const small = { ...venueB, capacity: 15_000 };
    const checks = runChecks(rule, policy, { ...base, venue: small, size: 20_000 });
    expect(verdict(checks).failed.map((c) => c.id)).toEqual(['per_tx']);
    expect(checks.find((c) => c.id === 'per_tx')!.detail).toContain('venue capacity 15,000');
  });

  it('kill switch refuses everything', () => {
    const checks = runChecks(rule, { ...policy, killSwitch: true }, { ...base, size: 20_000 });
    expect(verdict(checks).failed.map((c) => c.id)).toEqual(['kill']);
  });
});
