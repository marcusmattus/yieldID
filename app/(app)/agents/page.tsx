'use client';

import { useCallback, useEffect, useState } from 'react';
import { Disclaimer, PageHead } from '@/components/ui';

type Scope = 'pot:read' | 'pot:propose' | 'x402:pay' | 'card:read' | 'card:manage';
interface KeyView {
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
interface Overview {
  proposals: { id: string; kind: string; venueId: string; amountUsdc: number; status: string; createdAt: string; checks: { name: string; pass: boolean; detail: string }[] }[];
  payments: { id: string; key: string; kind: string; amountUsdc: number; at: string; ref: string; txSignature: string | null }[];
}

const PRESETS: { name: string; scopes: Scope[]; perTx: number; daily: number; hint: string }[] = [
  { name: 'Read only', scopes: ['pot:read', 'card:read'], perTx: 0, daily: 0, hint: 'Dashboards, exchange tools, portfolio trackers.' },
  { name: 'Assistant', scopes: ['pot:read', 'pot:propose', 'card:read'], perTx: 1_000, daily: 5_000, hint: 'Proposes moves you sign. Pays nothing.' },
  { name: 'Paying agent', scopes: ['pot:read', 'x402:pay'], perTx: 1, daily: 10, hint: 'Pays for APIs with x402 from its own wallet, within caps.' },
];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

export default function AgentsPage() {
  const [keys, setKeys] = useState<KeyView[]>([]);
  const [scopeText, setScopeText] = useState<Record<string, string>>({});
  const [kill, setKill] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [form, setForm] = useState({ label: '', scopes: PRESETS[0].scopes as Scope[], perTx: 0, daily: 0, days: 30, payTo: '' });
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    const [k, o] = await Promise.all([fetch('/api/agent/keys').then((r) => r.json()), fetch('/api/agent/owner').then((r) => r.json())]);
    if (!k.ok) return setError(`${k.reason} ${k.fix ?? ''}`);
    setKeys(k.keys);
    setKill(k.killSwitch);
    setScopeText(k.scopes);
    if (o.ok) setOverview(o);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  async function create() {
    setError(null);
    const res = await fetch('/api/agent/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label: form.label,
        scopes: form.scopes,
        perTxCapUsdc: form.perTx,
        dailyCapUsdc: form.daily,
        expiresInDays: form.days,
        payToAllowList: form.payTo.split(/[\s,]+/).filter(Boolean),
      }),
    }).then((r) => r.json());
    if (!res.ok) return setError(`${res.reason} ${res.fix ?? ''}`);
    setSecret(res.secret);
    setForm((f) => ({ ...f, label: '' }));
    load();
  }

  async function revoke(id: string) {
    await fetch(`/api/agent/keys?id=${id}`, { method: 'DELETE' });
    load();
  }

  async function toggleKill() {
    await fetch('/api/agent/kill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: !kill }) });
    load();
  }

  const live = keys.filter((k) => !k.revoked && new Date(k.expiresAt).getTime() > Date.now());

  return (
    <>
      <PageHead
        eyebrow="YieldID · Agents"
        title="Agent and exchange access"
        lede="Give an AI agent, a bot or an exchange-side tool its own key. Each key has scopes, a per-transaction cap, a daily cap and an expiry. No key can sign for your wallet."
        actions={
          <button type="button" className={`yf-btn ${kill ? 'yf-btn--primary' : 'yf-btn--secondary'}`} onClick={toggleKill} aria-pressed={kill}>
            {kill ? 'Release kill switch' : 'Pause all agents'}
          </button>
        }
      />

      {kill && <p className="yf-error-text" role="status">Kill switch engaged: every agent key is refused until you release it.</p>}
      {error && <p className="yf-error-text" role="alert">{error}</p>}

      <div className="yf-split">
        <section className="yf-card yf-stack" aria-labelledby="new-h">
          <h2 id="new-h" className="yf-h2">New key</h2>
          <div className="yf-row" role="group" aria-label="Presets">
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="yf-btn yf-btn--secondary" title={p.hint} onClick={() => setForm((f) => ({ ...f, scopes: p.scopes, perTx: p.perTx, daily: p.daily }))}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="yf-fields">
            <div className="yf-field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="k-label">Label</label>
              <div className="yf-inputwrap"><input id="k-label" className="yf-input" placeholder="e.g. Claude Desktop, Binance sweep bot" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
            </div>
            <fieldset className="yf-fieldset" style={{ gridColumn: '1 / -1' }}>
              <legend>Scopes</legend>
              {(Object.keys(scopeText) as Scope[]).map((s) => (
                <label key={s} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 32 }}>
                  <input type="checkbox" checked={form.scopes.includes(s)} onChange={() => setForm({ ...form, scopes: form.scopes.includes(s) ? form.scopes.filter((x) => x !== s) : [...form.scopes, s] })} />
                  <span><code>{s}</code> <span className="yf-fine">{scopeText[s]}</span></span>
                </label>
              ))}
            </fieldset>
            {([['perTx', 'Per-transaction cap', 'USDC'], ['daily', 'Daily cap', 'USDC'], ['days', 'Expires in', 'days']] as const).map(([k, label, unit]) => (
              <div className="yf-field" key={k}>
                <label htmlFor={`k-${k}`}>{label}</label>
                <div className="yf-inputwrap">
                  <input id={`k-${k}`} className="yf-input" type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="yf-inputwrap__unit">{unit}</span>
                </div>
              </div>
            ))}
            {form.scopes.includes('x402:pay') && (
              <div className="yf-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="k-payto">Pay only these recipients (optional)</label>
                <div className="yf-inputwrap"><input id="k-payto" className="yf-input" placeholder="Solana addresses, comma separated. Empty means any." value={form.payTo} onChange={(e) => setForm({ ...form, payTo: e.target.value })} /></div>
              </div>
            )}
          </div>
          <button type="button" className="yf-btn yf-btn--primary" onClick={create} disabled={!form.label || form.scopes.length === 0}>
            Create key
          </button>
          {secret && (
            <div className="yf-stack" role="status">
              <p className="yf-ok-text">Copy this key now. It is not stored and will not be shown again.</p>
              <pre className="yf-code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{secret}</pre>
              <button type="button" className="yf-btn yf-btn--secondary" onClick={() => navigator.clipboard.writeText(secret)}>Copy</button>
            </div>
          )}
        </section>

        <aside className="yf-stack-6">
          <section className="yf-card yf-stack" aria-labelledby="con-h">
            <h2 id="con-h" className="yf-h2">Connect an agent</h2>
            <p className="yf-fine">Remote MCP (Claude, Cursor, exchange tools). No wallet needed:</p>
            <pre className="yf-code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{`URL     ${origin}/api/mcp
