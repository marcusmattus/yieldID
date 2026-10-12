'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Checks, Disclaimer, MathStrip, PageHead, SampleRegion } from '@/components/ui';
import { runChecks, verdict } from '@/lib/policy';
import { SAMPLE_MOVED_TODAY, SAMPLE_SIZE } from '@/lib/sample';
import { useAppState } from '@/lib/store';
import { useBoard } from '@/lib/useBoard';

function Proposal() {
  const params = useSearchParams();
  const { ranked, now, rule, best } = useBoard();
  const { policy } = useAppState();
  const venue = ranked.find((v) => v.id === params.get('venue')) ?? best;
  const [size, setSize] = useState(SAMPLE_SIZE);

  if (!venue) {
    return (
      <div className="yf-state">
        <h1 className="yf-state__title">No proposal open</h1>
        <p className="yf-state__body">No venue clears your rule right now, or the venue in the link is no longer ranked. Open the board to see why.</p>
        <Link className="yf-btn yf-btn--primary" href="/board">Open the board</Link>
      </div>
    );
  }

  // No venue has a live adapter yet, so nothing can be simulated. The slippage
  // and simulation checks fail and say so, rather than being skipped. When an
  // adapter builds and simulates the transaction, pass its results here.
  const checks = runChecks(rule, policy, {
    venue,
    size,
    movedToday: SAMPLE_MOVED_TODAY,
    heldSince: now - 2 * 86_400_000,
    now,
    simulatedSlippageBp: null,
    simulationOk: null,
  });
  const v = verdict(checks);
  const fmt = (x: number) => x.toLocaleString('en-GB');
  const once = (venue.moveCostPct / 100) * size;

  return (
    <>
      <PageHead
        eyebrow={`Proposal · built by Signal at ${new Date(now).toLocaleTimeString('en-GB')}`}
        title={`Move to ${venue.name}`}
        lede="Signal built this from your rule. It is unsigned and has not been broadcast. Read every check before you sign."
      />

      <SampleRegion note="Every figure in this outline is invented for layout. A live proposal re-reads rates at signing; a stale read cancels it.">
        <div className="yf-split">
          <div className="yf-stack-6">
            <section className="yf-card yf-stack" aria-labelledby="ar-h">
              <h2 id="ar-h" className="yf-h2">Why Signal proposed it</h2>
              <MathStrip gross={venue.grossPct} annualisedMove={venue.annualisedMovePct} net={venue.netPct} edgeBp={venue.edgeBp} labels={[`Gross, ${venue.name}`, 'Move cost, annualised', `Net, ${venue.name}`, 'Edge vs Venue C']} />
              <p className="yf-fine">
                Move cost once: {venue.moveCostPct.toFixed(2)}% of size = {fmt(Math.round(once))} USDC. Annualised over {rule.horizonDays} days: {venue.moveCostPct.toFixed(2)} × 365 ÷ {rule.horizonDays} = {venue.annualisedMovePct.toFixed(2)}%.
              </p>
              <div className="yf-field" style={{ maxWidth: 280 }}>
                <label htmlFor="size">Size</label>
                <div className="yf-inputwrap">
                  <input id="size" className="yf-input" type="number" min={0} step={1000} value={size} onChange={(e) => setSize(Math.max(0, Number(e.target.value) || 0))} />
                  <span className="yf-inputwrap__unit">USDC</span>
                </div>
              </div>
            </section>

            <section className="yf-stack" aria-labelledby="tx-h">
              <div className="yf-head">
                <h2 id="tx-h" className="yf-h2">Unsigned transaction</h2>
                <span className="yf-badge yf-badge--unverified">Not built</span>
              </div>
              <pre className="yf-code">{`Solana · v0 transaction · unsigned
Fee payer     [address]  (you)
Signers       [address]  (you only)

1  ComputeBudget  set limit [n] CU
2  Venue C        withdraw ${fmt(size)} USDC → your ATA
3  ${venue.name.padEnd(13)}  supply   ${fmt(size)} USDC ← your ATA

Writable     none owned by YieldForge
Simulation   not run`}</pre>
              <p className="yf-fine">
                {venue.name} is sample data with no live adapter, so no transaction can be built or simulated. Add an adapter for it on the <Link href="/adapters">Adapters</Link> screen.
              </p>
            </section>
          </div>

          <aside className="yf-stack-6">
            <section className="yf-card yf-stack" aria-labelledby="ck-h">
              <div className="yf-head"><h2 id="ck-h" className="yf-h2">Policy checks</h2><span className="yf-fine">{v.passCount} passed · {v.failed.length} failed</span></div>
              <Checks checks={checks} />
            </section>

            <section className={`yf-verdict ${v.passed ? 'yf-verdict--passed' : 'yf-verdict--refused'}`} aria-labelledby="vd-h" role="status">
              <span className={`yf-badge ${v.passed ? 'yf-badge--success' : 'yf-badge--danger'}`} style={{ alignSelf: 'flex-start' }}>{v.passed ? 'Passed' : 'Refused'}</span>
              <h2 id="vd-h" className="yf-h2">{v.passed ? `All ${checks.length} checks passed` : `Refused: ${v.failed.length} of ${checks.length} checks failed`}</h2>
              {v.passed ? (
                <p className="yf-small">Sign in your wallet. Nothing moves until you approve there.</p>
              ) : (
                <>
                  <p className="yf-small">Nothing was sent to your wallet.</p>
                  <ul className="yf-small" style={{ margin: 0, paddingLeft: '1.2em' }}>
                    {v.failed.map((c) => <li key={c.id}><b>{c.name}:</b> {c.fix}</li>)}
                  </ul>
                </>
              )}
              <div className="yf-row">
                <Link className="yf-btn yf-btn--secondary" href="/policy">Edit spend policy</Link>
                <button className="yf-btn yf-btn--primary" type="button" aria-disabled={!v.passed} disabled={!v.passed}>Sign transaction</button>
              </div>
              {!v.passed && <p className="yf-fine">Sign transaction stays off until every check passes.</p>}
            </section>
          </aside>
        </div>
      </SampleRegion>

      <Disclaimer>Yield is not fixed and can fall to zero. The rate at {venue.name} can change after you sign. YieldID does not hold funds or sign for you.</Disclaimer>
    </>
  );
}

export default function ProposalPage() {
  return (
    <Suspense fallback={<p className="yf-small">Loading proposal…</p>}>
      <Proposal />
    </Suspense>
  );
}
