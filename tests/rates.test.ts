import { describe, expect, it } from 'vitest';
import { annualiseMoveCost, fmtBp, fmtPct, netRate, rankVenues } from '../lib/rates';
import { sampleVenues, SAMPLE_CURRENT_ID } from '../lib/sample';

const now = 1_800_000_000_000;

describe('net rate', () => {
  it('annualises a one-off move cost over the horizon', () => {
    expect(annualiseMoveCost(0.05, 30)).toBeCloseTo(0.6083, 4);
    expect(annualiseMoveCost(0.3, 365)).toBeCloseTo(0.3, 10);
  });

  it('subtracts annualised move cost from gross', () => {
    expect(netRate(7, 0.05, 30)).toBeCloseTo(6.3917, 4);
  });

  it('rejects a zero horizon', () => {
    expect(() => annualiseMoveCost(0.05, 0)).toThrow();
  });
});

describe('rankVenues', () => {
  const result = rankVenues({
    venues: sampleVenues(now),
    currentId: SAMPLE_CURRENT_ID,
    horizonDays: 30,
    maxReadAgeSec: 120,
    minCapacity: 10_000,
    includeUnverified: false,
    now,
  });

  it('ranks by net, not gross: the highest gross venue ranks third', () => {
    expect(result.ranked.map((v) => v.id)).toEqual(['venue-b', 'venue-d', 'venue-a', 'venue-c', 'venue-e']);
    const a = result.ranked.find((v) => v.id === 'venue-a')!;
    expect(a.grossPct).toBe(9);
    expect(fmtPct(a.annualisedMovePct)).toBe('3.65%');
    expect(fmtPct(a.netPct)).toBe('5.35%');
  });

  it('keeps gross, annualised move cost, net and edge as separate fields', () => {
    const b = result.ranked[0];
    expect(fmtPct(b.grossPct)).toBe('7.00%');
    expect(fmtPct(b.annualisedMovePct)).toBe('0.61%');
    expect(fmtPct(b.netPct)).toBe('6.39%');
    expect(fmtBp(b.edgeBp)).toBe('+139 bp');
    expect(fmtBp(result.ranked.find((v) => v.id === 'venue-e')!.edgeBp)).toBe('−72 bp');
  });

  it('charges no move cost for the current sleeve', () => {
    const c = result.ranked.find((v) => v.isCurrent)!;
    expect(c.annualisedMovePct).toBe(0);
    expect(c.edgeBp).toBe(0);
  });

  it('never ranks a stale, failed, under-capacity or unverified venue, and says why', () => {
    const reasons = Object.fromEntries(result.notRanked.map((n) => [n.venue.id, n.reason]));
    expect(reasons).toEqual({
      'venue-f': 'stale',
      'venue-g': 'read_failed',
      'venue-h': 'capacity',
      'venue-k': 'unverified',
    });
    expect(result.ranked.some((v) => ['venue-f', 'venue-g', 'venue-h', 'venue-k'].includes(v.id))).toBe(false);
  });

  it('a shorter horizon punishes move cost harder', () => {
    const short = rankVenues({
      venues: sampleVenues(now),
      currentId: SAMPLE_CURRENT_ID,
      horizonDays: 7,
      maxReadAgeSec: 120,
      minCapacity: 10_000,
      includeUnverified: false,
      now,
    });
    // At 7 days Venue A's 0.30% move costs 15.64% a year: worse than staying.
    expect(short.ranked.find((v) => v.id === 'venue-a')!.edgeBp!).toBeLessThan(0);
  });
});
