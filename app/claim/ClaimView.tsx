'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useSignMessage, useWallets } from '@privy-io/react-auth/solana';
import Link from 'next/link';
import { useState } from 'react';
import { OnboardNav } from '@/components/Nav';
import { Disclaimer } from '@/components/ui';
import { bytesToBase58 } from '@/lib/base58';
import { setAppState } from '@/lib/store';
import { recordBody, recordName, recordText, validateHandle, zoneLine } from '@/lib/yid';

type Resolve = { status: string; name?: string; addresses?: { sol: string }; checkedAt?: string; detail?: string; fix?: string };

export function ClaimView({ address, domain }: { address: string; domain: string | null }) {
  const { connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const wallet = wallets.find((w) => w.address === address);

  const [handle, setHandle] = useState('');
  const [evm, setEvm] = useState('');
  const [record, setRecord] = useState<{ zone: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Resolve | null>(null);
  const [copied, setCopied] = useState(false);

  const handleError = handle ? validateHandle(handle) : null;
  const evmError = evm && !/^0x[0-9a-fA-F]{40}$/.test(evm) ? 'An EVM address is 0x followed by 40 hex characters.' : null;
  const body = recordBody({ sol: address, evm: evm && !evmError ? evm : undefined, hl: evm && !evmError ? evm : undefined });

  async function signRecord() {
    if (!wallet || !domain) return;
    setError(null);
    try {
      const { signature } = await signMessage({ message: new TextEncoder().encode(body), wallet, options: { uiOptions: { title: 'Sign your YieldID record' } } });
      const text = recordText(body, bytesToBase58(signature));
      setRecord({ text, zone: zoneLine(handle, domain, text) });
    } catch (e) {
      setError(`The wallet did not sign: ${(e as Error).message}. Approve the message to create the record.`);
    }
  }

  async function checkDns() {
    setCheck({ status: 'checking' });
    const r: Resolve = await fetch(`/api/yid/resolve?handle=${encodeURIComponent(handle)}`).then((x) => x.json());
    setCheck(r);
    if (r.status === 'verified' && r.addresses?.sol === address) setAppState((s) => ({ ...s, handle }));
  }

  if (!domain) {
    return (
      <div className="yf-page yf-page--narrow">
        <OnboardNav address={address} />
        <div className="yf-state yf-state--error" role="alert">
          <h1 className="yf-state__title">YieldID domain is not set</h1>
          <p className="yf-state__body">Set NEXT_PUBLIC_YID_DOMAIN in .env.local to the domain whose DNS you control, then restart.</p>
          <Link className="yf-btn yf-btn--secondary" href="/forge">Skip, use address only</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="yf-page">
      <OnboardNav address={address} />
      <header>
        <p className="yf-eyebrow" style={{ margin: 0 }}>Step 3 of 3</p>
        <h1 className="yf-h1">Claim your YieldID</h1>
        <p className="yf-lede">
          A YieldID is a readable name for your wallets on every chain you route stables through. It resolves through a
          DNS TXT record signed by your Solana key, so anyone can check it without us.
        </p>
      </header>

      <div className="yf-split">
        <section className="yf-stack-6" aria-labelledby="rec-h">
          <div className="yf-fields">
            <div className="yf-field">
              <label htmlFor="handle">Handle</label>
              <div className="yf-inputwrap">
                <input id="handle" className="yf-input" value={handle} onChange={(e) => { setHandle(e.target.value.trim().toLowerCase()); setRecord(null); setCheck(null); }} autoComplete="off" spellCheck={false} aria-describedby="handle-hint" placeholder="handle" />
                <span className="yf-inputwrap__unit">@{domain}</span>
              </div>
              <p id="handle-hint" className="yf-field__hint">Lowercase letters, numbers and hyphens, 3 to 32 characters.</p>
              {handleError && <p className="yf-error-text">{handleError}</p>}
            </div>
            <div className="yf-field">
              <label htmlFor="evm">EVM address (optional)</label>
              <div className="yf-inputwrap">
                <input id="evm" className="yf-input" value={evm} onChange={(e) => { setEvm(e.target.value.trim()); setRecord(null); }} placeholder="0x…" spellCheck={false} />
              </div>
              <p className="yf-field__hint">For Base, Ethereum, Arbitrum and Hyperliquid routes. Leave empty for Solana only.</p>
              {evmError && <p className="yf-error-text">{evmError}</p>}
            </div>
          </div>

          <div className="yf-head">
            <h2 id="rec-h" className="yf-h2">The record it publishes</h2>
            <button className="yf-btn yf-btn--secondary" type="button" disabled={!record} onClick={() => record && navigator.clipboard.writeText(record.zone).then(() => setCopied(true))}>
              {copied ? 'Copied' : 'Copy record'}
            </button>
          </div>
          <pre className="yf-code">
            {record ? record.zone : `${recordName(handle || '[handle]', domain)}.  300  IN  TXT\n  "${body}; sig=[signature]"`}
          </pre>
          <dl className="yf-kv">
            <dt>Name</dt><dd>{recordName(handle || '[handle]', domain)}</dd>
            <dt>Type</dt><dd>TXT · TTL 300 s</dd>
            <dt>sol</dt><dd>{address}</dd>
            <dt>sig</dt><dd>{record ? 'Signed by the sol key over the record body' : 'Not signed yet'}</dd>
          </dl>
          <p className="yf-fine">Publishing writes a DNS record at your DNS provider. It is not a chain transaction and costs nothing on chain.</p>
          {error && <p className="yf-error-text" role="alert">{error}</p>}
        </section>

        <aside className="yf-stack-6">
          <section className="yf-card yf-stack" aria-labelledby="steps-h">
            <h2 id="steps-h" className="yf-h2">Three steps</h2>
            <ol className="yf-small" style={{ paddingLeft: '1.2em', margin: 0 }}>
              <li>Sign the record with your wallet. A message, not a transaction.</li>
              <li>Copy it into your DNS provider as a TXT record.</li>
              <li>Check DNS. We read the record and verify the signature.</li>
            </ol>
          </section>
          {check && check.status !== 'checking' && (
            <section className={`yf-verdict ${check.status === 'verified' ? 'yf-verdict--passed' : 'yf-verdict--refused'}`} role="status">
              {check.status === 'verified' && check.addresses?.sol === address ? (
                <p className="yf-ok-text"><b>Verified.</b> {handle}@{domain} resolves to your wallet, signature valid.</p>
              ) : check.status === 'not_found' || check.status === 'no_yid_record' ? (
                <p className="yf-small"><b>Not found yet.</b> No YieldID record at {check.name}. DNS can take a few minutes to update; check again shortly.</p>
              ) : check.status === 'bad_signature' ? (
                <p className="yf-error-text"><b>Signature invalid.</b> The record does not verify against its sol key. Sign it again and replace the record.</p>
              ) : (
                <p className="yf-error-text"><b>Check failed.</b> {check.detail ?? check.status}. {check.fix ?? ''}</p>
              )}
            </section>
          )}
        </aside>
      </div>

      <div className="yf-row">
        {wallet ? (
          <button className="yf-btn yf-btn--primary" type="button" onClick={signRecord} disabled={!handle || !!handleError || !!evmError}>Sign record</button>
        ) : (
          <button className="yf-btn yf-btn--primary" type="button" onClick={() => connectWallet({ walletChainType: 'solana-only' })}>Reconnect wallet to sign</button>
        )}
        <button className="yf-btn yf-btn--secondary" type="button" onClick={checkDns} disabled={!handle || !!handleError || check?.status === 'checking'}>
          {check?.status === 'checking' ? 'Checking…' : 'Check DNS'}
        </button>
        <Link className="yf-btn yf-btn--text" href="/forge">{check?.status === 'verified' ? 'Go to your forge' : 'Skip, use address only'}</Link>
      </div>

      <Disclaimer>A YieldID is a name, not an account. It holds nothing and grants nothing. Funds stay in the wallets it points to.</Disclaimer>
    </div>
  );
}
