import { beforeEach, describe, expect, it } from 'vitest';
import { authenticate, authorizeSpend, createKey, releaseSpend, revokeKey, setKillSwitch } from '../lib/agent/keys';
import { MemoryStore, setStore } from '../lib/agent/store';

const OWNER = 'So11111111111111111111111111111111111111112';
const now = 1_800_000_000_000;

beforeEach(() => setStore(new MemoryStore()));

async function key(over: Record<string, unknown> = {}) {
  return createKey(OWNER, { label: 'test', scopes: ['pot:read', 'x402:pay'], perTxCapUsdc: 1, dailyCapUsdc: 2, expiresInDays: 30, ...over }, now);
}

describe('agent keys', () => {
  it('authenticates the full key and nothing else', async () => {
    const { secret, key: view } = await key();
    expect(secret).toMatch(/^yid_sk_[0-9a-f]{12}_/);
    const ok = await authenticate(`Bearer ${secret}`, now);
    expect(ok.ok && ok.key.id).toBe(view.id);
    const tampered = await authenticate(`Bearer ${secret.slice(0, -2)}xx`, now);
    expect(tampered.ok).toBe(false);
    expect((await authenticate(null, now)).ok).toBe(false);
  });

  it('refuses revoked and expired keys, and all keys under the kill switch', async () => {
    const { secret, key: view } = await key();
    expect((await authenticate(secret, now + 31 * 86_400_000)).ok).toBe(false);
    await setKillSwitch(OWNER, true);
    const killed = await authenticate(secret, now);
    expect(killed.ok === false && killed.status).toBe(403);
    await setKillSwitch(OWNER, false);
    expect(await revokeKey(OWNER, view.id, now)).toBe(true);
    expect((await authenticate(secret, now)).ok).toBe(false);
  });

  it('rejects bad input with a fix', async () => {
    await expect(key({ scopes: [] })).rejects.toThrow(/scope/);
    await expect(key({ perTxCapUsdc: 5, dailyCapUsdc: 1 })).rejects.toThrow(/daily cap/);
    await expect(key({ perTxCapUsdc: 0.0000001 })).rejects.toThrow(/decimal/);
  });

  it('enforces per-transaction, daily and recipient limits and records the spend', async () => {
    const { key: view } = await key({ payToAllowList: ['merchant1'] });
    const spend = (amount: bigint, payTo = 'merchant1') => authorizeSpend(view.id, { kind: 'x402', amountMicro: amount, ref: 'https://api.example/x', payTo, scope: 'x402:pay' }, now);

    const tooBig = await spend(1_500_000n);
    expect(tooBig.ok).toBe(false);
    expect(tooBig.checks.find((c) => c.id === 'per_tx')?.pass).toBe(false);

    const wrongTo = await spend(10_000n, 'stranger');
    expect(wrongTo.checks.find((c) => c.id === 'pay_to')?.pass).toBe(false);

    expect((await spend(1_000_000n)).ok).toBe(true);
    const second = await spend(1_000_000n);
    expect(second.ok).toBe(true);
    const third = await spend(1n);
    expect(third.ok).toBe(false);
    expect(third.checks.find((c) => c.id === 'daily')?.pass).toBe(false);

    // Releasing an unpaid reservation gives the room back.
    expect(await releaseSpend(view.id, second.entry!.id)).toBe(true);
    expect((await spend(1n)).ok).toBe(true);
  });

  it('cannot overspend the daily cap with concurrent payments', async () => {
    const { key: view } = await key({ perTxCapUsdc: 1, dailyCapUsdc: 1 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => authorizeSpend(view.id, { kind: 'x402', amountMicro: 400_000n, ref: 'r', scope: 'x402:pay' }, now)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
  });

  it('refuses a spend without the scope', async () => {
    const { key: view } = await key({ scopes: ['pot:read'] });
    const r = await authorizeSpend(view.id, { kind: 'x402', amountMicro: 1n, ref: 'r', scope: 'x402:pay' }, now);
    expect(r.ok).toBe(false);
    expect(r.checks[0]).toMatchObject({ id: 'scope', pass: false });
  });
});