Header  Authorization: Bearer yid_sk_…`}</pre>
            <p className="yf-fine">Local MCP, adds x402 payments from the agent&apos;s own wallet:</p>
            <pre className="yf-code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{`YIELDID_API_URL=${origin}
YIELDID_API_KEY=yid_sk_…
YIELDID_AGENT_WALLET_SECRET=…   # optional
npx tsx mcp/stdio.ts`}</pre>
            <p className="yf-fine">REST: the same key on <code>/api/agent/*</code>. See docs/AGENTS.md.</p>
          </section>
        </aside>
      </div>

      <section className="yf-card yf-stack" aria-labelledby="keys-h">
        <h2 id="keys-h" className="yf-h2">Keys ({live.length} live)</h2>
        {keys.length === 0 ? (
          <p className="yf-fine">No keys yet.</p>
        ) : (
          <table className="yf-table">
            <thead>
              <tr><th>Label</th><th>Scopes</th><th>Caps</th><th>Last used</th><th>Expires</th><th /></tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.label}<br /><span className="yf-fine yf-mono">yid_sk_{k.id}_…</span></td>
                  <td className="yf-fine">{k.scopes.join(', ')}</td>
                  <td className="yf-cell-num">{k.perTxCapUsdc} / tx<br />{k.dailyCapUsdc} / day</td>
                  <td className="yf-fine">{when(k.lastUsedAt)}</td>
                  <td className="yf-fine">{k.revoked ? 'Revoked' : when(k.expiresAt)}</td>
                  <td>{!k.revoked && <button type="button" className="yf-btn yf-btn--text" onClick={() => revoke(k.id)}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="yf-split yf-split--even">
        <section className="yf-card yf-stack" aria-labelledby="prop-h">
          <h2 id="prop-h" className="yf-h2">Proposals from agents</h2>
          {!overview?.proposals.length ? (
            <p className="yf-fine">None yet. Agents with pot:propose can ask to deposit or withdraw; you sign.</p>
          ) : (
            <ul className="yf-rows">
              {overview.proposals.map((p) => (
                <li key={p.id} className="yf-stack">
                  <div className="yf-head">
                    <strong>{p.kind} {p.amountUsdc.toLocaleString('en-GB')} USDC · {p.venueId}</strong>
                    <span className={`yf-badge ${p.status === 'blocked' ? 'yf-badge--danger' : 'yf-badge--warning'}`}>{p.status.replace('_', ' ')}</span>
                  </div>
                  <span className="yf-fine">{when(p.createdAt)}{p.status === 'blocked' && ` · failed: ${p.checks.filter((c) => !c.pass).map((c) => c.name).join(', ')}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="yf-card yf-stack" aria-labelledby="pay-h">
          <h2 id="pay-h" className="yf-h2">x402 payments by agents</h2>
          {!overview?.payments.length ? (
            <p className="yf-fine">None yet. Payments come from each agent&apos;s own wallet, never yours.</p>
          ) : (
            <ul className="yf-rows">
              {overview.payments.map((p) => (
                <li key={p.id}>
                  <strong>{p.amountUsdc} USDC</strong> · {p.key} · <span className="yf-fine">{when(p.at)}</span>
                  <br />
                  <span className="yf-fine yf-mono" style={{ wordBreak: 'break-all' }}>{p.ref}</span>
                  {p.txSignature ? <span className="yf-fine"> · settled</span> : <span className="yf-fine"> · not settled yet</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Disclaimer>Keys are checked on every call. Revoking a key or engaging the kill switch takes effect on the next request. Agents never hold your wallet&apos;s keys.</Disclaimer>
    </>
  );
}
