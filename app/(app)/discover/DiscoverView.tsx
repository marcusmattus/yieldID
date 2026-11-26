'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DataStatus, Disclaimer, PageHead, SleeveBadge } from '@/components/ui';
import type { LiveVenue } from '@/lib/defi/pools';
import { FLAG_LABEL, MOVE_COST_MODEL, venueFlags } from '@/lib/defi/pools';
import { rankLive } from '@/lib/defi/rank';
import { fmtPct, type Chain } from '@/lib/rates';
import { useAppState } from '@/lib/store';
import type { PaidService } from '@/lib/x402/bazaar';

type Read<T> = { ok: true; data: T; readAt: number; stale: boolean } | { ok: false; error: string };

interface Props {
  venues: Read<LiveVenue[]>;
  services: Read<PaidService[]>;
  paid: { priceUsd: string; networks: Array<{ label: string; testnet: boolean }>; problem: string | null; endpoint: string; free: string };
}

const CHAINS: Chain[] = ['Solana', 'Base', 'Arbitrum', 'Ethereum', 'Hyperliquid'];
const usd = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const price = (n: number) => (n < 0.01 ? `$${n.toFixed(4).replace(/0+$/, '')}` : `$${n.toFixed(2)}`);

function ago(iso: string | null, now: number) {
  if (!iso) return '—';
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function DiscoverView({ venues, services, paid }: Props) {
  const { rule } = useAppState();
  const [horizon, setHorizon] = useState(rule.horizonDays);
  const [chains, setChains] = useState<Chain[]>(['Solana', 'Base']);
  const [asset, setAsset] = useState('USDC');
  const [showAll, setShowAll] = useState(false);
  const [now] = useState(() => Date.now());

  const ranked = useMemo(
    () => (venues.ok ? rankLive(venues.data, { horizonDays: horizon, chains, assets: asset === 'any' ? undefined : [asset], minTvlUsd: rule.minCapacity, now }) : null),
    [venues, horizon, chains, asset, rule.minCapacity, now],
  );
  const rows = ranked ? (showAll ? ranked.rows : ranked.rows.slice(0, 15)) : [];
  const byGross = ranked && ranked.rows.length > 1 ? [...ranked.rows].sort((a, b) => b.grossPct - a.grossPct)[0] : null;
  const toggle = (c: Chain) => setChains((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <>
      <PageHead
        eyebrow="Discover"
        title="Where stablecoins earn, and where agents spend them"
        actions={<Link className="yf-btn yf-btn--text" href="/id">Look up a YieldID</Link>}
        lede="Two live indexes in one place. Stable venues ranked net of the cost to move, read from DefiLlama. Paid x402 services that agents call per request in USDC, read from the x402 Bazaar. Agents can query both; the full feed is itself paid over x402."
      />

      <section className="yf-panel" aria-labelledby="yields-h">
        <div className="yf-head">
          <h2 id="yields-h" className="yf-h2">Stable venues, ranked net</h2>
          {venues.ok && <DataStatus status={{ kind: 'live', at: venues.readAt }}><span>DefiLlama yields{venues.stale ? ' · last refresh failed, showing the previous read' : ''}</span></DataStatus>}
        </div>

        <div className="yf-row" style={{ alignItems: 'flex-end' }}>
          <div className="yf-field" style={{ minWidth: 150 }}>
            <label htmlFor="d-horizon">Horizon</label>
            <div className="yf-inputwrap">
              <select id="d-horizon" className="yf-select" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                {[7, 14, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          </div>
          <div className="yf-field" style={{ minWidth: 130 }}>
            <label htmlFor="d-asset">Asset</label>
            <div className="yf-inputwrap">
              <select id="d-asset" className="yf-select" value={asset} onChange={(e) => setAsset(e.target.value)}>
                {['USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'USDG', 'any'].map((a) => <option key={a} value={a}>{a === 'any' ? 'Any stable' : a}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="yf-row" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="yf-visually-hidden">Chains</legend>
            {CHAINS.map((c) => (
              <label key={c} className="yf-pill" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={chains.includes(c)} onChange={() => toggle(c)} /> {c}
              </label>
            ))}
          </fieldset>
        </div>

        <p className="yf-formula">net = base APY − (estimated move cost × 365 ÷ {horizon})</p>

        {!venues.ok && <p className="yf-error-text" role="alert">Live rates could not be read: {venues.error}. Nothing is shown rather than an old or invented rate.</p>}

        {ranked && ranked.rows.length === 0 && <p className="yf-small">No venue matches these filters and your {usd.format(rule.minCapacity)} TVL floor.</p>}

        {ranked && ranked.rows.length > 0 && (
          <>
            <div className="yf-table-wrap yf-board-table yf-discover-table">
              <table className="yf-table">
                <caption className="yf-visually-hidden">Live stable venues ranked by net rate</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Venue</th>
                    <th scope="col">Chain</th>
                    <th scope="col" className="yf-cell-num">Base APY</th>
                    <th scope="col" className="yf-cell-num">Move cost, est. per year</th>
                    <th scope="col" className="yf-cell-num" aria-sort="descending">Net ↓</th>
                    <th scope="col" className="yf-cell-num">TVL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="yf-rank">{r.rank}</td>
                      <th scope="row">
                        <a href={r.url} target="_blank" rel="noreferrer">{r.venue}</a>
                        <br /><span className="yf-fine">
                          {r.product}{r.mean30dPct !== null ? ` · 30-day average ${fmtPct(r.mean30dPct)}` : ''}
                          {r.rewardPct !== null && r.rewardPct >= 0.01 ? ` · +${fmtPct(r.rewardPct)} in reward tokens, not counted` : ''}
                        </span>
                        {venueFlags({ grossPct: r.grossPct, product: r.product, sleeve: r.sleeve as 'forge' | 'rwa' }).filter((f) => f !== 'rwa').map((f) => (
                          <span key={f} className="yf-badge yf-badge--warning" style={{ display: 'inline-block', marginTop: 6, marginRight: 6, whiteSpace: 'normal' }}>{FLAG_LABEL[f]}</span>
                        ))}
                      </th>
                      <td>{r.chain}<br /><SleeveBadge kind={r.sleeve as 'forge' | 'rwa'} /></td>
                      <td className="yf-cell-num">{fmtPct(r.grossPct)}</td>
                      <td className="yf-cell-num">−{fmtPct(r.annualisedMovePct)}<br /><span className="yf-fine">{fmtPct(r.moveCostPct)} once</span></td>
                      <td className="yf-cell-num"><b>{fmtPct(r.netPct)}</b></td>
                      <td className="yf-cell-num">{usd.format(r.tvlUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="yf-board-cards">
              {rows.map((r) => (
                <article key={r.id} className="yf-venue">
                  <div className="yf-head"><b>{r.rank} · {r.venue}</b><span className="yf-fine">{r.chain}</span></div>
                  <p className="yf-fine" style={{ margin: 0 }}>{r.product}</p>
                  <dl className="yf-venue__rows">
                    <dt>Base APY</dt><dd>{fmtPct(r.grossPct)}</dd>
                    <dt>Move, annualised</dt><dd>{fmtPct(r.annualisedMovePct)}</dd>
                    <dt>Net</dt><dd>{fmtPct(r.netPct)}</dd>
                    <dt>TVL</dt><dd>{usd.format(r.tvlUsd)}</dd>
                  </dl>
                </article>
              ))}
            </div>
            <div className="yf-row">
              {ranked.rows.length > 15 && (
                <button type="button" className="yf-btn yf-btn--text" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? 'Show top 15' : `Show all ${ranked.rows.length}`}
                </button>
              )}
              {byGross && byGross.rank > 1 && (
                <p className="yf-fine" style={{ margin: 0 }}>
                  Highest base APY is {byGross.venue} ({fmtPct(byGross.grossPct)}, {byGross.chain}); net over {horizon} days it ranks {byGross.rank}.
                </p>
              )}
            </div>
          </>
        )}

        <details className="yf-fine">
          <summary>How these numbers are made</summary>
          <ul>
            <li>Rows are plain stablecoin deposits only: single asset, no impermanent loss, at least {usd.format(1_000_000)} TVL, on a chain YieldID routes to. Your rule&apos;s floor of {usd.format(rule.minCapacity)} also applies.</li>
            <li>Gross is the pool&apos;s base APY. Token rewards move with the reward token&apos;s price, so they are shown but never counted in net.</li>
            <li>Move cost is an estimate for a round trip from USDC on Solana: {CHAINS.map((c) => `${c} ${MOVE_COST_MODEL[c]}%`).join(', ')}. The proposal screen re-simulates the real cost before you sign.</li>
            <li>DefiLlama refreshes about hourly; YieldID re-reads every 5 minutes and stops ranking any read older than 2 hours.</li>
          </ul>
        </details>
      </section>

      <section className="yf-panel" aria-labelledby="svc-h">
        <div className="yf-head">
          <h2 id="svc-h" className="yf-h2">Paid x402 services agents use</h2>
          {services.ok && <DataStatus status={{ kind: 'live', at: services.readAt }}><span>x402 Bazaar · listed by operators, not vetted by YieldID</span></DataStatus>}
        </div>
        <p className="yf-small">
          Each of these HTTP endpoints answers <b>402 Payment Required</b> with a price in USDC. An agent pays per call from its own wallet and the payment goes straight to the operator. Ranked by distinct payers over the last 30 days.
        </p>
        {!services.ok && <p className="yf-error-text" role="alert">The x402 Bazaar could not be read: {services.error}.</p>}
        {services.ok && (
          <div className="yf-table-wrap">
            <table className="yf-table">
              <caption className="yf-visually-hidden">x402 services by distinct payers</caption>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col" className="yf-cell-num">Price per call</th>
                  <th scope="col">Paid on</th>
                  <th scope="col" className="yf-cell-num">Payers, 30 d</th>
                  <th scope="col" className="yf-cell-num">Calls, 30 d</th>
                  <th scope="col">Last call</th>
                </tr>
              </thead>
              <tbody>
                {services.data.slice(0, 20).map((s) => (
                  <tr key={s.url}>
                    <th scope="row" style={{ maxWidth: 420 }}>
                      <span className="yf-mono" style={{ overflowWrap: 'anywhere' }}>{s.method} {s.host}{new URL(s.url).pathname}</span>
                      <br /><span className="yf-fine">{s.description}</span>
                    </th>
                    <td className="yf-cell-num">{price(s.priceUsd)} {s.stable}</td>
                    <td>{s.networks.join(', ')}</td>
                    <td className="yf-cell-num">{s.payers30d.toLocaleString('en-GB')}</td>
                    <td className="yf-cell-num">{s.calls30d.toLocaleString('en-GB')}</td>
                    <td>{ago(s.lastCalledAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="yf-panel" aria-labelledby="agents-h">
        <h2 id="agents-h" className="yf-h2">For agents: query YieldID over x402</h2>
        <p className="yf-small">
          The summary is free. The full ranked feed, with every venue and the reasons any were left out, costs{' '}
          <b>{paid.problem ? '—' : `$${paid.priceUsd} USDC`}</b> per call{paid.networks.length ? ` on ${paid.networks.map((n) => n.label).join(' or ')}` : ''}.
          A call that fails on YieldID&apos;s side is not settled, so the agent is not charged.
        </p>
        {paid.problem && <p className="yf-warn" role="note">The paid feed is off on this deployment: {paid.problem}</p>}
        {paid.networks.some((n) => n.testnet) && !paid.problem && <p className="yf-fine">This deployment takes test USDC on testnets. No real money moves.</p>}
        <pre className="yf-code">{`# Free summary
curl "${paid.free}?horizon=30&chain=Solana,Base&asset=USDC"

# Paid feed: the first call answers 402 with the price in a PAYMENT-REQUIRED header
curl -i "${paid.endpoint}?horizon=30&chain=Solana&asset=USDC&limit=50"`}</pre>
        <pre className="yf-code">{`// An agent with a Solana key pays and retries automatically
import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client } from '@x402/core/client';
import { registerExactSvmScheme } from '@x402/svm/exact/client';

const client = new x402Client();
registerExactSvmScheme(client, { signer: agentKeypairSigner });
const pay = wrapFetchWithPayment(fetch, client);
const res = await pay('${paid.endpoint}?horizon=30&asset=USDC');
const { ranked } = await res.json();`}</pre>
        <ol className="yf-howto">
          <li><b>Fund.</b> Buy USDC with Ramp on <Link href="/add-crypto">Add crypto</Link>; it lands in your own wallet.</li>
          <li><b>Earn.</b> Run your own x402 endpoint. Agents pay it per call in USDC, straight to your wallet.</li>
          <li><b>Discover.</b> Agents find services in the Bazaar above, and the best net yield here.</li>
          <li><b>Park.</b> Idle USDC goes where it earns most net; you sign every move on the <Link href="/board">Signal board</Link>.</li>
        </ol>
      </section>

      <Disclaimer>Rates are variable and can fall to zero. Venues, bridges, x402 services and stablecoin issuers can fail or freeze funds. Listing here is not an endorsement. Nothing here is financial advice.</Disclaimer>
    </>
  );
}
