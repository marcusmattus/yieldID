import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('app store snapshot', () => {
  beforeEach(() => {
    vi.resetModules();
    const mem = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) } });
  });

  it('returns the same object on repeated reads before a wallet is signed in', async () => {
    const store = await import('../lib/store');
    expect(store.readAppState()).toBe(store.readAppState());
  });

  it('starts clean for a different wallet', async () => {
    const store = await import('../lib/store');
    store.setStoreOwner('walletA');
    store.setAppState((s) => ({ ...s, handle: 'alice' }));
    store.setStoreOwner('walletB');
    let seen: string | null = 'unset';
    store.setAppState((s) => { seen = s.handle; return s; });
    expect(seen).toBeNull();
    store.setStoreOwner('walletA');
    store.setAppState((s) => { seen = s.handle; return s; });
    expect(seen).toBe('alice');
  });
});
