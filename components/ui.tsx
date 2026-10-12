import type { ReactNode } from 'react';
import type { CheckResult } from '@/lib/policy';
import { fmtBp, fmtPct } from '@/lib/rates';

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path className="yf-brand__mark-arm" d="M9 7 L24 24 L39 7" fill="none" strokeWidth="6" />
      <path className="yf-brand__mark-stem" d="M24 24 V43" fill="none" strokeWidth="6" />
      <circle className="yf-brand__mark-node" cx="24" cy="24" r="5.5" strokeWidth="3" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="yf-nav__brand yf-brand">
      <BrandMark />
      <span>
        Yield<b>ID</b>
      </span>
    </span>
  );
}

type Status = { kind: 'live'; at: number | Date } | { kind: 'sample'; note?: string } | { kind: 'unverified'; note?: string };

export function DataStatus({ status, children }: { status: Status; children?: ReactNode }) {
  if (status.kind === 'live') {
    const at = new Date(status.at);
    return (
      <div className="yf-status">
        <span className="yf-badge yf-badge--live">
          <span className="yf-badge__dot" aria-hidden="true" />
          Live · as of <time dateTime={at.toISOString()}>{at.toLocaleTimeString('en-GB')}</time>
        </span>
        {children}
      </div>
    );
  }
  if (status.kind === 'sample') {
    return (
      <div className="yf-status">
        <span className="yf-badge yf-badge--sample">
          <span className="yf-badge__dot" aria-hidden="true" />
          Illustrative sample data
        </span>
        <span>{status.note ?? 'Round figures for layout. Live reads show LIVE with a timestamp.'}</span>
        {children}
      </div>
    );
  }
  return (
    <div className="yf-status">
      <span className="yf-badge yf-badge--unverified">Unverified</span>
      {status.note && <span>{status.note}</span>}
      {children}
    </div>
  );
}

/** Any region showing invented figures wears this outline and badge. */
export function SampleRegion({ children, labelledBy, note }: { children: ReactNode; labelledBy?: string; note?: string }) {
  return (
    <section className="yf-sample-region" aria-labelledby={labelledBy}>
      <DataStatus status={{ kind: 'sample', note }} />
      {children}
    </section>
  );
}

export function MathStrip({ gross, annualisedMove, net, edgeBp, labels }: {
  gross: number;
  annualisedMove: number;
  net: number;
  edgeBp: number | null;
  labels?: [string, string, string, string];
}) {
  const l = labels ?? ['Gross', 'Move cost, annualised', 'Net', 'Edge vs current'];
  return (
    <dl className="yf-math">
      <div><dt>{l[0]}</dt><dd>{fmtPct(gross)}</dd></div>
      <div><dt>{l[1]}</dt><dd>{fmtPct(annualisedMove)}</dd></div>
      <div><dt>{l[2]}</dt><dd>{fmtPct(net)}</dd></div>
      <div><dt>{l[3]}</dt><dd>{fmtBp(edgeBp)}</dd></div>
    </dl>
  );
}

export function Checks({ checks, compact = false }: { checks: CheckResult[]; compact?: boolean }) {
  return (
    <ol className="yf-checks">
      {checks.map((c) => (
        <li key={c.id} className={`yf-check${c.pass ? '' : ' yf-check--fail'}`}>
          <span className={`yf-badge ${c.pass ? 'yf-badge--success' : 'yf-badge--danger'}`}>{c.pass ? 'Pass' : 'Fail'}</span>
          <div>
            <p className="yf-check__name">{c.name}</p>
            {!compact && <p className="yf-check__detail">{c.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SleeveBadge({ kind }: { kind: 'forge' | 'rwa' }) {
  return <span className={`yf-badge ${kind === 'rwa' ? 'yf-badge--rwa' : 'yf-badge--forge'}`}>{kind === 'rwa' ? 'RWA' : 'Forge'}</span>;
}

export function PageHead({ eyebrow, title, lede, actions }: { eyebrow: string; title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={actions ? 'yf-head' : undefined}>
      <div>
        <p className="yf-eyebrow" style={{ margin: 0 }}>{eyebrow}</p>
        <h1 className="yf-h1">{title}</h1>
        {lede && <p className="yf-lede">{lede}</p>}
      </div>
      {actions && <div className="yf-row">{actions}</div>}
    </header>
  );
}

export function Disclaimer({ children }: { children?: ReactNode }) {
  return (
    <p className="yf-disclaimer">
      {children ??
        'Yield is not fixed and can fall to zero. Venues, bridges and stable issuers can fail, pause withdrawals or freeze assets. YieldID does not hold funds or sign for you.'}
    </p>
  );
}
