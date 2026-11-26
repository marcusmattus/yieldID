'use client';

import { useCallback, useEffect, useState } from 'react';
import { Disclaimer, PageHead } from '@/components/ui';

interface Card {
  id: string;
  label: string;
  last4: string;
  network: string;
  status: 'active' | 'frozen';
  spendLimitUsdc: number;
  limitWindow: string;
  issuer: string;
  sandbox: boolean;
  createdAt: string;
}

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ label: 'Everyday', limit: 500, window: 'monthly' });

  const load = useCallback(async () => {
    const r = await fetch('/api/agent/cards').then((x) => x.json());
    if (!r.ok) return setError(`${r.reason} ${r.fix ?? ''}`);
    setCards(r.cards);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function issue() {
    setError(null);
    const r = await fetch('/api/agent/cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: form.label, spendLimitUsdc: form.limit, limitWindow: form.window }),
    }).then((x) => x.json());
    if (!r.ok) return setError(`${r.reason} ${r.fix ?? ''}`);
    load();
  }

  async function patch(id: string, body: object) {
    const r = await fetch(`/api/agent/cards/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
    if (!r.ok) setError(`${r.reason} ${r.fix ?? ''}`);
    load();
  }

  return (
    <>
      <PageHead
        eyebrow="YieldID · Spend"
        title="Stablecoin cards"
        lede="A virtual Visa that spends USDC from your wallet, with its own limit. Add it to Apple Pay or Google Pay from the YieldID app on your phone. Agents with card:manage can issue and freeze cards; only you can add one to a phone or close it."
      />
      {error && <p className="yf-error-text" role="alert">{error}</p>}

      <div className="yf-split">
        <section className="yf-card yf-stack" aria-labelledby="cards-h">
          <h2 id="cards-h" className="yf-h2">Your cards</h2>
          {cards.length === 0 ? (
            <p className="yf-fine">No cards yet.</p>
          ) : (
            <ul className="yf-rows">
              {cards.map((c) => (
                <li key={c.id} className="yf-stack">
                  <div className="yf-head">
                    <strong>{c.label} · {c.network.toUpperCase()} ···· {c.last4}</strong>
                    <span className="yf-row">
                      {c.sandbox && <span className="yf-badge yf-badge--sample">Sandbox · not a real card</span>}
                      <span className={`yf-badge ${c.status === 'active' ? 'yf-badge--success' : 'yf-badge--warning'}`}>{c.status}</span>
                    </span>
                  </div>
                  <span className="yf-fine">Limit {c.spendLimitUsdc.toLocaleString('en-GB')} USDC {c.limitWindow.replace('_', ' ')} · issuer {c.issuer}</span>
                  <div className="yf-row">
                    <button type="button" className="yf-btn yf-btn--secondary" onClick={() => patch(c.id, { status: c.status === 'active' ? 'frozen' : 'active' })}>
                      {c.status === 'active' ? 'Freeze' : 'Unfreeze'}
                    </button>
                    <button type="button" className="yf-btn yf-btn--text" onClick={() => patch(c.id, { status: 'closed' })}>Close card</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="yf-stack-6">
          <section className="yf-card yf-stack" aria-labelledby="issue-h">
            <h2 id="issue-h" className="yf-h2">Issue a virtual card</h2>
            <div className="yf-fields">
              <div className="yf-field">
                <label htmlFor="c-label">Label</label>
                <div className="yf-inputwrap"><input id="c-label" className="yf-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
              </div>
              <div className="yf-field">
                <label htmlFor="c-limit">Spend limit</label>
                <div className="yf-inputwrap">
                  <input id="c-limit" className="yf-input" type="number" min={0} value={form.limit} onChange={(e) => setForm({ ...form, limit: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="yf-inputwrap__unit">USDC</span>
                </div>
              </div>
              <div className="yf-field">
                <label htmlFor="c-window">Per</label>
                <div className="yf-inputwrap"><select id="c-window" className="yf-select" value={form.window} onChange={(e) => setForm({ ...form, window: e.target.value })}>
                  <option value="per_transaction">transaction</option>
                  <option value="daily">day</option>
                  <option value="monthly">month</option>
                </select></div>
              </div>
            </div>
            <button type="button" className="yf-btn yf-btn--primary" onClick={issue}>Issue card</button>
          </section>
          <section className="yf-card yf-stack" aria-labelledby="wallet-h">
            <h2 id="wallet-h" className="yf-h2">Apple Pay and Google Pay</h2>
            <p className="yf-fine">
              Adding a card to a phone wallet happens in the YieldID iOS or Android app: the phone gets a one-time challenge from Apple or Google, the app sends it to
              {' '}<code>/api/agent/cards/&lt;id&gt;/provision</code>, and the card issuer returns an encrypted pass only the wallet can open. YieldID never sees the card number.
            </p>
            <p className="yf-fine">Needs a card issuer partner, Apple&apos;s in-app provisioning entitlement and Google&apos;s push provisioning approval. Until then cards here are sandbox records.</p>
          </section>
        </aside>
      </div>
      <Disclaimer>Card spending draws on your stablecoins. A card issuer partner handles KYC, the card network and disputes; YieldID does not hold funds.</Disclaimer>
    </>
  );
}
