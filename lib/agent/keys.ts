import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fromMicro, toMicro } from '../chain';
import { isScope, type Scope } from './scopes';
import { getStore, type AgentKey, type LedgerEntry } from './store';

/**
 * Agent API keys.
 *
 * Format: yid_sk_<id>_<secret>. Only sha256(secret) is stored. The full key
 * is shown once, at creation. Every key has scopes, a per-transaction cap, a
 * daily cap and an expiry; the owner's kill switch stops all of them at once.
 */

const PREFIX = 'yid_sk_';
const DAY = 86_400_000;
const MAX_KEY_DAYS = 365;

export interface NewKeyInput {
  label: string;
  scopes: Scope[];
  perTxCapUsdc: number;
  dailyCapUsdc: number;
  expiresInDays: number;
  payToAllowList?: string[];
}

/** What the API returns about a key. Never includes the secret or its hash. */
export interface KeyView {
  id: string;
  label: string;
  scopes: Scope[];
  perTxCapUsdc: number;
  dailyCapUsdc: number;
  payToAllowList: string[];
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  lastUsedAt: string | null;
}

export function viewKey(k: AgentKey): KeyView {
  return {
    id: k.id,
    label: k.label,
    scopes: k.scopes,
    perTxCapUsdc: fromMicro(k.perTxCapMicro),
    dailyCapUsdc: fromMicro(k.dailyCapMicro),
    payToAllowList: k.payToAllowList,
    createdAt: new Date(k.createdAt).toISOString(),
    expiresAt: new Date(k.expiresAt).toISOString(),
    revoked: k.revokedAt !== null,
    lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
  };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class InputError extends Error {
  constructor(
    message: string,
    public fix: string,
  ) {
    super(message);
  }
}

export function validateNewKey(input: Partial<NewKeyInput>): NewKeyInput {
  const label = String(input.label ?? '').trim().slice(0, 60);
  if (!label) throw new InputError('Label is required.', 'Name the key after the agent or tool that will use it.');
  const scopes = Array.isArray(input.scopes) ? input.scopes.filter(isScope) : [];
  if (scopes.length === 0) throw new InputError('Pick at least one scope.', 'Use pot:read for a read-only tool.');
  const perTx = Number(input.perTxCapUsdc ?? 0);
  const daily = Number(input.dailyCapUsdc ?? 0);
  if (!(perTx >= 0) || !(daily >= 0)) throw new InputError('Caps must be zero or more.', 'Set caps in USDC.');
  if (perTx > daily) throw new InputError('Per-transaction cap is above the daily cap.', 'Lower the per-transaction cap or raise the daily cap.');
  const days = Number(input.expiresInDays ?? 30);
  if (!(days > 0 && days <= MAX_KEY_DAYS)) throw new InputError(`Expiry must be 1 to ${MAX_KEY_DAYS} days.`, 'Pick a shorter expiry and rotate the key.');
  const payToAllowList = Array.isArray(input.payToAllowList) ? input.payToAllowList.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 50) : [];
  // toMicro throws on bad precision.
  toMicro(perTx);
  toMicro(daily);
  return { label, scopes: [...new Set(scopes)], perTxCapUsdc: perTx, dailyCapUsdc: daily, expiresInDays: days, payToAllowList };
}

export async function createKey(owner: string, raw: Partial<NewKeyInput>, now = Date.now()): Promise<{ key: KeyView; secret: string }> {
  const input = validateNewKey(raw);
  const id = randomBytes(6).toString('hex');
  const secretPart = randomBytes(24).toString('base64url');
  const record: AgentKey = {
    id,
    owner,
    label: input.label,
    secretHash: sha256(secretPart),
    scopes: input.scopes,
    perTxCapMicro: toMicro(input.perTxCapUsdc).toString(),
    dailyCapMicro: toMicro(input.dailyCapUsdc).toString(),
    payToAllowList: input.payToAllowList ?? [],
    createdAt: now,
    expiresAt: now + input.expiresInDays * DAY,
    revokedAt: null,
    lastUsedAt: null,
  };
  await getStore().update((s) => {
    s.keys.push(record);
  });
  return { key: viewKey(record), secret: `${PREFIX}${id}_${secretPart}` };
}

export async function listKeys(owner: string): Promise<KeyView[]> {
  const s = await getStore().read();
  return s.keys.filter((k) => k.owner === owner).map(viewKey);
}

export async function revokeKey(owner: string, id: string, now = Date.now()): Promise<boolean> {
  return getStore().update((s) => {
    const k = s.keys.find((x) => x.id === id && x.owner === owner);
    if (!k || k.revokedAt !== null) return false;
    k.revokedAt = now;
    return true;
  });
}

export async function setKillSwitch(owner: string, on: boolean) {
  await getStore().update((s) => {
    s.owners[owner] = { ...(s.owners[owner] ?? {}), killSwitch: on };
  });
}

export async function getKillSwitch(owner: string): Promise<boolean> {
  const s = await getStore().read();
  return s.owners[owner]?.killSwitch ?? false;
}

export type AuthFailure = { ok: false; status: 401 | 403; reason: string; fix: string };
export type AuthOk = { ok: true; key: AgentKey };

