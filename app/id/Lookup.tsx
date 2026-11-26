import Link from 'next/link';
import { Brand, DataStatus, Disclaimer } from '@/components/ui';
import { shortAddress } from '@/lib/base58';
import { FLAG_LABEL } from '@/lib/defi/pools';
import { fmtPct } from '@/lib/rates';
import type { OptimiseReport } from '@/lib/server/optimise';

const usd = (n: number) => n.toLocaleString('en-GB', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 100 ? 2 : 0 });
const amt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });

type Plan = Extract<OptimiseReport, { ok: true }>['plans'][number];

/** Top options, then the best plain and best same-chain ones if they were not already listed. */
function rowsFor(p: Plan) {
  const rows: Array<{ o: Plan['options'][number]; why: string | null }> = p.options.map((o) => ({ o, why: o === p.bestPlain ? 'best without a flag' : null }));
  if (p.bestPlain && !p.options.includes(p.bestPlain)) rows.push({ o: p.bestPlain, why: 'best without a flag' });
  if (p.bestSameChain && !rows.some((r) => r.o === p.bestSameChain)) rows.push({ o: p.bestSameChain, why: `best without leaving ${p.chain}` });
  return rows;
}

export function LookupShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="yf-landbg">
      <div className="yf-land" style={{ gap: 32 }}>
        <header className="yf-land__nav">
          <Link href="/" aria-label="YieldID home" style={{ textDecoration: 'none' }}><Brand /></Link>
          <nav aria-label="Sections"><Link href="/id">Look up a YieldID</Link></nav>
          <Link href="/connect" className="yf-pillbtn yf-pillbtn--dark">Connect wallet</Link>
        </header>
        {children}
      </div>
    </div>
  );
}

