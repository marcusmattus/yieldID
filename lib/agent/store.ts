import 'server-only';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Scope } from './scopes';

/**
 * Server-side state for the agent layer: keys, the spend ledger, proposals,
 * cards and the owner's kill switch.
 *
 * Two backends ship: memory (tests) and a JSON file (local dev). Neither is
 * fit for a serverless deploy, where the filesystem is read-only and memory is
 * per instance. Implement AgentStore over Postgres, Upstash Redis or similar
 * before going live; the interface is small on purpose.
 */

export interface AgentKey {
  id: string;
  /** Solana address of the wallet that created the key. */
  owner: string;
  label: string;
  /** sha256 of the secret part, hex. The secret itself is never stored. */
  secretHash: string;
  scopes: Scope[];
  /** Largest single payment or proposal, in micro-USDC (string to survive JSON). */
  perTxCapMicro: string;
  /** Total per UTC day, in micro-USDC. */
  dailyCapMicro: string;
  /** Optional: x402 recipients (payTo addresses) this key may pay. Empty = any. */
  payToAllowList: string[];
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
}

export interface LedgerEntry {
  id: string;
  keyId: string;
  owner: string;
  kind: 'x402' | 'card' | 'pot';
  amountMicro: string;
  at: number;
  /** What was paid for: a URL, a card id or a venue id. */
  ref: string;
  payTo?: string;
  /** Set once the payer reports the settlement transaction. */
  txSignature?: string;
}

export interface Proposal {
  id: string;
  owner: string;
  keyId: string;
  kind: 'deposit' | 'withdraw';
  venueId: string;
  amountMicro: string;
  createdAt: number;
  status: 'awaiting_signature' | 'blocked' | 'signed' | 'cancelled';
  checks: { id: string; name: string; pass: boolean; detail: string; fix?: string }[];
  /** Unsigned base64 transaction when a live adapter built one. */
  transaction?: string;
}

export interface CardRecord {
  id: string;
  owner: string;
  issuer: string;
  issuerCardId: string;
  label: string;
  last4: string;
  network: 'visa' | 'mastercard';
  status: 'active' | 'frozen' | 'closed';
  spendLimitMicro: string;
  limitWindow: 'per_transaction' | 'daily' | 'monthly';
  createdAt: number;
  createdByKey: string | null;
  sandbox: boolean;
}

export interface OwnerSettings {
  /** Stops every agent key for this owner at once. */
  killSwitch: boolean;
}

export interface AgentState {
  keys: AgentKey[];
  ledger: LedgerEntry[];
  proposals: Proposal[];
  cards: CardRecord[];
  owners: Record<string, OwnerSettings>;
}

export interface AgentStore {
  read(): Promise<AgentState>;
  /** Apply a change atomically and return what the updater returned. */
  update<T>(fn: (s: AgentState) => T): Promise<T>;
}

const empty = (): AgentState => ({ keys: [], ledger: [], proposals: [], cards: [], owners: {} });

export class MemoryStore implements AgentStore {
  private state: AgentState = empty();
  private chain: Promise<unknown> = Promise.resolve();
  async read() {
    return structuredClone(this.state);
  }
  update<T>(fn: (s: AgentState) => T): Promise<T> {
    const run = this.chain.then(() => fn(this.state));
    this.chain = run.catch(() => undefined);
    return run;
  }
}

export class FileStore implements AgentStore {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private path: string) {}
  private load(): AgentState {
    try {
      return { ...empty(), ...(JSON.parse(readFileSync(this.path, 'utf8')) as Partial<AgentState>) };
    } catch {
      return empty();
    }
  }
  async read() {
    return this.load();
  }
  update<T>(fn: (s: AgentState) => T): Promise<T> {
    const run = this.chain.then(() => {
      const s = this.load();
      const out = fn(s);
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
      renameSync(tmp, this.path);
      return out;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}

let store: AgentStore | null = null;

export function getStore(): AgentStore {
  if (store) return store;
  const kind = process.env.YID_AGENT_STORE ?? 'file';
  store = kind === 'memory' ? new MemoryStore() : new FileStore(resolve(process.env.YID_AGENT_STORE_PATH ?? '.data/agent-store.json'));
  return store;
}

/** Tests swap in a fresh store. */
export function setStore(s: AgentStore) {
  store = s;
}
