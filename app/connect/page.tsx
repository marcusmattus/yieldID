'use client';

import { usePrivy, type WalletListEntry } from '@privy-io/react-auth';
import { useStandardWallets, useWallets } from '@privy-io/react-auth/solana';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { OnboardNav } from '@/components/Nav';
import { Disclaimer } from '@/components/ui';

const KNOWN: Record<string, WalletListEntry> = {
  phantom: 'phantom',
  solflare: 'solflare',
  backpack: 'backpack',
  jupiter: 'jupiter',
};

function entryFor(name: string): WalletListEntry {
  return KNOWN[name.toLowerCase().split(' ')[0]] ?? 'detected_solana_wallets';
}

export default function ConnectPage() {
  const router = useRouter();
  const { ready, connectWallet, login } = usePrivy();
  const { wallets: connected } = useWallets();
  const { wallets: standard } = useStandardWallets();

  // Already signed in: go straight to the forge.
  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((s: { address: string | null }) => {
        if (s.address) router.replace('/forge');
      })
      .catch(() => undefined);
  }, [router]);

  // A Solana wallet is connected: next step is the sign-in message.
  useEffect(() => {
    if (connected.length > 0) router.push('/sign');
  }, [connected.length, router]);

  const detected = useMemo(() => standard.filter((w) => (w as { isPrivyWallet?: boolean }).isPrivyWallet !== true && !/privy/i.test(w.name)), [standard]);
  const phantomDetected = detected.some((w) => w.name.toLowerCase().startsWith('phantom'));

  const open = (entry: WalletListEntry) =>
    connectWallet({ walletChainType: 'solana-only', walletList: [entry], description: 'Connecting reads your public key. It is not a transaction.' });

  return (
    <div className="yf-page yf-page--narrow">
      <OnboardNav address={null} />
      <Link href="/" className="yf-btn yf-btn--text" style={{ alignSelf: 'flex-start' }}>← Back to the overview</Link>

      <header>
        <p className="yf-eyebrow" style={{ margin: 0 }}>Step 1 of 2</p>
        <h1 className="yf-h1">Connect wallet</h1>
        <p className="yf-lede">
          YieldID names your wallet, watches stable venues and proposes switches between yield pots. Funds stay in your
          wallet or at the venue you sign into. YieldForge is never in the path.
        </p>
      </header>

      <section className="yf-card yf-stack" aria-labelledby="read-h">
        <h2 id="read-h" className="yf-h2">Connecting is a public-key read</h2>
        <dl className="yf-kv">
          <dt>Reads</dt><dd>Your public key</dd>
          <dt>Does not</dt><dd>Send a transaction, request an allowance, add a delegate, or charge a fee</dd>
          <dt>Next</dt><dd>You sign a plain-text message to prove you hold the key</dd>
        </dl>
      </section>

      <section className="yf-stack" aria-labelledby="det-h">
        <h2 id="det-h" className="yf-eyebrow" style={{ margin: 0 }}>Solana wallets in this browser</h2>
        {!ready && <p className="yf-small" aria-live="polite">Looking for wallets…</p>}
        <ul className="yf-wallets">
          {detected.map((w) => (
            <li key={w.name}>
              <button className="yf-wallet" type="button" onClick={() => open(entryFor(w.name))} disabled={!ready}>
                <span className="yf-wallet__icon">
                  {/* The wallet's own icon, supplied by its extension through the Wallet Standard. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.icon} alt="" />
                </span>
                <span className="yf-wallet__name">
                  {w.name}
                  <span className="yf-wallet__kind">Browser extension · Solana</span>
                </span>
                <span className="yf-wallet__state"><span className="yf-badge yf-badge--success">Detected</span></span>
              </button>
            </li>
          ))}
          {!phantomDetected && (
            <li>
              <a className="yf-wallet yf-wallet--absent" href="https://phantom.com/download" target="_blank" rel="noreferrer">
                <span className="yf-wallet__icon" aria-hidden="true">P</span>
                <span className="yf-wallet__name">
                  Phantom
                  <span className="yf-wallet__kind">Opens phantom.com to install</span>
                </span>
                <span className="yf-wallet__state"><span className="yf-badge">Not installed</span></span>
              </a>
            </li>
          )}
          <li>
            <button className="yf-wallet" type="button" onClick={() => open('wallet_connect_qr_solana')} disabled={!ready}>
              <span className="yf-wallet__icon" aria-hidden="true">QR</span>
              <span className="yf-wallet__name">
                Mobile wallet
                <span className="yf-wallet__kind">Scan a QR code with Phantom or Solflare on your phone</span>
              </span>
              <span className="yf-wallet__state"><span className="yf-badge">QR</span></span>
            </button>
          </li>
        </ul>
      </section>

      <section className="yf-stack" aria-labelledby="hw-h">
        <h2 id="hw-h" className="yf-eyebrow" style={{ margin: 0 }}>Hardware</h2>
        <ul className="yf-wallets">
          <li>
            <button className="yf-wallet" type="button" onClick={() => open('phantom')} disabled={!ready}>
              <span className="yf-wallet__icon" aria-hidden="true">L</span>
              <span className="yf-wallet__name">
                Ledger
                <span className="yf-wallet__kind">Through Phantom: connect the Ledger in Phantom first, with the Solana app open</span>
              </span>
              <span className="yf-wallet__state"><span className="yf-badge yf-badge--info">Hardware</span></span>
            </button>
          </li>
        </ul>
      </section>

      <p className="yf-small">
        No wallet?{' '}
        <button type="button" className="yf-btn yf-btn--text" onClick={() => login({ loginMethods: ['email'] })} disabled={!ready}>
          Continue with email
        </button>{' '}
        through Privy. It creates an embedded Solana wallet whose key you can export at any time.
      </p>

      <Disclaimer />
    </div>
  );
}
