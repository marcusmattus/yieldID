'use client';

import { useState } from 'react';
import { Disclaimer, PageHead } from '@/components/ui';
import { base58ToBytes } from '@/lib/base58';
import { sampleVenues } from '@/lib/sample';

const TOOLS: Array<[string, string, string]> = [
  ['Read', 'yid.resolve(handle)', 'Addresses behind a YieldID, with the DNS signature check.'],
  ['Read', 'signal.board(asset, horizonDays)', 'Venues ranked net, with gross, annualised move cost, net and edge as separate fields, plus the not-ranked list.'],
  ['Read', 'stable.routes(from, to, size)', 'Mint, wrap and bridge routes with one-off and annualised cost.'],
  ['Read', 'tracker.events(handle, range)', 'Transactions with signatures.'],
  ['Build', 'proposal.build(from, to, size)', 'Unsigned transaction plus every policy check. Never signs, never broadcasts.'],
  ['Draft', 'rule.draft(params)', 'A rule you review and save yourself.'],
  ['Draft', 'adapter.draft(programId, idl)', 'Proposes an adapter; it starts Unverified.'],
];

function checkAddress(chain: string, value: string): string | null {
  if (!value) return 'Enter the program ID or contract address.';
  if (chain === 'Solana') {
    try {
      return base58ToBytes(value).length === 32 ? null : 'A Solana program ID is 32 bytes in base58.';
    } catch {
      return 'Not valid base58.';
    }
  }
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? null : 'An EVM contract is 0x followed by 40 hex characters.';
}

export default function AdaptersPage() {
  const venues = sampleVenues(0);
  const [chain, setChain] = useState('Solana');
  const [program, setProgram] = useState('');
  const [name, setName] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const err = program ? checkAddress(chain, program) : null;

  return (
    <>
      <PageHead
        eyebrow="YieldID · Build"
        title="Adapters and agents"
        lede="An adapter teaches YieldID two things about a venue: how to read its rate and capacity, and how to build an unsigned move in or out. Add one venue or a whole aggregator. Your agents call the same tools you do, and none of them can sign."
      />

      <section className="yf-stack" aria-labelledby="reg-h">
        <div className="yf-head">
          <h2 id="reg-h" className="yf-h2">Adapters</h2>
          <span className="yf-badge yf-badge--sample">Illustrative sample data</span>
        </div>
        <div className="yf-table-wrap">
          <table className="yf-table">
            <thead><tr><th scope="col">Venue</th><th scope="col">Chain</th><th scope="col">Sleeve</th><th scope="col">Reads</th><th scope="col">Builds</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id}>
                  <th scope="row">{v.name}<br /><span className="yf-fine">{v.product}</span></th>
                  <td>{v.chain}</td>
                  <td>{v.sleeve === 'rwa' ? 'RWA' : 'Forge'}</td>
                  <td>rate, capacity</td>
                  <td>Not yet</td>
                  <td>
                    {v.error ? <span className="yf-badge yf-badge--danger">Read failing</span>
                      : v.source === 'unverified' ? <span className="yf-badge yf-badge--unverified">Unverified</span>
                      : <span className="yf-badge yf-badge--sample">Sample</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="yf-fine">No live adapters are connected yet. Implement one in lib/adapters (see the README) and its venue reads replace the sample set.</p>
      </section>

      <div className="yf-split">
        <form className="yf-card yf-stack-6" aria-labelledby="add-h" onSubmit={(e) => { e.preventDefault(); if (!err && program) setResult(`${name || 'New adapter'} saved as Unverified. It is listed under Not ranked until its reads agree with chain.`); }}>
          <h2 id="add-h" className="yf-h2">Add an adapter</h2>
          <div className="yf-fields">
            <div className="yf-field">
              <label htmlFor="ad-name">Name</label>
              <div className="yf-inputwrap"><input id="ad-name" className="yf-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Venue name" /></div>
            </div>
            <div className="yf-field">
              <label htmlFor="ad-chain">Chain</label>
              <div className="yf-inputwrap">
                <select id="ad-chain" className="yf-select" value={chain} onChange={(e) => setChain(e.target.value)}>
                  {['Solana', 'Hyperliquid', 'Base', 'Ethereum', 'Arbitrum'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="yf-field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="ad-prog">Program ID or contract</label>
              <div className="yf-inputwrap"><input id="ad-prog" className="yf-input" value={program} onChange={(e) => { setProgram(e.target.value.trim()); setResult(null); }} spellCheck={false} /></div>
              {err ? <p className="yf-error-text">{err}</p> : <p className="yf-field__hint">Checked against the chain before any read: must be executable and match the IDL or ABI.</p>}
            </div>
          </div>
          <div className="yf-row">
            <button className="yf-btn yf-btn--primary" type="submit" disabled={!program || !!err}>Submit adapter</button>
          </div>
          {result && <p className="yf-ok-text" role="status">{result}</p>}
        </form>

        <section className="yf-stack" aria-labelledby="mcp-h">
          <h2 id="mcp-h" className="yf-h2">Agent tools (MCP)</h2>
          <pre className="yf-code">{`endpoint  /mcp   (planned)
auth      sign-in-with-Solana session
signing   none · tools return unsigned transactions`}</pre>
          <ul className="yf-tools">
            {TOOLS.map(([verb, toolName, desc]) => (
              <li key={toolName} className={`yf-tool ${verb === 'Read' ? 'yf-tool--read' : 'yf-tool--write'}`}>
                <span className="yf-tool__verb">{verb}</span>
                <div><p className="yf-tool__name">{toolName}</p><p className="yf-tool__desc">{desc}</p></div>
              </li>
            ))}
          </ul>
          <p className="yf-fine">Not exposed to agents: signing, spend policy changes, kill switch, YieldID revocation.</p>
        </section>
      </div>
      <Disclaimer>An adapter reads a venue; it does not vouch for it. A venue with a working adapter can still fail, pause withdrawals or be exploited.</Disclaimer>
    </>
  );
}
