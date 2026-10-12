'use client';

import { Disclaimer, PageHead, SampleRegion } from '@/components/ui';
import { annualiseMoveCost, fmtPct } from '@/lib/rates';
import { useAppState } from '@/lib/store';

const STABLES = [
  {
    ticker: 'yUSD', badge: 'unverified', badgeText: 'Reserves unverified',
    blurb: 'US dollar stable, minted 1:1 against USDC held by the yUSD vault program.',
    rows: [['Chains', 'Solana · Base · Ethereum · Arbitrum'], ['Held by', 'yUSD vault PDA [address]'], ['Upgrade authority', '[address] · [n]-of-[n] multisig'], ['Freeze authority', '[none or address]'], ['Mint, redeem fee', '[x]% · [x]%'], ['Cross-chain', 'Burn and mint · [messaging layer]'], ['Attestation', 'Last [timestamp] by [auditor]']],
  },
  {
    ticker: 'yGBP', badge: 'unverified', badgeText: 'Reserves unverified',
    blurb: 'Pound sterling stable, minted against GBP held by [custodian]. On-ramp by Faster Payments through [on-ramp partner].',
    rows: [['Chains', 'Solana · Base'], ['Held by', '[custodian], [jurisdiction]'], ['Issuer', '[issuer] · [licence status]'], ['Freeze authority', '[address]'], ['Mint, redeem fee', '[x]% · [x]%'], ['Redeem to bank', '[n] business days'], ['Attestation', 'Last [timestamp] by [auditor]']],
  },
  {
    ticker: 'yUSDC', badge: 'unverified', badgeText: 'Backing not read',
    blurb: 'Wraps USDC one-for-one so your rule can route it across sleeves. Unwrap to native USDC at any time in one signature.',
    rows: [['Chains', 'Solana · Base'], ['Held by', 'Wrapper PDA [address]'], ['Backing check', '[amount] USDC held vs [amount] yUSDC supply'], ['Freeze authority', "Inherits USDC issuer's"], ['Wrap, unwrap fee', '[x]%']],
  },
  {
    ticker: 'yUSDT', badge: 'unverified', badgeText: 'Backing not read',
    blurb: 'Wraps USDT one-for-one. Use it to keep exposure to a second issuer while routing between the same venues.',
    rows: [['Chains', 'Solana · Ethereum · Arbitrum'], ['Held by', 'Wrapper PDA [address]'], ['Backing check', '[amount] USDT held vs [amount] yUSDT supply'], ['Freeze authority', "Inherits USDT issuer's"], ['Wrap, unwrap fee', '[x]%']],
  },
];

const ROUTES = [
  { name: 'Unwrap, burn and mint yUSD', sub: 'Native yUSD transfer', sigs: '2 · Solana, Base', cost: 0.02, held: 'yUSD vault, both chains' },
  { name: 'Unwrap, CCTP USDC, mint yUSD', sub: 'Circle burn and mint', sigs: '3 · Solana, Base, Base', cost: 0.05, held: 'USDC issuer' },
  { name: 'Bridge aggregator', sub: 'Liquidity bridge, [bridge]', sigs: '2 · Solana, Base', cost: 0.15, held: 'Bridge contract [address]' },
];