/** Parse "Bearer yid_sk_..." (or a bare key) and check it is live. */
export async function authenticate(header: string | null, now = Date.now()): Promise<AuthOk | AuthFailure> {
  const token = (header ?? '').replace(/^Bearer\s+/i, '').trim();
  const m = /^yid_sk_([0-9a-f]{12})_([A-Za-z0-9_-]{20,})$/.exec(token);
  if (!m) return { ok: false, status: 401, reason: 'Missing or malformed API key.', fix: 'Send Authorization: Bearer yid_sk_… with a key from the Agents screen.' };
  const [, id, secretPart] = m;
  const s = await getStore().read();
  const key = s.keys.find((k) => k.id === id);
  const given = Buffer.from(sha256(secretPart), 'hex');
  const expected = Buffer.from(key?.secretHash ?? '0'.repeat(64), 'hex');
  if (!key || !timingSafeEqual(given, expected)) return { ok: false, status: 401, reason: 'Unknown API key.', fix: 'Create a new key on the Agents screen.' };
  if (key.revokedAt !== null) return { ok: false, status: 401, reason: 'This key was revoked.', fix: 'Create a new key on the Agents screen.' };
  if (now >= key.expiresAt) return { ok: false, status: 401, reason: 'This key has expired.', fix: 'Create a new key on the Agents screen.' };
  if (s.owners[key.owner]?.killSwitch) return { ok: false, status: 403, reason: "The owner's kill switch is engaged. Every agent key is paused.", fix: 'The owner releases the kill switch on the Agents screen.' };
  await getStore().update((st) => {
    const k = st.keys.find((x) => x.id === id);
    if (k) k.lastUsedAt = now;
  });
  return { ok: true, key };
}

export function hasScope(key: AgentKey, scope: Scope) {
  return key.scopes.includes(scope);
}

const utcDayStart = (now: number) => now - (now % DAY);

export function spentToday(ledger: LedgerEntry[], keyId: string, now: number): bigint {
  const from = utcDayStart(now);
  return ledger.filter((e) => e.keyId === keyId && e.at >= from).reduce((a, e) => a + BigInt(e.amountMicro), 0n);
}

export interface SpendCheck {
  id: 'scope' | 'per_tx' | 'daily' | 'pay_to' | 'kill';
  name: string;
  pass: boolean;
  detail: string;
  fix?: string;
}

const usd = (m: bigint) => `${fromMicro(m).toLocaleString('en-GB', { maximumFractionDigits: 6 })} USDC`;

/**
 * Check a spend against the key, then record it in the same atomic step so
 * two concurrent payments cannot both slip under the daily cap.
 */
export async function authorizeSpend(
  keyId: string,
  spend: { kind: LedgerEntry['kind']; amountMicro: bigint; ref: string; payTo?: string; scope: Scope },
  now = Date.now(),
): Promise<{ ok: boolean; checks: SpendCheck[]; entry?: LedgerEntry; spentTodayMicro: bigint }> {
  return getStore().update((s) => {
    const key = s.keys.find((k) => k.id === keyId);
    if (!key) throw new Error('Key vanished during authorisation.');
    const before = spentToday(s.ledger, keyId, now);
    const perTx = BigInt(key.perTxCapMicro);
    const daily = BigInt(key.dailyCapMicro);
    const after = before + spend.amountMicro;
    const killed = s.owners[key.owner]?.killSwitch ?? false;
    const checks: SpendCheck[] = [
      { id: 'scope', name: `Key has ${spend.scope}`, pass: key.scopes.includes(spend.scope), detail: `Key scopes: ${key.scopes.join(', ')}`, fix: `Create a key with ${spend.scope}.` },
      { id: 'per_tx', name: 'Per-transaction cap', pass: spend.amountMicro <= perTx, detail: `${usd(spend.amountMicro)} vs cap ${usd(perTx)}`, fix: 'Lower the amount or ask the owner for a key with a higher cap.' },
      { id: 'daily', name: 'Daily cap', pass: after <= daily, detail: `Spent today ${usd(before)} + this ${usd(spend.amountMicro)} = ${usd(after)}, cap ${usd(daily)}`, fix: 'Wait for the cap to reset at 00:00 UTC, or ask the owner to raise it.' },
      {
        id: 'pay_to',
        name: 'Recipient allowed',
        pass: !spend.payTo || key.payToAllowList.length === 0 || key.payToAllowList.includes(spend.payTo),
        detail: key.payToAllowList.length === 0 ? 'Key allows any recipient' : `${spend.payTo ?? 'none'} ${spend.payTo && key.payToAllowList.includes(spend.payTo) ? 'is' : 'is not'} on the key's list`,
        fix: "Ask the owner to add the recipient to the key's allow-list.",
      },
      { id: 'kill', name: 'Kill switch off', pass: !killed, detail: killed ? 'Engaged' : 'Off', fix: 'The owner releases it on the Agents screen.' },
    ];
    const ok = checks.every((c) => c.pass);
    if (!ok) return { ok, checks, spentTodayMicro: before };
    const entry: LedgerEntry = {
      id: randomBytes(8).toString('hex'),
      keyId,
      owner: key.owner,
      kind: spend.kind,
      amountMicro: spend.amountMicro.toString(),
      at: now,
      ref: spend.ref.slice(0, 500),
      payTo: spend.payTo,
    };
    s.ledger.push(entry);
    return { ok, checks, entry, spentTodayMicro: after };
  });
}

/** Attach the settlement signature to a ledger entry the same key created. */
export async function recordSettlement(keyId: string, entryId: string, txSignature: string): Promise<boolean> {
  return getStore().update((s) => {
    const e = s.ledger.find((x) => x.id === entryId && x.keyId === keyId);
    if (!e) return false;
    e.txSignature = txSignature.slice(0, 120);
    return true;
  });
}

/** Release a reservation that was never paid (the facilitator refused, the request failed). */
export async function releaseSpend(keyId: string, entryId: string): Promise<boolean> {
  return getStore().update((s) => {
    const i = s.ledger.findIndex((x) => x.id === entryId && x.keyId === keyId && !x.txSignature);
    if (i < 0) return false;
    s.ledger.splice(i, 1);
    return true;
  });
}
