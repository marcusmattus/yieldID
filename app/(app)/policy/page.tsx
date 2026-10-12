'use client';

import { Disclaimer, PageHead } from '@/components/ui';
import type { SpendPolicy } from '@/lib/policy';
import { sampleVenues } from '@/lib/sample';
import { setAppState, useAppState } from '@/lib/store';

const DAY = 86_400_000;

export default function PolicyPage() {
  const { policy } = useAppState();
  const set = (patch: Partial<SpendPolicy>) => setAppState((s) => ({ ...s, policy: { ...s.policy, ...patch } }));
  const venues = sampleVenues(0);
  const daysLeft = Math.max(0, Math.ceil((policy.expiresAt - Date.now()) / DAY));

  return (
    <>
      <PageHead
        eyebrow="YieldID · Limits"
        title="Spend policy"
        lede="Every proposal is checked against these limits before it reaches your wallet. No agent can change them."
      />

      <div className="yf-split">
        <section className="yf-policy yf-stack" aria-labelledby="lim-h">
          <div className="yf-head">
            <h2 id="lim-h" className="yf-h2">Limits</h2>
            <span className="yf-badge yf-badge--unverified">Unverified · stored in this browser</span>
          </div>
          <p className="yf-fine">The on-chain policy PDA is not deployed yet. Until it is, these limits are enforced by this app when it builds proposals, not by a program.</p>
          <div className="yf-fields">
            {([
              ['perTxCap', 'Per-transaction cap', 'USDC'],
              ['dailyCap', 'Daily cap', 'USDC'],
              ['slippageBp', 'Slippage limit', 'bp'],
            ] as const).map(([k, label, unit]) => (
              <div className="yf-field" key={k}>
                <label htmlFor={k}>{label}</label>
                <div className="yf-inputwrap">
                  <input id={k} className="yf-input" type="number" min={0} value={policy[k]} onChange={(e) => set({ [k]: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="yf-inputwrap__unit">{unit}</span>
                </div>
              </div>
            ))}
            <div className="yf-field">
              <label htmlFor="expiry">Expires in</label>
              <div className="yf-inputwrap">
                <input id="expiry" className="yf-input" type="number" min={0} value={daysLeft} onChange={(e) => set({ expiresAt: Date.now() + Math.max(0, Number(e.target.value) || 0) * DAY })} />
                <span className="yf-inputwrap__unit">days</span>
              </div>
              <p className="yf-field__hint">{new Date(policy.expiresAt).toUTCString()}</p>
            </div>
          </div>
        </section>

        <aside className="yf-stack-6">
          <section className="yf-card yf-stack" aria-labelledby="al-h">
            <h2 id="al-h" className="yf-h2">Allow-list</h2>
            <p className="yf-fine">A proposal to a venue not ticked here fails the allow-list check.</p>
            <ul className="yf-allow">
              {venues.map((v) => (
                <li key={v.id}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--ember)' }} checked={policy.allowList.includes(v.id)} onChange={() => set({ allowList: policy.allowList.includes(v.id) ? policy.allowList.filter((x) => x !== v.id) : [...policy.allowList, v.id] })} />
                    <span>{v.name} · {v.chain}<br /><span className="yf-fine">{v.product}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          <section className="yf-card yf-stack" aria-labelledby="who-h">
            <h2 id="who-h" className="yf-h2">Who can propose</h2>
            <ul className="yf-scopes">
              <li><span className="yf-scope-word yf-scope-word--asked">Can</span><span>Signal builds unsigned transactions within these limits.</span></li>
              <li><span className="yf-scope-word yf-scope-word--not">Cannot</span><span>Sign, broadcast, change limits, edit the allow-list or release the kill switch.</span></li>
            </ul>
          </section>
        </aside>
      </div>

      <section className="yf-stack" aria-labelledby="dz-h">
        <h2 id="dz-h" className="yf-h2">Stop everything</h2>
        <div className="yf-danger-zone">
          <div>
            <p className="yf-small" style={{ color: 'var(--ink)' }}><b>Kill switch</b> · {policy.killSwitch ? 'Engaged' : 'Off'}</p>
            <p className="yf-fine">Stops every proposal now. Funds stay where they are; nothing is withdrawn.</p>
          </div>
          <button className="yf-switch" type="button" aria-pressed={policy.killSwitch} onClick={() => set({ killSwitch: !policy.killSwitch })}>
            {policy.killSwitch ? 'Release kill switch' : 'Engage kill switch'}
          </button>
        </div>
      </section>
      <Disclaimer>A spend policy limits what Signal can propose. It does not protect funds already at a venue from that venue&apos;s own risks.</Disclaimer>
    </>
  );
}