export function LookupForm({ q = '', horizon = 30 }: { q?: string; horizon?: number }) {
  return (
    <form action="/id" method="get" className="yf-panel yf-stack" role="search" aria-label="Look up a YieldID">
      <label htmlFor="q" className="yf-h2">Look up a YieldID</label>
      <p className="yf-small" style={{ margin: 0 }}>Type a YieldID name or paste a wallet address. You get the stablecoins sitting idle in its wallets and where each would earn most, after the cost to move. Read-only: nothing is signed or moved.</p>
      <div className="yf-row" style={{ alignItems: 'stretch' }}>
        <div className="yf-inputwrap" style={{ flex: '1 1 280px' }}>
          <input id="q" name="q" className="yf-input" defaultValue={q} placeholder="marcus, marcus@yourdomain, or a Solana / 0x address" autoComplete="off" spellCheck={false} required />
        </div>
        <div className="yf-inputwrap">
          <select name="horizon" className="yf-select" defaultValue={horizon} aria-label="Horizon">
            {[7, 14, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
        <button type="submit" className="yf-pillbtn yf-pillbtn--ember">Find yield</button>
      </div>
    </form>
  );
}

export function LookupReport({ report }: { report: OptimiseReport }) {
  if (!report.ok) {
    return (
      <section className="yf-panel" role="status">
        <h2 className="yf-h2">Nothing to show</h2>
        <p className="yf-small">{report.message}</p>
        <p className="yf-fine">Anyone can publish a YieldID: <Link href="/connect">connect a wallet</Link> and use the YieldID maker.</p>
      </section>
    );
  }
  const { plans, totals, wallets } = report;
  return (
    <>
      <section className="yf-panel" aria-labelledby="who-h">
        <div className="yf-head">
          <h1 id="who-h" className="yf-h1" style={{ margin: 0, overflowWrap: 'anywhere' }}>{report.name ?? shortAddress(report.query)}</h1>
          {report.verified
            ? <span className="yf-badge yf-badge--success">Signed record, verified in DNS</span>
            : <span className="yf-badge">Single address, no YieldID</span>}
        </div>
        <ul className="yf-offboard" aria-label="Wallets">
          {wallets.map((w) => (
            <li key={`${w.chain}:${w.address}`}>
              <span><b>{w.chain}</b> · <span className="yf-mono" title={w.address}>{shortAddress(w.address)}</span> · {w.role}</span>
              <span>
                {w.role === 'linked' && !w.proven ? <span className="yf-badge yf-badge--warning">Link not proven, not counted</span>
                  : w.read === 'ok' ? <span className="yf-badge yf-badge--live">Read</span>
                  : w.read === 'failed' ? <span className="yf-badge yf-badge--danger">Read failed: {w.error}</span>
                  : <span className="yf-badge">Not read{w.chain === 'Hyperliquid' ? ' (Hyperliquid balances not supported yet)' : ''}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="yf-panel" aria-labelledby="sum-h">
        <h2 id="sum-h" className="yf-sec-title">Idle stablecoins and what they could earn</h2>
        <div className="yf-row" style={{ gap: 32 }}>
          <div><p className="yf-bignum" style={{ fontSize: 'clamp(36px,5vw,56px)', margin: 0 }}>{usd(totals.idleUsd)}</p><p className="yf-small">idle in these wallets, earning nothing</p></div>
          <div><p className="yf-bignum" style={{ fontSize: 'clamp(36px,5vw,56px)', margin: 0 }}>{usd(totals.potentialAnnualUsd)}<small>/yr</small></p><p className="yf-small">at today&apos;s best net rate without a high-rate or lock-up flag{totals.blendedNetPct !== null ? ` (${fmtPct(totals.blendedNetPct)} blended)` : ''}</p></div>
        </div>
        <DataStatus status={{ kind: 'live', at: Date.parse(report.balancesReadAt) }}>
          <span>Balances from chain{report.ratesReadAt ? `; rates from DefiLlama as of ${new Date(report.ratesReadAt).toLocaleTimeString('en-GB')}` : ''}</span>
        </DataStatus>
        {report.ratesError && <p className="yf-error-text">Live rates could not be read: {report.ratesError}. No venue is suggested rather than an old rate.</p>}
      </section>

      {plans.length === 0 && (
        <section className="yf-panel"><p className="yf-small">No idle USDC, USDT or PYUSD found in these wallets. Funds already deposited in protocols are not read yet.</p></section>
      )}

      {plans.map((p) => (
        <section key={`${p.chain}:${p.address}:${p.asset}`} className="yf-panel" aria-label={`${p.asset} on ${p.chain}`}>
          <div className="yf-head">
            <h2 className="yf-h2" style={{ margin: 0 }}>{amt(p.amount)} {p.asset} on {p.chain}</h2>
            <span className="yf-fine yf-mono">{shortAddress(p.address)}</span>
          </div>
          {p.options.length === 0 ? (
            <p className="yf-small">No live venue for {p.asset} clears the filters right now.</p>
          ) : (
            <div className="yf-table-wrap yf-discover-table">
              <table className="yf-table">
                <caption className="yf-visually-hidden">Best venues for {p.asset} on {p.chain}, by net</caption>
                <thead>
                  <tr>
                    <th scope="col">Venue</th><th scope="col">Chain</th>
                    <th scope="col" className="yf-cell-num">Base APY</th><th scope="col" className="yf-cell-num">Move, est.</th>
                    <th scope="col" className="yf-cell-num">Net</th><th scope="col" className="yf-cell-num">≈ per year</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFor(p).map(({ o, why }, i) => (
                    <tr key={`${o.venue}:${o.product}:${i}`}>
                      <th scope="row"><a href={o.url} target="_blank" rel="noreferrer">{o.venue}</a><br /><span className="yf-fine">{o.product}{why ? ` · ${why}` : ''}</span>
                        {o.flags.length > 0 && <div>{o.flags.map((f) => <span key={f} className="yf-badge yf-badge--warning" style={{ display: 'inline-block', marginTop: 6, marginRight: 6, whiteSpace: 'normal' }}>{FLAG_LABEL[f]}</span>)}</div>}</th>
                      <td>{o.chain}{o.chain !== p.chain ? <><br /><span className="yf-fine">bridge from {p.chain}</span></> : null}</td>
                      <td className="yf-cell-num">{fmtPct(o.grossPct)}</td>
                      <td className="yf-cell-num">{fmtPct(o.moveCostPct)} once</td>
                      <td className="yf-cell-num"><b>{fmtPct(o.netPct)}</b></td>
                      <td className="yf-cell-num">{usd(o.annualUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <section className="yf-panel yf-stack">
        <p className="yf-small" style={{ margin: 0 }}>Is this your name? Connect the wallet to set a rule, and Signal proposes each move for you to sign. YieldID never holds the funds.</p>
        <div className="yf-row"><Link href="/connect" className="yf-pillbtn yf-pillbtn--ember">Connect wallet</Link><Link href="/connect" className="yf-btn yf-btn--text">Make your own YieldID</Link></div>
        <ul className="yf-fine" style={{ margin: 0 }}>{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <p className="yf-fine" style={{ margin: 0 }}>Same data as JSON: <code>/api/yid/optimise?q={encodeURIComponent(report.query)}&amp;horizon={report.horizonDays}</code></p>
      </section>
      <Disclaimer>Rates are variable and can fall to zero. Venues, bridges and stablecoin issuers can fail or freeze funds. Nothing here is financial advice.</Disclaimer>
    </>
  );
}
