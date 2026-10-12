'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useSignMessage, useWallets } from '@privy-io/react-auth/solana';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OnboardNav } from '@/components/Nav';
import { Disclaimer } from '@/components/ui';
import { bytesToBase58 } from '@/lib/base58';
import { buildSiwsMessage, SIWS_STATEMENT } from '@/lib/siws';

type Nonce = { nonce: string; domain: string; uri: string; issuedAt: string; expirationTime: string; chainId: 'mainnet' | 'devnet' };

export default function SignPage() {
  const router = useRouter();
  const { ready } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signMessage } = useSignMessage();
  const wallet = wallets[0];
  const [n, setN] = useState<Nonce | null>(null);
  const [error, setError] = useState<{ reason: string; fix: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    fetch('/api/siws/nonce', { method: 'POST' })
      .then((r) => r.json())
      .then(setN)
      .catch(() => setError({ reason: 'Could not get a sign-in nonce from the server.', fix: 'Check your connection and reload.' }));
  }, [wallet?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const message =
    wallet && n
      ? buildSiwsMessage({ domain: n.domain, address: wallet.address, statement: SIWS_STATEMENT, uri: n.uri, version: '1', chainId: n.chainId, nonce: n.nonce, issuedAt: n.issuedAt, expirationTime: n.expirationTime })
      : null;

  async function sign() {
    if (!wallet || !message) return;
    setBusy(true);
    setError(null);
    try {
      const { signature } = await signMessage({ message: new TextEncoder().encode(message), wallet, options: { uiOptions: { title: 'Sign to verify' } } });
      const res = await fetch('/api/siws/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, signature: bytesToBase58(signature), address: wallet.address }),
      });
      const out = await res.json();
      if (!out.ok) {
        setError({ reason: out.reason, fix: out.fix });
        return;
      }
      router.replace('/claim');
    } catch (e) {
      setError({ reason: `The wallet did not sign: ${(e as Error).message}`, fix: 'Approve the message in your wallet, or choose Use a different wallet.' });
    } finally {
      setBusy(false);
    }
  }

  async function switchWallet() {
    await wallet?.disconnect().catch(() => undefined);
    router.replace('/');
  }

  if (ready && walletsReady && !wallet) {
    return (
      <div className="yf-page yf-page--narrow">
        <OnboardNav address={null} />
        <div className="yf-state">
          <h1 className="yf-state__title">No wallet connected</h1>
          <p className="yf-state__body">Connect a Solana wallet first. The sign-in message is built for the address you connect.</p>
          <Link className="yf-btn yf-btn--primary" href="/">Connect wallet</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="yf-page">
      <OnboardNav address={wallet?.address ?? null} verified={false} />
      <header>
        <p className="yf-eyebrow" style={{ margin: 0 }}>Step 2 of 3 · {wallet?.standardWallet.name ?? 'Wallet'}</p>
        <h1 className="yf-h1">Sign to verify</h1>
        <p className="yf-lede">
          Read the message below. It is exactly what your wallet will show. Signing it proves you hold the key for this
          address. It is not a transaction: no fee, no allowance, nothing leaves your wallet.
        </p>
      </header>

      <div className="yf-split">
        <section className="yf-stack" aria-labelledby="msg-h">
          <div className="yf-head">
            <h2 id="msg-h" className="yf-h2">Sign-in-with-Solana message</h2>
            <button
              className="yf-btn yf-btn--text"
              type="button"
              disabled={!message}
              onClick={() => message && navigator.clipboard.writeText(message).then(() => setCopied(true))}
            >
              {copied ? 'Copied' : 'Copy message'}
            </button>
          </div>
          <pre className="yf-code" aria-live="polite">{message ?? 'Preparing message…'}</pre>
          <p className="yf-fine">On a Ledger, check that the device shows the same text, line for line, before you approve. If it shows a transaction instead, reject it.</p>
        </section>

        <aside className="yf-stack-6">
          <section className="yf-card yf-stack" aria-labelledby="does-h">
            <h2 id="does-h" className="yf-h2">What this signature does</h2>
            <dl className="yf-kv">
              <dt>Proves</dt><dd>You hold {wallet?.address ?? '[address]'}</dd>
              <dt>Fee</dt><dd>None</dd>
              <dt>Allowance</dt><dd>None granted</dd>
              <dt>Delegate</dt><dd>None added</dd>
              <dt>Nonce</dt><dd>Single use · {n?.nonce ?? '…'}</dd>
              <dt>Expires</dt><dd>{n ? new Date(n.expirationTime).toLocaleTimeString('en-GB') : '…'}</dd>
            </dl>
          </section>
          <section className="yf-card yf-stack" aria-labelledby="not-h">
            <h2 id="not-h" className="yf-h2">What it does not do</h2>
            <p className="yf-small">It does not let YieldID, Signal or any agent move funds. Every move later on is a separate transaction that you read and sign.</p>
          </section>
        </aside>
      </div>

      {error && (
        <div className="yf-verdict yf-verdict--refused" role="alert">
          <p className="yf-error-text"><b>Sign-in failed.</b> {error.reason}</p>
          <p className="yf-small">{error.fix}</p>
        </div>
      )}

      <div className="yf-row">
        <button className="yf-btn yf-btn--primary" type="button" onClick={sign} disabled={!message || busy}>
          {busy ? 'Waiting for wallet…' : 'Sign message'}
        </button>
        <button className="yf-btn yf-btn--secondary" type="button" onClick={switchWallet}>Use a different wallet</button>
      </div>

      <Disclaimer>YieldID reads rates and builds transactions for you to sign; it does not hold funds or sign for you.</Disclaimer>
    </div>
  );
}
