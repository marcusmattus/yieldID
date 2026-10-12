'use client';

import { useFundWallet } from '@privy-io/react-auth/solana';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { DataStatus, Disclaimer } from '@/components/ui';
import { fmtUsdc, USDC_MINT, useBalances } from '@/lib/solana';

type Tab = 'exchange' | 'bridge' | 'card';

export function AddCryptoView({ address }: { address: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('exchange');
  const [copied, setCopied] = useState<string | null>(null);
  const [fundError, setFundError] = useState<string | null>(null);
  const { state: bal, read } = useBalances(address, 15_000);
  const { fundWallet } = useFundWallet();
  const first = useRef<number | null>(null);

  useEffect(() => {
    QRCode.toDataURL(address, { margin: 0, width: 344, color: { dark: '#14201a', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [address]);

  if (bal.kind === 'ready' && first.current === null) first.current = bal.usdc;
  const arrived = bal.kind === 'ready' && first.current !== null && bal.usdc > first.current ? bal.usdc - first.current : 0;

  const copy = (label: string, v: string) => navigator.clipboard.writeText(v).then(() => setCopied(label));

  async function buy() {
    setFundError(null);
    try {
      await fundWallet({ address });
    } catch (e) {
      setFundError(`The funding flow did not open: ${(e as Error).message}. Enable a funding method for Solana in the Privy dashboard, or use an exchange.`);
    }
  }

  return (
    <>
      <header>
        <p className="yf-sec-title">Add crypto</p>
        <h1 className="yf-bignum" style={{ fontSize: 'clamp(36px, 5vw, 64px)' }}>Send USDC on Solana</h1>
        <p className="yf-lede">It lands in your own wallet. YieldID never takes custody; it only reads the balance so you can see it arrive.</p>
      </header>

      <div className="yf-home">
        <section className="yf-panel" aria-labelledby="addr-h">
          <h2 id="addr-h" className="yf-h2">Your Solana address</h2>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="yf-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr ? <img src={qr} alt={`QR code for ${address}`} /> : <div className="yf-skeleton" style={{ height: '100%' }} />}
            </div>
            <div className="yf-stack" style={{ flex: '1 1 260px', minWidth: 0 }}>
              <p className="yf-mono" style={{ margin: 0, fontSize: 15, lineHeight: '24px', overflowWrap: 'anywhere' }}>{address}</p>
              <button type="button" className="yf-pillbtn yf-pillbtn--dark" style={{ alignSelf: 'flex-start' }} onClick={() => copy('addr', address)}>
                {copied === 'addr' ? Icon.check(18) : Icon.copy(18)} {copied === 'addr' ? 'Address copied' : 'Copy address'}
              </button>
              <dl className="yf-kv">
                <dt>Network</dt><dd>Solana</dd>
                <dt>Token</dt><dd>USDC · mint {USDC_MINT.slice(0, 4)}…{USDC_MINT.slice(-4)}</dd>
              </dl>
            </div>
          </div>
          <div className="yf-warn" role="note">
            <b>Send only on the Solana network.</b> USDC sent on Ethereum, Base, Tron or BNB Chain to this address will not arrive here and may be lost. Keep a little SOL for fees.
          </div>
        </section>

        <section className="yf-panel" aria-labelledby="live-h" aria-live="polite">
          <div className="yf-sec-head" style={{ marginBottom: 0 }}>
            <h2 id="live-h" className="yf-sec-title">Balance in this wallet</h2>
            <button type="button" className="yf-btn yf-btn--text" onClick={read}>Read now</button>
          </div>
          {bal.kind === 'loading' && <div className="yf-skeleton" style={{ height: 72, borderRadius: 16 }} />}
          {bal.kind === 'error' && <p className="yf-error-text">Balance read failed: {bal.reason}. Read again, or set a dedicated Solana RPC.</p>}
          {bal.kind === 'ready' && (() => {
            const f = fmtUsdc(bal.usdc);
            return (
              <>
                <p className="yf-bignum" style={{ fontSize: 'clamp(40px, 5vw, 72px)', margin: 0 }}>{f.whole}<small>.{f.cents} USDC</small></p>
                <p className="yf-small">{bal.sol.toFixed(4)} SOL for fees</p>
                <DataStatus status={{ kind: 'live', at: bal.at }}><span>Rechecks every 15 s</span></DataStatus>
                {arrived > 0 && <p className="yf-ok-text" role="status"><b>Arrived:</b> +{arrived.toFixed(2)} USDC since you opened this page.</p>}
              </>
            );
          })()}
        </section>
      </div>

      <section className="yf-panel" aria-labelledby="how-h">
        <div className="yf-head">
          <h2 id="how-h" className="yf-h2">Three ways to get USDC here</h2>
          <div className="yf-tabs" role="tablist" aria-label="Funding method">
            {([['exchange', 'From an exchange'], ['bridge', 'Bridge from EVM'], ['card', 'Card or bank']] as const).map(([k, l]) => (
              <button key={k} role="tab" type="button" aria-selected={tab === k} aria-controls={`panel-${k}`} id={`tab-${k}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </div>

        {tab === 'exchange' && (
          <div role="tabpanel" id="panel-exchange" aria-labelledby="tab-exchange" className="yf-stack">
            <ol className="yf-howto">
              <li>In your exchange (Coinbase, Kraken, Binance…), open <b>Withdraw</b> and choose <b>USDC</b>.</li>
              <li>Choose the <b>Solana</b> network. If you only see ERC-20 or another chain, stop: it will not arrive here.</li>
              <li>Paste your address from above. Send a small test amount first.</li>
              <li>Watch the balance on this page. It updates within a minute of the exchange broadcasting.</li>
            </ol>
          </div>
        )}
        {tab === 'bridge' && (
          <div role="tabpanel" id="panel-bridge" aria-labelledby="tab-bridge" className="yf-stack">
            <ol className="yf-howto">
              <li>Hold USDC on Base, Ethereum or Arbitrum in an EVM wallet.</li>
              <li>Use a bridge that supports Circle&apos;s CCTP (burn on the source chain, native USDC minted on Solana) to avoid wrapped tokens.</li>
              <li>Set the destination to your Solana address above. Expect two signatures: one on the source chain, one on Solana.</li>
              <li>Check the received token is native USDC (mint {USDC_MINT.slice(0, 4)}…{USDC_MINT.slice(-4)}), then watch it arrive here.</li>
            </ol>
            <p className="yf-fine">Bridges can fail or pause. A one-off bridge cost is spread over your horizon on the Signal board, like any move.</p>
          </div>
        )}
        {tab === 'card' && (
          <div role="tabpanel" id="panel-card" aria-labelledby="tab-card" className="yf-stack">
            <p className="yf-small">Privy opens its on-ramp partners. They run identity checks and send the crypto straight to your address; YieldID never sees your card or documents.</p>
            <button type="button" className="yf-pillbtn yf-pillbtn--ember" style={{ alignSelf: 'flex-start' }} onClick={buy}>{Icon.globe(18)} Buy with card or bank</button>
            {fundError && <p className="yf-error-text" role="alert">{fundError}</p>}
            <p className="yf-fine">Availability, fees and limits depend on your country and the partner. Funds can take a few minutes to arrive.</p>
          </div>
        )}
      </section>

      <Disclaimer>Check the network every time you send. Crypto sent to the wrong network or address usually cannot be recovered, by us or anyone.</Disclaimer>
    </>
  );
}
