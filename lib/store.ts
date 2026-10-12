'use client';

import { useSyncExternalStore } from 'react';
import type { Rule, SpendPolicy } from './policy';

/**
 * The user's rule and spend policy, kept in this browser for the demo.
 * In production the spend policy lives in a PDA the user owns; this store is
 * a local mirror and is labelled as such on the policy screen.
 */

export interface AppState {
  rule: Rule;
  policy: SpendPolicy;
  handle: string | null;
  channels: { telegram: boolean; discord: boolean; slack: boolean; showAmounts: boolean };
}

const DAY = 86_400_000;

export const defaultState = (): AppState => ({
  rule: {
    edgeBp: 100,
    horizonDays: 30,
    minHoldMin: 1440,
    minCapacity: 10_000,
    maxMove: 100_000,
    maxReadAgeSec: 120,
    assets: ['USDC', 'yUSD', 'yUSDC'],
    chains: ['Solana', 'Hyperliquid', 'Base'],
    sleeves: ['forge', 'rwa'],
    includeUnverified: false,
  },
  policy: {
    perTxCap: 50_000,
    dailyCap: 50_000,
    slippageBp: 30,
    allowList: ['venue-b', 'venue-c', 'venue-d'],
    expiresAt: Date.now() + 30 * DAY,
    killSwitch: false,
  },
  handle: null,
  channels: { telegram: false, discord: false, slack: false, showAmounts: false },
});

const KEY = 'yieldid:state:v1';
let state: AppState | null = null;
const listeners = new Set<() => void>();

function load(): AppState {
  if (state) return state;
  const fallback = defaultState();
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw ? { ...fallback, ...(JSON.parse(raw) as Partial<AppState>) } : fallback;
  } catch {
    state = fallback;
  }
  return state;
}

export function setAppState(update: (s: AppState) => AppState) {
  state = update(load());
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: keep in memory */
  }
  listeners.forEach((l) => l());
}

const serverSnapshot = defaultState();

export function useAppState(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load,
    () => serverSnapshot,
  );
}
