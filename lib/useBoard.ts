'use client';

import { useEffect, useMemo, useState } from 'react';
import { rankVenues, type DataSource } from './rates';
import { sampleVenues, SAMPLE_CURRENT_ID } from './sample';
import { useAppState } from './store';

/**
 * The board, computed from the user's rule. Venue reads currently come from
 * the sample set (source 'sample'); swap sampleVenues for live adapters and
 * the screens switch their data status to LIVE automatically.
 */
export function useBoard() {
  const { rule } = useAppState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const venues = useMemo(
    () => sampleVenues(now).filter((v) => v.id === SAMPLE_CURRENT_ID || (rule.chains.includes(v.chain) && rule.sleeves.includes(v.sleeve))),
    [now, rule.chains, rule.sleeves],
  );

  const result = useMemo(
    () =>
      rankVenues({
        venues,
        currentId: SAMPLE_CURRENT_ID,
        horizonDays: rule.horizonDays,
        maxReadAgeSec: rule.maxReadAgeSec,
        minCapacity: rule.minCapacity,
        includeUnverified: rule.includeUnverified,
        now,
      }),
    [venues, rule, now],
  );

  const sources = new Set<DataSource>(venues.map((v) => v.source));
  const status: DataSource = sources.has('sample') ? 'sample' : sources.has('unverified') ? 'unverified' : 'live';
  const best = result.ranked.find((v) => !v.isCurrent && v.edgeBp !== null && v.edgeBp >= rule.edgeBp) ?? null;

  return { ...result, now, rule, status, best };
}
