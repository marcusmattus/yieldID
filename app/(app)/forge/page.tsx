'use client';

import Link from 'next/link';
import { Disclaimer, MathStrip, PageHead, SampleRegion } from '@/components/ui';
import { fmtBp } from '@/lib/rates';
import { useAppState } from '@/lib/store';
import { useBoard } from '@/lib/useBoard';

const SLEEVES = [
  { kind: 'forge', label: 'Forge', name: 'USDC lending · Venue C', at: '40,000 USDC', chain: 'Solana', gross: '5.00%', net: '5.00%', held: 'Venue C program', risk: 'lending rate floats; withdrawals depend on pool liquidity.' },
  { kind: 'rwa', label: 'RWA', name: 'T-bill vault · Venue E', at: '30,000 USDC', chain: 'Solana', gross: '5.00%', net: '5.00%', held: 'Issuer custodian, [jurisdiction]', risk: 'issuer can freeze; redemptions settle in [n] business days.' },
  { kind: 'forge', label: 'Forge', name: 'yUSD on Base · Venue J', at: '20,000 yUSD', chain: 'Base', gross: '5.00%', net: '5.00%', held: 'Venue J contract', risk: 'yUSD redemption depends on the yUSD vault and the bridge back.' },
] as const;

export default function ForgePage() {
  const { best, rule } = useBoard();
  const { policy, handle, channels } = useAppState();
  const chans = [channels.telegram && 'Telegram', channels.discord && 'Discord', channels.slack && 'Slack'].filter(Boolean).join(', ') || 'None connected';

  return (
    <>
      <PageHead
        eyebrow={handle ? `Your forge · ${handle}` : 'Your forge'}
        title="Capital across sleeves"
        lede="A sleeve is one pot of stables at one named venue. Signal watches every sleeve and proposes a switch only when the net edge clears your rule. You sign every move."
        actions={<><Link className="yf-btn yf-btn--secondary" href="/stables">Route a stable</Link><Link className="yf-btn yf-btn--primary" href="/board">Open a sleeve</Link></>}
      />

      <SampleRegion labelledBy="cap-h" note="Round figures for layout. Positions will be read from each venue once live adapters are connected.">
        <div className="yf-head">
          <h2 id="cap-h" className="yf-h2">100,000 USDC equivalent across 4 places</h2>
          <span className="yf-fine">Held at venues and in your wallets. YieldForge holds none of it.</span>
        </div>
        <div className="yf-bar" role="img" aria-label="Forge sleeves 40 percent, RWA sleeves 30 percent, y-stables 20 percent, in wallet 10 percent">
          <span className="yf-bar__seg--forge" style={{ width: '40%' }} />
          <span className="yf-bar__seg--rwa" style={{ width: '30%' }} />
          <span style={{ width: '20%', background: 'var(--info)' }} />
          <span className="yf-bar__seg--idle" style={{ width: '10%' }} />
        </div>
        <ul className="yf-legend">
          <li><i style={{ background: 'var(--ember)' }} />Forge sleeves · 40,000 USDC</li>
          <li><i style={{ background: 'var(--teal)' }} />RWA sleeves · 30,000 USDC</li>
          <li><i style={{ background: 'var(--info)' }} />y-stables · 20,000 USDC equivalent</li>
          <li><i style={{ background: 'var(--border-strong)' }} />In wallet, idle · 10,000 USDC</li>
        </ul>
        <div className="yf-grid-3">
          {SLEEVES.map((s) => (
            <article key={s.name} className={`yf-sleeve yf-sleeve--${s.kind}`}>
              <span className="yf-sleeve__kind">{s.label}</span>
              <h3 className="yf-sleeve__name">{s.name}</h3>
              <dl className="yf-sleeve__meta">
                <dt>At venue</dt><dd>{s.at}</dd>
                <dt>Chain</dt><dd>{s.chain}</dd>
                <dt>Gross</dt><dd>{s.gross}</dd>
                <dt>Move cost, annualised</dt><dd>0.00% · already here</dd>
                <dt>Net</dt><dd>{s.net}</dd>
                <dt>Held by</dt><dd>{s.held}</dd>
              </dl>
              <p className="yf-sleeve__risk"><strong>Risk:</strong> {s.risk}</p>
            </article>
          ))}
        </div>
      </SampleRegion>

      <div className="yf-split">
        <SampleRegion labelledBy="sig-h">
          {best ? (
            <>
              <h2 id="sig-h" className="yf-h2">Signal has a proposal</h2>
              <p className="yf-small">
                {best.name} clears your {rule.edgeBp} bp rule: the move costs {best.moveCostPct.toFixed(2)}% once, {best.annualisedMovePct.toFixed(2)}% a year over {rule.horizonDays} days. Net edge {fmtBp(best.edgeBp)}.
              </p>
              <MathStrip gross={best.grossPct} annualisedMove={best.annualisedMovePct} net={best.netPct} edgeBp={best.edgeBp} />
              <div className="yf-row">
                <Link className="yf-btn yf-btn--primary" href={`/proposal?venue=${best.id}`}>Review proposal</Link>
                <Link className="yf-btn yf-btn--secondary" href="/board">See the board</Link>
              </div>
            </>
          ) : (
            <>
              <h2 id="sig-h" className="yf-h2">No proposal</h2>
              <p className="yf-small">No venue clears your {rule.edgeBp} bp rule over {rule.horizonDays} days.</p>
            </>
          )}
        </SampleRegion>

        <section className="yf-card yf-stack" aria-labelledby="watch-h">
          <h2 id="watch-h" className="yf-h2">What YieldID is watching</h2>
          <dl className="yf-kv">
            <dt>Chains</dt><dd>{rule.chains.join(', ')}</dd>
            <dt>Stables</dt><dd>{rule.assets.join(', ')}</dd>
            <dt>Rule</dt><dd>Edge ≥ {rule.edgeBp} bp · {rule.horizonDays} d horizon</dd>
            <dt>Policy</dt><dd>Per tx {policy.perTxCap.toLocaleString('en-GB')} · daily {policy.dailyCap.toLocaleString('en-GB')}</dd>
            <dt>Channels</dt><dd>{chans}</dd>
            <dt>Kill switch</dt><dd>{policy.killSwitch ? 'Engaged' : 'Off'}</dd>
          </dl>
          <p className="yf-fine">Rates are read live or not shown. A failed read removes the venue from ranking until it reads again.</p>
        </section>
      </div>
      <Disclaimer />
    </>
  );
}
