'use client';

import Link from 'next/link';
import { Disclaimer, MathStrip, PageHead, SampleRegion, SleeveBadge } from '@/components/ui';
import { fmtBp, fmtPct } from '@/lib/rates';
import { setAppState } from '@/lib/store';
import { useBoard } from '@/lib/useBoard';

const REASON: Record<string, { label: string; cls: string }> = {
  stale: { label: 'Stale', cls: 'yf-badge--warning' },
  read_failed: { label: 'Read failed', cls: 'yf-badge--danger' },
  capacity: { label: 'Filtered', cls: '' },
  unverified: { label: 'Unverified', cls: 'yf-badge--unverified' },
};

export default function BoardPage() {
  const { ranked, notRanked, rule, best, currentNetPct } = useBoard();
  const worked = best ?? ranked.find((v) => !v.isCurrent) ?? null;
  const byGross = [...ranked].sort((a, b) => b.grossPct - a.grossPct)[0];
  const grossRank = byGross ? ranked.findIndex((v) => v.id === byGross.id) + 1 : 0;

  return (
    <>
      <PageHead
        eyebrow="Signal"
        title="Signal board"
        lede="Venues ranked by net rate over your horizon. Gross is what a venue pays per year. The move is paid once, so it is spread over the horizon and subtracted. A venue paying more gross is often worse net."
      />

      <div className="yf-row">
        <div className="yf-field" style={{ minWidth: 180 }}>
          <label htmlFor="horizon">Horizon</label>
          <div className="yf-inputwrap">
            <select id="horizon" className="yf-select" value={rule.horizonDays} onChange={(e) => setAppState((s) => ({ ...s, rule: { ...s.rule, horizonDays: Number(e.target.value) } }))}>
              {[7, 14, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
        </div>
        <span className="yf-pill">Current sleeve <b>Venue C</b></span>
        <span className="yf-pill">Rule <b>edge ≥ {rule.edgeBp} bp</b></span>
        <Link className="yf-btn yf-btn--text" href="/rules">Edit rule</Link>
      </div>

      <p className="yf-formula">net = gross − (moveCost × 365 ÷ horizonDays) · edge = net − net(current)</p>

      <SampleRegion labelledBy="board-h" note={`Round figures for layout. A live board shows LIVE with a timestamp and drops any venue whose read is older than ${rule.maxReadAgeSec} s.`}>
        {worked && currentNetPct !== null && (
          <>
            <h2 id="board-h" className="yf-h2">Worked row: {worked.name}</h2>
            <MathStrip
              gross={worked.grossPct}
              annualisedMove={worked.annualisedMovePct}
              net={worked.netPct}
              edgeBp={worked.edgeBp}
              labels={[
                'Gross',
                `Move cost ${worked.moveCostPct.toFixed(2)}% × 365 ÷ ${rule.horizonDays}`,
                `Net = ${worked.grossPct.toFixed(2)} − ${worked.annualisedMovePct.toFixed(2)}`,
                `Edge = ${worked.netPct.toFixed(2)} − ${currentNetPct.toFixed(2)}`,
              ]}
            />
          </>
        )}

        <div className="yf-table-wrap yf-board-table">
          <table className="yf-table">
            <caption className="yf-visually-hidden">Venues ranked by net rate</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Venue</th>
                <th scope="col">Sleeve</th>
                <th scope="col">Chain</th>
                <th scope="col" className="yf-cell-num">Gross</th>
                <th scope="col" className="yf-cell-num">Move cost, once</th>
                <th scope="col" className="yf-cell-num">Move cost, annualised</th>
                <th scope="col" className="yf-cell-num" aria-sort="descending">Net ↓</th>
                <th scope="col" className="yf-cell-num">Edge</th>
                <th scope="col" className="yf-cell-num">Capacity</th>
                <th scope="col">Rule</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((v, i) => (
                <tr key={v.id} className={v.isCurrent ? 'yf-row--current' : undefined}>
                  <td className="yf-rank">{i + 1}</td>
                  <th scope="row">{v.name}<br /><span className="yf-fine">{v.product}{v.isCurrent ? ' · current sleeve' : ''}</span></th>
                  <td><SleeveBadge kind={v.sleeve} /></td>
                  <td>{v.chain}</td>
                  <td className="yf-cell-num">{fmtPct(v.grossPct)}</td>
                  <td className="yf-cell-num">{fmtPct(v.moveCostPct)}</td>
                  <td className="yf-cell-num">{fmtPct(v.annualisedMovePct)}</td>
                  <td className="yf-cell-num">{fmtPct(v.netPct)}</td>
                  <td className="yf-cell-num">{fmtBp(v.edgeBp)}</td>
                  <td className="yf-cell-num">{v.capacity?.toLocaleString('en-GB')}</td>
                  <td>
                    {v.isCurrent ? <span className="yf-badge yf-badge--info">Current</span>
                      : (v.edgeBp ?? -Infinity) >= rule.edgeBp ? <span className="yf-badge yf-badge--success">Meets rule</span>
                      : (v.edgeBp ?? 0) < 0 ? <span className="yf-badge">Worse than current</span>
                      : <span className="yf-badge">Below {rule.edgeBp} bp</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="yf-board-cards">
          {ranked.map((v, i) => (
            <article key={v.id} className="yf-venue">
              <div className="yf-head"><b>{i + 1} · {v.name}{v.isCurrent ? ' (current)' : ''}</b><SleeveBadge kind={v.sleeve} /></div>
              <dl className="yf-venue__rows">
                <dt>Gross</dt><dd>{fmtPct(v.grossPct)}</dd>
                <dt>Move cost, annualised</dt><dd>{fmtPct(v.annualisedMovePct)}</dd>
                <dt>Net</dt><dd>{fmtPct(v.netPct)}</dd>
                <dt>Edge</dt><dd>{fmtBp(v.edgeBp)}</dd>
              </dl>
            </article>
          ))}
        </div>

        {byGross && grossRank > 1 && (
          <p className="yf-fine">
            Sorted by net. Sorted by gross, {byGross.name} would come first; over {rule.horizonDays} days its {byGross.moveCostPct.toFixed(2)}% move cost makes it number {grossRank}.
          </p>
        )}
      </SampleRegion>

      <SampleRegion labelledBy="off-h" note="Same sample set. With live adapters a venue appears here when its read is stale, failed or unverified.">
        <h2 id="off-h" className="yf-h2">Not ranked</h2>
        {notRanked.length === 0 ? (
          <p className="yf-small">Every venue read cleanly and is ranked above.</p>
        ) : (
          <ul className="yf-offboard">
            {notRanked.map((n) => (
              <li key={n.venue.id}>
                <span><b>{n.venue.name}</b> · {n.venue.chain}</span>
                <span><span className={`yf-badge ${REASON[n.reason].cls}`}>{REASON[n.reason].label}</span> {n.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </SampleRegion>

      <div className="yf-row">
        {best ? (
          <Link className="yf-btn yf-btn--primary" href={`/proposal?venue=${best.id}`}>Build proposal for {best.name}</Link>
        ) : (
          <p className="yf-small">No venue clears your {rule.edgeBp} bp rule right now. Signal will post when one does.</p>
        )}
      </div>

      <p className="yf-fine">Rates float and past rates say nothing about the next {rule.horizonDays} days. A move cost read now can change before you sign; the proposal re-simulates it.</p>
      <Disclaimer />
    </>
  );
}