export default function StablesPage() {
  const { rule } = useAppState();
  return (
    <>
      <PageHead
        eyebrow="YieldID · Stables"
        title="Stables and routes"
        lede="Hold your position in the stable and on the chain that fits your exposure, and move between them without leaving the ranking. Routes are ranked net, the same way venues are: the one-off cost of the route is spread over your horizon."
      />

      <section className="yf-stack" aria-labelledby="fam-h">
        <h2 id="fam-h" className="yf-h2">The y-stables</h2>
        <div className="yf-grid-2">
          {STABLES.map((s) => (
            <article key={s.ticker} className="yf-card yf-stack">
              <div className="yf-head">
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: '34px', fontWeight: 700, margin: 0 }}>{s.ticker}</p>
                <span className="yf-badge yf-badge--unverified">{s.badgeText}</span>
              </div>
              <p className="yf-small">{s.blurb}</p>
              <dl className="yf-kv">{s.rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            </article>
          ))}
        </div>
        <p className="yf-fine">Minting or wrapping moves your stables into a program-owned vault, not a YieldForge wallet. The vault&apos;s upgrade and freeze authorities can change what it does; check them before you mint. Redemption depends on the vault, the bridge and, for yGBP, the custodian.</p>
      </section>

      <SampleRegion labelledBy="rt-h" note="Round figures. Live routes are quoted and simulated before you sign.">
        <h2 id="rt-h" className="yf-h2">Route: 40,000 yUSDC on Solana → yUSD on Base, {rule.horizonDays}-day horizon</h2>
        <div className="yf-table-wrap">
          <table className="yf-table">
            <thead><tr><th scope="col">#</th><th scope="col">Route</th><th scope="col">Signatures</th><th scope="col" className="yf-cell-num">Cost, once</th><th scope="col" className="yf-cell-num">Cost, annualised</th><th scope="col">In flight, held by</th></tr></thead>
            <tbody>
              {ROUTES.map((r, i) => (
                <tr key={r.name}>
                  <td className="yf-rank">{i + 1}</td>
                  <th scope="row">{r.name}<br /><span className="yf-fine">{r.sub}</span></th>
                  <td>{r.sigs}</td>
                  <td className="yf-cell-num">{fmtPct(r.cost)}</td>
                  <td className="yf-cell-num">{fmtPct(annualiseMoveCost(r.cost, rule.horizonDays))}</td>
                  <td>{r.held}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="yf-fine">Annualised = cost once × 365 ÷ {rule.horizonDays}. A route&apos;s cost is added to the destination venue&apos;s move cost on the Signal board, so a venue reached by a route is ranked net of the route too.</p>
      </SampleRegion>

      <section className="yf-stack" aria-labelledby="rr-h">
        <div className="yf-head">
          <div>
            <h2 id="rr-h" className="yf-h2">Regulatory resilience</h2>
            <p className="yf-small" style={{ marginTop: 4 }}>Know who can freeze each holding and what it costs to leave, before a rule change makes you need to.</p>
          </div>
          <span className="yf-badge yf-badge--unverified">Unverified · issuer data</span>
        </div>
        <div className="yf-table-wrap">
          <table className="yf-table">
            <thead><tr><th scope="col">Holding</th><th scope="col">Issuer jurisdiction</th><th scope="col">Can freeze</th><th scope="col">Exit route, ready</th><th scope="col" className="yf-cell-num">Exit cost, once</th><th scope="col">Exposure limit</th></tr></thead>
            <tbody>
              <tr><th scope="row">yUSD · Base</th><td>[jurisdiction]</td><td>[authority]</td><td>Redeem to USDC, then to your wallet</td><td className="yf-cell-num">[x]%</td><td>≤ [x]% of capital</td></tr>
              <tr><th scope="row">yGBP · Solana</th><td>[jurisdiction]</td><td>[issuer]</td><td>Redeem to GBP bank, or swap to USDC</td><td className="yf-cell-num">[x]%</td><td>≤ [x]% of capital</td></tr>
              <tr><th scope="row">yUSDT · Arbitrum</th><td>[jurisdiction]</td><td>USDT issuer</td><td>Unwrap to USDT</td><td className="yf-cell-num">[x]%</td><td>≤ [x]% of capital</td></tr>
            </tbody>
          </table>
        </div>
        <div className="yf-grid-2">
          <div className="yf-card yf-stack">
            <h3 className="yf-h2">Exit drill</h3>
            <p className="yf-small">Signal pre-builds the unsigned exit for each holding and re-simulates it daily, so a regime change is one signature, not a research project.</p>
          </div>
          <div className="yf-card yf-stack">
            <h3 className="yf-h2">Records for your accountant</h3>
            <p className="yf-small">Every mint, wrap, route and move as lots with cost basis and yield received, per chain and per jurisdiction. YieldID keeps the record complete; it does not change what you owe.</p>
          </div>
        </div>
      </section>

      <section className="yf-card yf-stack" aria-labelledby="ramp-h">
        <h2 id="ramp-h" className="yf-h2">On-ramp</h2>
        <dl className="yf-kv">
          <dt>GBP → yGBP</dt><dd>Faster Payments through [on-ramp partner]</dd>
          <dt>USD → yUSD</dt><dd>ACH or wire through [on-ramp partner]</dd>
          <dt>Identity checks</dt><dd>Run by [on-ramp partner], not YieldID. We never see your documents.</dd>
        </dl>
      </section>
      <Disclaimer>Stablecoins can lose their peg, be frozen by their issuer or become unredeemable. Bridges can fail. Nothing on this page is tax or legal advice.</Disclaimer>
    </>
  );
}
