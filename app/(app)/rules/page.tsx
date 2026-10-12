'use client';

import type { ChangeEvent } from 'react';
import { Disclaimer, PageHead, SampleRegion } from '@/components/ui';
import type { Rule } from '@/lib/policy';
import { fmtBp, type Chain, type SleeveKind } from '@/lib/rates';
import { setAppState, useAppState, defaultState } from '@/lib/store';
import { useBoard } from '@/lib/useBoard';

const ASSETS = ['USDC', 'yUSD', 'yGBP', 'yUSDC', 'yUSDT', 'USDT'];
const CHAINS: Chain[] = ['Solana', 'Hyperliquid', 'Base', 'Ethereum', 'Arbitrum'];

function NumField({ id, label, unit, hint, value, onChange }: { id: keyof Rule; label: string; unit: string; hint: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="yf-field">
      <label htmlFor={id}>{label}</label>
      <div className="yf-inputwrap">
        <input id={id} className="yf-input" type="number" min={id === 'horizonDays' ? 1 : 0} value={value} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))} />
        <span className="yf-inputwrap__unit">{unit}</span>
      </div>
      <p className="yf-field__hint">{hint}</p>
    </div>
  );
}

export default function RulesPage() {
  const { rule, channels } = useAppState();
  const { ranked, notRanked } = useBoard();
  const set = (patch: Partial<Rule>) => setAppState((s) => ({ ...s, rule: { ...s.rule, ...patch } }));
  const toggle = <T extends string>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const posted = [channels.telegram && 'Telegram', channels.discord && 'Discord', channels.slack && 'Slack'].filter(Boolean).join(', ') || 'no channels yet';

  return (
    <>
      <PageHead eyebrow="Signal · Rule" title="Rule builder" lede="A rule says when a switch between pots is worth proposing. Signal builds the unsigned transaction and posts it; only you can sign it. Changes apply to the board immediately." />

      <div className="yf-split">
        <section className="yf-card yf-stack-6" aria-labelledby="when-h">
          <h2 id="when-h" className="yf-h2">Propose a move when</h2>
          <div className="yf-fields">
            <NumField id="edgeBp" label="Net edge at least" unit="bp" hint="Net of annualised move cost, versus the current sleeve." value={rule.edgeBp} onChange={(edgeBp) => set({ edgeBp })} />
            <NumField id="horizonDays" label="Horizon" unit="days" hint="How long you expect to stay. Shorter horizons punish move cost harder." value={rule.horizonDays} onChange={(horizonDays) => set({ horizonDays: Math.max(1, horizonDays) })} />
            <NumField id="minHoldMin" label="Minimum hold" unit="minutes" hint="No proposal to leave a sleeve opened more recently than this." value={rule.minHoldMin} onChange={(minHoldMin) => set({ minHoldMin })} />
            <NumField id="minCapacity" label="Minimum venue capacity" unit="USDC" hint="The venue must take your full size at the quoted rate." value={rule.minCapacity} onChange={(minCapacity) => set({ minCapacity })} />
            <NumField id="maxMove" label="Maximum move" unit="USDC" hint="Also capped by your spend policy; the lower limit wins." value={rule.maxMove} onChange={(maxMove) => set({ maxMove })} />
            <NumField id="maxReadAgeSec" label="Rate read no older than" unit="seconds" hint="Older reads leave the board with their reason." value={rule.maxReadAgeSec} onChange={(maxReadAgeSec) => set({ maxReadAgeSec })} />
          </div>

          <fieldset className="yf-fieldset">
            <legend className="yf-eyebrow">Stables it may route through</legend>
            <div className="yf-checkchips">
              {ASSETS.map((a) => (
                <label key={a}><input type="checkbox" checked={rule.assets.includes(a)} onChange={() => set({ assets: toggle(rule.assets, a) })} />{a}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="yf-fieldset">
            <legend className="yf-eyebrow">Chains</legend>
            <div className="yf-checkchips">
              {CHAINS.map((c) => (
                <label key={c}><input type="checkbox" checked={rule.chains.includes(c)} onChange={() => set({ chains: toggle(rule.chains, c) })} />{c}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="yf-fieldset">
            <legend className="yf-eyebrow">Sleeves</legend>
            <div className="yf-checkchips">
              {(['forge', 'rwa'] as SleeveKind[]).map((k) => (
                <label key={k}><input type="checkbox" checked={rule.sleeves.includes(k)} onChange={() => set({ sleeves: toggle(rule.sleeves, k) })} />{k === 'rwa' ? 'RWA' : 'Forge'}</label>
              ))}
              <label><input type="checkbox" checked={rule.includeUnverified} onChange={() => set({ includeUnverified: !rule.includeUnverified })} />Venues with unverified adapters</label>
            </div>
          </fieldset>
          <div className="yf-row">
            <button type="button" className="yf-btn yf-btn--secondary" onClick={() => setAppState((s) => ({ ...s, rule: defaultState().rule }))}>Reset to defaults</button>
            <span className="yf-fine">Saved in this browser as you type.</span>
          </div>
        </section>

        <aside className="yf-stack-6">
          <section className="yf-stack" aria-labelledby="pv-h">
            <h2 id="pv-h" className="yf-h2">The rule, as Signal reads it</h2>
            <pre className="yf-code">{`WHEN net(venue) − net(current) ≥ ${rule.edgeBp} bp
 AND net = gross − moveCost × 365 ÷ ${rule.horizonDays}
 AND capacity(venue) ≥ ${rule.minCapacity.toLocaleString('en-GB')} USDC
 AND held(current) ≥ ${rule.minHoldMin} min
 AND readAge(venue) ≤ ${rule.maxReadAgeSec} s
 AND chain ∈ {${rule.chains.join(', ')}}
THEN build unsigned move ≤ ${rule.maxMove.toLocaleString('en-GB')} USDC
 → check spend policy, every check
 → post to ${posted}
Signal never signs. You do.`}</pre>
          </section>

          <SampleRegion labelledBy="test-h">
            <h2 id="test-h" className="yf-h2">Tested against the board</h2>
            <ul className="yf-checks">
              {ranked.filter((v) => !v.isCurrent).map((v) => {
                const ok = (v.edgeBp ?? -Infinity) >= rule.edgeBp;
                return (
                  <li key={v.id} className="yf-check">
                    <span className={`yf-badge ${ok ? 'yf-badge--success' : ''}`}>{ok ? 'Propose' : 'Skip'}</span>
                    <div>
                      <p className="yf-check__name">{v.name} · {fmtBp(v.edgeBp)}</p>
                      <p className="yf-check__detail">{ok ? `Clears ${rule.edgeBp} bp after ${v.annualisedMovePct.toFixed(2)}% annualised move cost.` : `Below ${rule.edgeBp} bp.`}</p>
                    </div>
                  </li>
                );
              })}
              {notRanked.map((n) => (
                <li key={n.venue.id} className="yf-check">
                  <span className="yf-badge yf-badge--warning">Not read</span>
                  <div><p className="yf-check__name">{n.venue.name}</p><p className="yf-check__detail">{n.detail}</p></div>
                </li>
              ))}
            </ul>
          </SampleRegion>
        </aside>
      </div>
      <Disclaimer>A rule is a filter, not a forecast. It cannot know a rate will hold for the horizon you set.</Disclaimer>
    </>
  );
}
