'use client';

import { address as toAddress, createSolanaRpc } from '@solana/kit';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DataStatus, Disclaimer, PageHead } from '@/components/ui';
import { shortAddress } from '@/lib/base58';

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com';

type Row = { signature: string; slot: bigint; blockTime: number | null; ok: boolean; memo: string | null; finality: string };
type State =
  | { kind: 'loading' }
  | { kind: 'error'; reason: string; at: number }
  | { kind: 'ready'; rows: Row[]; at: number };

export function TrackerView({ address }: { address: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const read = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const rpc = createSolanaRpc(RPC);
      const sigs = await rpc.getSignaturesForAddress(toAddress(address), { limit: 25 }).send();
      setState({
        kind: 'ready',
        at: Date.now(),
        rows: sigs.map((s) => ({
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime === null ? null : Number(s.blockTime),
          ok: s.err === null,
          memo: s.memo,
          finality: s.confirmationStatus ?? 'unknown',
        })),
      });
    } catch (e) {
      setState({ kind: 'error', reason: (e as Error).message, at: Date.now() });
    }
  }, [address]);

  useEffect(() => {
    read();
  }, [read]);

  function exportCsv() {
    if (state.kind !== 'ready') return;
    const lines = [
      'time_utc,signature,slot,status,finality',
      ...state.rows.map((r) => [r.blockTime ? new Date(r.blockTime * 1000).toISOString() : '', r.signature, r.slot.toString(), r.ok ? 'settled' : 'reverted', r.finality].join(',')),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `yieldid-${shortAddress(address)}-records.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHead
        eyebrow="YieldID · Tracker"
        title="Tracker"
        lede={`Every transaction on ${shortAddress(address)}, read from Solana with its signature. YieldForge appears in none of them.`}
        actions={<>
          <button className="yf-btn yf-btn--secondary" type="button" onClick={read} disabled={state.kind === 'loading'}>Read again</button>
          <button className="yf-btn yf-btn--secondary" type="button" onClick={exportCsv} disabled={state.kind !== 'ready' || state.rows.length === 0}>Export records</button>
        </>}
      />

      {state.kind === 'loading' && (
        <div className="yf-state" aria-busy="true">
          <span className="yf-badge yf-badge--info">Reading</span>
          <h2 className="yf-state__title">Reading signatures from Solana</h2>
          <p className="yf-state__body">RPC: {new URL(RPC).host}. No rows are shown until each one is read.</p>
          <div className="yf-stack" style={{ width: '100%', gap: 12 }}>
            <div className="yf-skeleton" /><div className="yf-skeleton yf-skeleton--mid" /><div className="yf-skeleton" /><div className="yf-skeleton yf-skeleton--short" />
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="yf-state yf-state--error" role="alert">
          <span className="yf-badge yf-badge--danger">Read failed</span>
          <h2 className="yf-state__title">Solana RPC refused the read</h2>
          <p className="yf-state__body">{new URL(RPC).host} returned: {state.reason}. At {new Date(state.at).toLocaleTimeString('en-GB')}. No rows are shown, because none could be checked.</p>
          <p className="yf-state__body">Read again, or set NEXT_PUBLIC_SOLANA_RPC to a dedicated RPC endpoint. The public endpoint rate-limits heavily.</p>
          <button className="yf-btn yf-btn--primary" type="button" onClick={read}>Read again</button>
        </div>
      )}

      {state.kind === 'ready' && state.rows.length === 0 && (
        <div className="yf-state">
          <DataStatus status={{ kind: 'live', at: state.at }} />
          <h2 className="yf-state__title">No transactions on this address yet</h2>
          <p className="yf-state__body">The tracker read Solana for {shortAddress(address)} and found nothing. Moves appear here after you sign one.</p>
          <Link className="yf-btn yf-btn--primary" href="/board">Open the board</Link>
        </div>
      )}

      {state.kind === 'ready' && state.rows.length > 0 && (
        <section className="yf-stack" aria-labelledby="ev-h">
          <div className="yf-head">
            <h2 id="ev-h" className="yf-h2">Latest {state.rows.length} transactions</h2>
            <DataStatus status={{ kind: 'live', at: state.at }}><span>{new URL(RPC).host}</span></DataStatus>
          </div>
          <div className="yf-table-wrap">
            <table className="yf-table">
              <thead>
                <tr><th scope="col">Time (UTC)</th><th scope="col">Signature</th><th scope="col" className="yf-cell-num">Slot</th><th scope="col">Finality</th><th scope="col">Status</th></tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.signature}>
                    <td className="yf-cell-mono">{r.blockTime ? new Date(r.blockTime * 1000).toISOString().slice(0, 19).replace('T', ' ') : 'Unknown'}</td>
                    <td className="yf-cell-mono"><a href={`https://explorer.solana.com/tx/${r.signature}`} target="_blank" rel="noreferrer">{r.signature.slice(0, 20)}…</a></td>
                    <td className="yf-cell-num">{r.slot.toString()}</td>
                    <td>{r.finality}</td>
                    <td>{r.ok ? <span className="yf-badge yf-badge--success">Settled</span> : <span className="yf-badge yf-badge--danger">Reverted</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="yf-fine">Reverted: the transaction landed and failed; nothing moved except the fee. Venue-level labels (move, route, yield claimed) appear once adapters decode these transactions.</p>
        </section>
      )}

      <Disclaimer>Export gives each transaction with time, signature and status. It is a record for you or your accountant, not tax advice.</Disclaimer>
    </>
  );
}
