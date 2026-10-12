'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useSignMessage, useWallets } from '@privy-io/react-auth/solana';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Disclaimer } from '@/components/ui';
import { bytesToBase58, shortAddress } from '@/lib/base58';
import { setAppState, useAppState, type LinkedWallet } from '@/lib/store';
import { chunkTxt, linkMessage, recordBody, recordName, recordText, validateHandle, zoneLine } from '@/lib/yid';

type Resolve = { status: string; name?: string; addresses?: { sol: string }; detail?: string; fix?: string };
const STEPS = ['Pick a handle', 'Add wallets', 'Sign the record', 'Publish and verify'];

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="yf-field">
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <div className="yf-inputwrap">
        <input className="yf-input" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="yf-btn yf-btn--text" onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))} aria-label={`Copy ${label}`}>
          {copied ? Icon.check(18) : Icon.copy(18)} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function YidMaker({ address, domain }: { address: string; domain: string | null }) {
  const { connectWallet } = usePrivy();
  const { wallets: connected } = useWallets();
  const { signMessage } = useSignMessage();
  const { wallets, handle: savedHandle } = useAppState();

  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState(savedHandle ?? '');
  const [avail, setAvail] = useState<Resolve | null>(null);
  const [evmInput, setEvmInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<string | null>(null);
  const [check, setCheck] = useState<Resolve | null>(null);

  const handleError = handle ? validateHandle(handle) : 'Enter a handle.';
  const primaryWallet = connected.find((w) => w.address === address);
  const linked = new Set(wallets.map((w) => w.address));
  const candidates = connected.filter((w) => w.address !== address && !linked.has(w.address));
  const altSol = wallets.filter((w) => w.chain === 'Solana' && w.proven && w.proof).map((w) => ({ address: w.address, issuedAt: w.proof!.issuedAt, sig: w.proof!.signature }));
  const evm = wallets.find((w) => w.chain === 'EVM')?.address;
  const body = recordBody({ sol: address, alt: altSol, evm, hl: evm });
  const evmError = evmInput && !/^0x[0-9a-fA-F]{40}$/.test(evmInput) ? 'An EVM address is 0x followed by 40 hex characters.' : null;

  const addWallet = (w: LinkedWallet) => setAppState((s) => ({ ...s, wallets: [...s.wallets.filter((x) => x.address !== w.address), w] }));
  const removeWallet = (a: string) => { setAppState((s) => ({ ...s, wallets: s.wallets.filter((x) => x.address !== a) })); setSigned(null); };

  async function resolve(): Promise<Resolve> {
    return fetch(`/api/yid/resolve?handle=${encodeURIComponent(handle)}`).then((r) => r.json());
  }

  async function checkAvailability() {
    setBusy('avail');
    setAvail(await resolve().catch(() => ({ status: 'dns_error', detail: 'Network error' })));
    setBusy(null);
  }

  async function prove(w: (typeof connected)[number]) {
    setBusy(w.address);
    setError(null);
    try {
      const issuedAt = new Date().toISOString();
      const { signature } = await signMessage({ message: new TextEncoder().encode(linkMessage(address, w.address, issuedAt)), wallet: w, options: { uiOptions: { title: 'Link this wallet to your YieldID' } } });
      const sig58 = bytesToBase58(signature);
      const out = await fetch('/api/wallets/prove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ added: w.address, issuedAt, signature: sig58 }) }).then((r) => r.json());
      if (!out.ok) setError(`${out.reason} ${out.fix}`);
      else { addWallet({ chain: 'Solana', address: w.address, label: w.standardWallet.name, proven: true, proof: { issuedAt, signature: sig58 } }); setSigned(null); }
    } catch (e) {
      setError(`The wallet did not sign: ${(e as Error).message}. Approve the message to link it.`);
    } finally {
      setBusy(null);
    }
  }

  async function signRecord() {
    if (!primaryWallet) return;
    setBusy('sign');
    setError(null);
    try {
      const { signature } = await signMessage({ message: new TextEncoder().encode(body), wallet: primaryWallet, options: { uiOptions: { title: 'Sign your YieldID record' } } });
      setSigned(recordText(body, bytesToBase58(signature)));
      setStep(3);
    } catch (e) {
      setError(`The wallet did not sign: ${(e as Error).message}. Approve the message to create the record.`);
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setBusy('verify');
    const r = await resolve().catch(() => ({ status: 'dns_error', detail: 'Network error' }) as Resolve);
    setCheck(r);
    if (r.status === 'verified' && r.addresses?.sol === address) setAppState((s) => ({ ...s, handle }));
    setBusy(null);
  }

  if (!domain) {
    return (
      <div className="yf-state yf-state--error" role="alert">
        <h1 className="yf-state__title">YieldID domain is not set</h1>
        <p className="yf-state__body">Set NEXT_PUBLIC_YID_DOMAIN in .env.local to a domain whose DNS you control, then restart.</p>
      </div>
    );
  }

  const availOk = avail && (avail.status === 'not_found' || avail.status === 'no_yid_record' || (avail.status === 'verified' && avail.addresses?.sol === address));

  return (
    <>
      <header className="yf-head">
        <div>
          <p className="yf-sec-title">YieldID maker</p>
          <h1 className="yf-bignum" style={{ fontSize: 'clamp(36px, 5vw, 64px)' }}>{handle || 'your-name'}<small>@{domain}</small></h1>
        </div>
        {savedHandle && savedHandle === handle && <span className="yf-badge yf-badge--success">Verified in DNS</span>}
      </header>

      <ol className="yf-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={i < step ? 'is-done' : undefined}>
            <b>{i < step ? Icon.check(14) : i + 1}</b>
            <button type="button" onClick={() => setStep(i)} style={{ background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0, minHeight: 28 }}>{s}</button>
          </li>
        ))}
      </ol>

      {error && <div className="yf-verdict yf-verdict--refused" role="alert"><p className="yf-error-text">{error}</p></div>}

      {step === 0 && (
        <section className="yf-panel" aria-labelledby="s1">
          <h2 id="s1" className="yf-h2">Pick a handle</h2>
          <div className="yf-field" style={{ maxWidth: 520 }}>
            <label htmlFor="handle">Handle</label>
            <div className="yf-inputwrap">
              <input id="handle" className="yf-input" value={handle} placeholder="your-name" spellCheck={false} autoComplete="off" onChange={(e) => { setHandle(e.target.value.trim().toLowerCase()); setAvail(null); setSigned(null); }} />
              <span className="yf-inputwrap__unit">@{domain}</span>
            </div>
            <p className="yf-field__hint">Lowercase letters, numbers and hyphens, 3 to 32 characters.</p>
            {handle && handleError && <p className="yf-error-text">{handleError}</p>}
          </div>
          {avail && (
            availOk ? <p className="yf-ok-text">{avail.status === 'verified' ? 'This handle already points to your wallet.' : `${handle}@${domain} has no YieldID record yet. It is free to claim.`}</p>
            : avail.status === 'dns_error' ? <p className="yf-error-text">DNS check failed: {avail.detail}. Try again in a minute.</p>
            : <p className="yf-error-text">{handle}@{domain} already points to another wallet. Pick another handle.</p>
          )}
          <div className="yf-row">
            <button type="button" className="yf-pillbtn yf-pillbtn--ghost" onClick={checkAvailability} disabled={!!handleError || busy === 'avail'}>{busy === 'avail' ? 'Checking…' : 'Check availability'}</button>
            <button type="button" className="yf-pillbtn yf-pillbtn--dark" onClick={() => setStep(1)} disabled={!!handleError || !availOk}>Next: add wallets {Icon.arrowRight(18)}</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="yf-panel" aria-labelledby="s2">
          <div>
            <h2 id="s2" className="yf-h2">Add wallets</h2>
            <p className="yf-small" style={{ marginTop: 6 }}>Every Solana wallet you add signs a short message proving it is yours. Only proven wallets go into the record.</p>
          </div>

          <div className="yf-stack" style={{ gap: 8 }}>
            <div className="yf-walletrow">
              <span className="yf-avatar">{(handle || 'Y').slice(0, 2).toUpperCase()}</span>
              <div className="yf-walletrow__main"><b>Primary · Solana</b><div className="yf-walletrow__addr">{address}</div></div>
              <span className="yf-badge yf-badge--success">Signed in</span>
            </div>
            {wallets.map((w, i) => (
              <div className="yf-walletrow" key={w.address}>
                <span className={`yf-avatar ${['yf-avatar--teal', 'yf-avatar--info', 'yf-avatar--amber'][i % 3]}`}>{w.address.slice(0, 2)}</span>
                <div className="yf-walletrow__main"><b>{w.label} · {w.chain}</b><div className="yf-walletrow__addr">{w.address}</div></div>
                {w.proven ? <span className="yf-badge yf-badge--success">Proven</span> : <span className="yf-badge yf-badge--unverified">Not signed</span>}
                <button type="button" className="yf-btn yf-btn--text" onClick={() => removeWallet(w.address)} aria-label={`Remove ${shortAddress(w.address)}`}>Remove</button>
              </div>
            ))}
            {candidates.map((w) => (
              <div className="yf-walletrow" key={w.address} style={{ border: '1px dashed var(--border-strong)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span className="yf-avatar">{w.standardWallet.icon ? <img src={w.standardWallet.icon} alt="" /> : 'W'}</span>
                <div className="yf-walletrow__main"><b>{w.standardWallet.name} · connected</b><div className="yf-walletrow__addr">{w.address}</div></div>
                <button type="button" className="yf-pillbtn yf-pillbtn--dark" style={{ minHeight: 44, padding: '0 20px' }} onClick={() => prove(w)} disabled={busy === w.address}>{busy === w.address ? 'Waiting…' : 'Sign to link'}</button>
              </div>
            ))}
          </div>

          <div className="yf-grid-2">
            <div className="yf-pastel yf-pastel--teal" style={{ alignItems: 'flex-start' }}>
              <span className="yf-pastel__icon">{Icon.wallet(24)}</span>
              <div className="yf-stack" style={{ gap: 10 }}>
                <span className="yf-pastel__body">Another Solana wallet<small>Switch account in Phantom (or open another wallet), connect it, then sign to link. Ledger works through Phantom.</small></span>
                <button type="button" className="yf-pillbtn yf-pillbtn--dark" style={{ alignSelf: 'flex-start', minHeight: 44 }} onClick={() => connectWallet({ walletChainType: 'solana-only', description: 'Connect the wallet you want to add. You will sign a message to link it.' })}>Connect wallet</button>
              </div>
            </div>
            <div className="yf-pastel yf-pastel--info" style={{ alignItems: 'flex-start' }}>
              <span className="yf-pastel__icon">{Icon.route(24)}</span>
              <div className="yf-stack" style={{ gap: 10, flex: 1, minWidth: 0 }}>
                <span className="yf-pastel__body">EVM address<small>For Base, Ethereum, Arbitrum and Hyperliquid routes. Listed as not signed until EVM signing is added.</small></span>
                <div className="yf-inputwrap" style={{ background: 'var(--surface)' }}>
                  <input className="yf-input" value={evmInput} onChange={(e) => setEvmInput(e.target.value.trim())} placeholder="0x…" aria-label="EVM address" spellCheck={false} />
                  <button type="button" className="yf-btn yf-btn--text" disabled={!evmInput || !!evmError} onClick={() => { addWallet({ chain: 'EVM', address: evmInput, label: 'EVM', proven: false }); setEvmInput(''); setSigned(null); }}>Add</button>
                </div>
                {evmError && <p className="yf-error-text">{evmError}</p>}
              </div>
            </div>
          </div>

          <div className="yf-row">
            <button type="button" className="yf-pillbtn yf-pillbtn--ghost" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="yf-pillbtn yf-pillbtn--dark" onClick={() => setStep(2)}>Next: sign the record {Icon.arrowRight(18)}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="yf-panel" aria-labelledby="s3">
          <div>
            <h2 id="s3" className="yf-h2">Sign the record</h2>
            <p className="yf-small" style={{ marginTop: 6 }}>Your primary wallet signs this text. It is a message, not a transaction: no fee, nothing moves.</p>
          </div>
          <pre className="yf-code">{`${recordName(handle, domain)}.  300  IN  TXT\n  "${body}; sig=[signature]"`}</pre>
          <dl className="yf-kv">
            <dt>sol</dt><dd>{address}</dd>
            {altSol.length > 0 && <><dt>alt</dt><dd>{altSol.map((a) => a.address).join(', ')} · each with its own link signature</dd></>}
            {evm && <><dt>evm, hl</dt><dd>{evm} · not signed by that key</dd></>}
          </dl>
          <div className="yf-row">
            <button type="button" className="yf-pillbtn yf-pillbtn--ghost" onClick={() => setStep(1)}>Back</button>
            {primaryWallet ? (
              <button type="button" className="yf-pillbtn yf-pillbtn--ember" onClick={signRecord} disabled={busy === 'sign' || !!handleError}>{busy === 'sign' ? 'Waiting for wallet…' : 'Sign record'}</button>
            ) : (
              <button type="button" className="yf-pillbtn yf-pillbtn--dark" onClick={() => connectWallet({ walletChainType: 'solana-only', description: `Reconnect ${shortAddress(address)} to sign.` })}>Reconnect {shortAddress(address)} to sign</button>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="yf-panel" aria-labelledby="s4">
          <div>
            <h2 id="s4" className="yf-h2">Publish and verify</h2>
            <p className="yf-small" style={{ marginTop: 6 }}>Add one TXT record at your DNS provider (Cloudflare, Namecheap, Route 53…) for {domain}, then check it here.</p>
          </div>
          {signed ? (
            <>
              <div className="yf-fields">
                <CopyField label="Type" value="TXT" />
                <CopyField label="Name / Host" value={`_yid.${handle}`} />
              </div>
              <CopyField label={`Value${chunkTxt(signed).length > 1 ? ' (your provider splits it into 255-character strings)' : ''}`} value={signed} />
              <details>
                <summary className="yf-small" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Zone-file line</summary>
                <pre className="yf-code">{zoneLine(handle, domain, signed)}</pre>
              </details>
            </>
          ) : (
            <p className="yf-small">Sign the record first.</p>
          )}
          {check && (
            <div className={`yf-verdict ${check.status === 'verified' && check.addresses?.sol === address ? 'yf-verdict--passed' : 'yf-verdict--refused'}`} role="status">
              {check.status === 'verified' && check.addresses?.sol === address ? (
                <p className="yf-ok-text"><b>Verified.</b> {handle}@{domain} resolves to your wallets and the signature is valid.</p>
              ) : check.status === 'not_found' || check.status === 'no_yid_record' ? (
                <p className="yf-small"><b>Not found yet.</b> No record at {check.name}. DNS can take a few minutes; check again shortly.</p>
              ) : check.status === 'bad_signature' ? (
                <p className="yf-error-text"><b>Signature invalid.</b> Replace the record with the value above.</p>
              ) : (
                <p className="yf-error-text"><b>Check failed.</b> {check.detail ?? check.status}. {check.fix ?? ''}</p>
              )}
            </div>
          )}
          <div className="yf-row">
            <button type="button" className="yf-pillbtn yf-pillbtn--ghost" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="yf-pillbtn yf-pillbtn--dark" onClick={verify} disabled={!signed || busy === 'verify'}>{busy === 'verify' ? 'Checking DNS…' : 'Check DNS'}</button>
            {savedHandle && savedHandle === handle && <Link className="yf-pillbtn yf-pillbtn--ember" href="/add-crypto">Next: add crypto {Icon.arrowRight(18)}</Link>}
          </div>
        </section>
      )}

      <Disclaimer>A YieldID is a name, not an account. It holds nothing and grants nothing. Funds stay in the wallets it points to.</Disclaimer>
    </>
  );
}
