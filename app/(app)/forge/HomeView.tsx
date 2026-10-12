'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { DataStatus, Disclaimer, SleeveBadge } from '@/components/ui';
import { shortAddress } from '@/lib/base58';
import { fmtBp, fmtPct } from '@/lib/rates';
import { fmtUsdc, useBalances } from '@/lib/solana';
import { useAppState } from '@/lib/store';
import { useBoard } from '@/lib/useBoard';

const TINTS = ['', 'yf-avatar--teal', 'yf-avatar--info', 'yf-avatar--amber'];

export function HomeView({ address }: { address: string }) {
  const { state: bal } = useBalances(address, 30_000);
  const { wallets, handle } = useAppState();
  const { ranked, best, rule } = useBoard();
  const maxGross = Math.max(...ranked.map((v) => v.grossPct), 1);
  const all = [{ address, label: 'Primary', proven: true }, ...wallets];

  return (
    <>
      <div className="yf-home">
        {/* ---------- balance ---------- */}
        <section aria-labelledby="bal-h">
          <div className="yf-sec-head">
            <h1 id="bal-h" className="yf-sec-title">In your wallet</h1>
            <span className="yf-sec-link">{bal.kind === 'ready' ? `≈ ${bal.sol.toFixed(4)} SOL for fees` : 'Solana · USDC'}</span>
          </div>
          {bal.kind === 'loading' && <div className="yf-skeleton" style={{ height: 96, width: '70%', borderRadius: 18 }} aria-label="Reading balance" />}
          {bal.kind === 'ready' && (() => {
            const f = fmtUsdc(bal.usdc);
            return (
              <>
                <p className="yf-bignum" aria-label={`${f.whole}.${f.cents} USDC`}>{f.whole}<small>.{f.cents} USDC</small></p>
                <div style={{ marginTop: 12 }}>
                  <DataStatus status={{ kind: 'live', at: bal.at }}><span>Read from Solana for {shortAddress(address)}. Held in your wallet, not by us.</span></DataStatus>
                </div>
              </>
            );
          })()}
          {bal.kind === 'error' && (
            <div className="yf-state yf-state--error" role="alert" style={{ padding: 20 }}>
              <span className="yf-badge yf-badge--danger">Read failed</span>
              <p className="yf-state__body">The Solana RPC did not return your balance: {bal.reason}. No figure is shown. Set NEXT_PUBLIC_SOLANA_RPC to a dedicated endpoint, then reload.</p>
            </div>
          )}

          <div className="yf-circles">
            {all.map((w, i) => (
              <Link key={w.address} href="/yid" className="yf-circle" title={w.address}>
                <span className={`yf-avatar ${TINTS[i % TINTS.length]}`}>{i === 0 && handle ? handle.slice(0, 2).toUpperCase() : w.address.slice(0, 2)}</span>
                {i === 0 ? 'Primary' : shortAddress(w.address)}
              </Link>
            ))}
            <Link href="/yid" className="yf-circle yf-circle--soft"><span className="yf-circle__btn">{Icon.plus(26)}</span>Add wallet</Link>
            <span className="yf-circles__divider" aria-hidden="true" />
            <Link href="/add-crypto" className="yf-circle"><span className="yf-circle__btn">{Icon.arrowDown(26)}</span>Add crypto</Link>
            <Link href="/stables" className="yf-circle"><span className="yf-circle__btn">{Icon.route(26)}</span>Route</Link>
            <Link href="/board" className="yf-circle yf-circle--accent"><span className="yf-circle__btn">{Icon.signal(26)}</span>Signal</Link>
          </div>
        </section>

        {/* ---------- gross vs net ---------- */}
        <section aria-labelledby="gn-h">
          <div className="yf-sec-head">
            <h2 id="gn-h" className="yf-sec-title">Gross vs net, {rule.horizonDays} d</h2>
            <Link href="/board" className="yf-sec-link">See board</Link>
          </div>
          <div className="yf-sample-region" style={{ padding: 16 }}>
            <DataStatus status={{ kind: 'sample', note: 'Round figures until live adapters connect.' }} />
            <div className="yf-netbars" role="list">
              {ranked.map((v) => (
                <div key={v.id} className="yf-netbar" role="listitem" aria-label={`${v.name}: gross ${fmtPct(v.grossPct)}, net ${fmtPct(v.netPct)}`}>
                  <span>{v.name}{v.isCurrent ? ' ·' : ''}</span>
                  <span className="yf-netbar__track" aria-hidden="true">
                    <span className="yf-netbar__gross" style={{ width: `${(v.grossPct / maxGross) * 100}%` }} />
                    <span className="yf-netbar__net" style={{ width: `${(Math.max(v.netPct, 0) / maxGross) * 100}%` }} />
                  </span>
                  <span className="yf-netbar__val">{fmtPct(v.netPct)}</span>
                </div>
              ))}
            </div>
            <ul className="yf-legend">
              <li><i style={{ background: 'var(--ink)' }} />Net, after move cost</li>
              <li><i style={{ background: 'color-mix(in srgb, var(--info) 45%, var(--surface))' }} />Gross</li>
            </ul>
          </div>
        </section>

        {/* ---------- sleeves ---------- */}
        <section aria-labelledby="sl-h">
          <div className="yf-sec-head">
            <h2 id="sl-h" className="yf-sec-title">Venues for your stables</h2>
            <Link href="/rules" className="yf-sec-link">Edit rule</Link>
          </div>
          <div className="yf-sample-region" style={{ padding: 12 }}>
            <DataStatus status={{ kind: 'sample' }} />
            <div className="yf-rows">
              <div className="yf-rowcard yf-rowcard--head" aria-hidden="true">
                <span>Sleeve</span><span>Venue</span><span className="num">Gross</span><span className="num">Move/yr</span><span className="num">Net</span><span className="num">Edge</span>
              </div>
              {ranked.slice(0, 5).map((v) => (
                <div key={v.id} className={`yf-rowcard${best?.id === v.id ? ' yf-rowcard--hot' : ''}`}>
                  <span><SleeveBadge kind={v.sleeve} /></span>
                  <span><b>{v.name}</b><br /><span className="yf-fine">{v.chain}{v.isCurrent ? ' · current' : best?.id === v.id ? ' · meets rule' : ''}</span></span>
                  <span className="num">{fmtPct(v.grossPct)}</span>
                  <span className="num">{fmtPct(v.annualisedMovePct)}</span>
                  <span className="num"><b>{fmtPct(v.netPct)}</b></span>
                  <span className="num">{fmtBp(v.edgeBp)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- next steps ---------- */}
        <section aria-labelledby="ns-h" className="yf-stack">
          <div className="yf-sec-head" style={{ marginBottom: 0 }}>
            <h2 id="ns-h" className="yf-sec-title">Next steps</h2>
          </div>
          {!handle ? (
            <Link href="/yid" className="yf-pastel yf-pastel--teal">
              <span className="yf-pastel__icon">{Icon.id(26)}</span>
              <span className="yf-pastel__body">Make your YieldID<small>Pick a handle, add your wallets, sign one record.</small></span>
              <span className="yf-pastel__go" aria-hidden="true">{Icon.arrowRight(22)}</span>
            </Link>
          ) : (
            <Link href="/yid" className="yf-pastel yf-pastel--teal">
              <span className="yf-pastel__icon">{Icon.check(26)}</span>
              <span className="yf-pastel__body">{handle} is verified<small>{all.length} wallet{all.length === 1 ? '' : 's'} under this name. Add more any time.</small></span>
              <span className="yf-pastel__go" aria-hidden="true">{Icon.arrowRight(22)}</span>
            </Link>
          )}
          {bal.kind === 'ready' && bal.usdc === 0 && (
            <Link href="/add-crypto" className="yf-pastel yf-pastel--info">
              <span className="yf-pastel__icon">{Icon.arrowDown(26)}</span>
              <span className="yf-pastel__body">Your wallet has no USDC yet<small>Three ways to add it, with the exact network to use.</small></span>
              <span className="yf-pastel__go" aria-hidden="true">{Icon.arrowRight(22)}</span>
            </Link>
          )}
          {best ? (
            <Link href={`/proposal?venue=${best.id}`} className="yf-pastel yf-pastel--ember">
              <span className="yf-pastel__icon">{Icon.bolt(26)}</span>
              <span className="yf-pastel__body">Signal: {best.name} is {fmtBp(best.edgeBp)} net<small>Sample data. Review every check before anything is signed.</small></span>
              <span className="yf-pastel__go" aria-hidden="true">{Icon.arrowRight(22)}</span>
            </Link>
          ) : (
            <div className="yf-pastel">
              <span className="yf-pastel__icon">{Icon.signal(26)}</span>
              <span className="yf-pastel__body">Nothing clears your {rule.edgeBp} bp rule<small>Signal will post when a venue does.</small></span>
            </div>
          )}
        </section>
      </div>
      <Disclaimer />
    </>
  );
}
