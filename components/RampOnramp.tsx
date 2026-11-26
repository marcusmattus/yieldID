'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { shortAddress } from '@/lib/base58';
import { RAMP_CHAINS, RAMP_FINAL, rampSetup, rampStatusLabel, rampWidgetConfig, type RampChain } from '@/lib/ramp';
import { useAppState } from '@/lib/store';

interface Tracked {
  id: string;
  token: string;
  apiUrl: string;
  status: string;
  amount: string;
  symbol: string;
  receiver: string;
  tx: string | null;
  error: string | null;
}

// NEXT_PUBLIC_* values are inlined at build time, so read them by name.
const SETUP = rampSetup({
  NEXT_PUBLIC_RAMP_HOST_API_KEY: process.env.NEXT_PUBLIC_RAMP_HOST_API_KEY,
  NEXT_PUBLIC_RAMP_ENV: process.env.NEXT_PUBLIC_RAMP_ENV,
});

type RampPurchase = { id: string; status: string; cryptoAmount: string; receiverAddress: string; finalTxHash?: string; asset: { symbol: string; decimals: number } };

function amountOf(p: RampPurchase): string {
  return (Number(p.cryptoAmount) / 10 ** p.asset.decimals).toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

/**
 * Card or bank → USDC through Ramp Network, delivered to the user's own
 * address. After a purchase starts, its status is read back from Ramp with the
 * purchase's own view token, so the user can follow it here.
 */
export function RampOnramp({ solanaAddress }: { solanaAddress: string }) {
  const { wallets } = useAppState();
  const evm = wallets.find((w) => w.chain === 'EVM')?.address ?? null;
  const chains = RAMP_CHAINS[SETUP.env];
  const [chain, setChain] = useState<RampChain>(chains[0]);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const receiver = chain === 'solana' ? solanaAddress : evm;
  const blocked = SETUP.blocked ?? (receiver ? null : 'Add an EVM address in the YieldID maker to receive USDC on Base.');

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const webhook = useMemo(() => (origin.startsWith('https://') ? `${origin}/api/ramp/webhook` : undefined), [origin]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function poll(t: Pick<Tracked, 'id' | 'token' | 'apiUrl'>) {
    try {
      const r = await fetch(`${t.apiUrl}/host-api/purchase/${encodeURIComponent(t.id)}?secret=${encodeURIComponent(t.token)}`);
      if (!r.ok) throw new Error(`Ramp returned ${r.status}`);
      const p = (await r.json()) as RampPurchase;
      setTracked((cur) => cur && { ...cur, status: p.status, amount: amountOf(p), tx: p.finalTxHash ?? null, error: null });
      if (RAMP_FINAL.has(p.status) && timer.current) clearInterval(timer.current);
    } catch (e) {
      setTracked((cur) => cur && { ...cur, error: `Could not read the status from Ramp: ${(e as Error).message}. Retrying.` });
    }
  }

  async function open() {
    if (blocked || !receiver) return;
    setError(null);
    setOpening(true);
    try {
      const { RampInstantSDK, RampInstantEventTypes } = await import('@ramp-network/ramp-instant-sdk');
      const config = rampWidgetConfig({
        setup: SETUP,
        chain,
        userAddress: receiver,
        hostAppName: 'YieldID',
        hostLogoUrl: `${origin}/brand/yieldid-mark-256.png`,
        webhookStatusUrl: webhook,
      });
      new RampInstantSDK(config as ConstructorParameters<typeof RampInstantSDK>[0])
        .on(RampInstantEventTypes.PURCHASE_CREATED, (event) => {
          const { purchase, purchaseViewToken, apiUrl } = (event as { payload: { purchase: RampPurchase; purchaseViewToken: string; apiUrl: string } }).payload;
          const t: Tracked = {
            id: purchase.id, token: purchaseViewToken, apiUrl, status: purchase.status, amount: amountOf(purchase),
            symbol: purchase.asset.symbol, receiver: purchase.receiverAddress, tx: purchase.finalTxHash ?? null, error: null,
          };
          setTracked(t);
          if (timer.current) clearInterval(timer.current);
          timer.current = setInterval(() => poll(t), 10_000);
        })
        .on(RampInstantEventTypes.WIDGET_CONFIG_FAILED, () => setError('Ramp rejected the widget configuration. Check the host API key and environment.'))
        .show();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="yf-stack">
      <p className="yf-small">
        Ramp Network takes a card, Apple Pay, Google Pay or bank transfer and sends USDC straight to your own address. Ramp runs the identity checks; YieldID never sees your card or documents and never holds the funds.
      </p>

      <div className="yf-row" role="radiogroup" aria-label="Receive USDC on">
        {(['solana', 'base'] as const).map((c) => {
          const available = chains.includes(c);
          return (
            <label key={c} className="yf-pill" aria-disabled={!available} style={{ opacity: available ? 1 : 0.5, cursor: available ? 'pointer' : 'not-allowed' }}>
              <input type="radio" name="ramp-chain" value={c} checked={chain === c} disabled={!available} onChange={() => setChain(c)} />{' '}
              USDC on <b>{c === 'solana' ? 'Solana' : 'Base'}</b>
              {!available && ' · not in Ramp’s test environment'}
            </label>
          );
        })}
      </div>

      <dl className="yf-kv">
        <dt>Delivered to</dt>
        <dd className="yf-mono">{receiver ? shortAddress(receiver) : 'No EVM address linked'}</dd>
        <dt>Environment</dt>
        <dd>{SETUP.env === 'production' ? 'Ramp production' : 'Ramp test environment (Base Sepolia test USDC, no real money)'}</dd>
      </dl>

      <button type="button" className="yf-pillbtn yf-pillbtn--ember" style={{ alignSelf: 'flex-start', opacity: blocked ? 0.45 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }} onClick={open} disabled={!!blocked || opening}>
        {Icon.globe(18)} {opening ? 'Opening Ramp…' : 'Buy USDC with Ramp'}
      </button>
      {blocked && <p className="yf-warn" role="note">{blocked}</p>}
      {error && <p className="yf-error-text" role="alert">{error}</p>}

      {tracked && (
        <section className="yf-panel" aria-live="polite" aria-labelledby="ramp-track-h" style={{ padding: 16 }}>
          <h3 id="ramp-track-h" className="yf-sec-title">Your Ramp purchase</h3>
          <dl className="yf-kv">
            <dt>Status</dt><dd><b>{rampStatusLabel(tracked.status)}</b></dd>
            <dt>Amount</dt><dd>{tracked.amount} {tracked.symbol}</dd>
            <dt>To</dt><dd className="yf-mono">{shortAddress(tracked.receiver)}</dd>
            <dt>Purchase</dt><dd className="yf-mono">{tracked.id}</dd>
            {tracked.tx && (<><dt>Transaction</dt><dd className="yf-mono">{shortAddress(tracked.tx)}</dd></>)}
          </dl>
          {tracked.error && <p className="yf-error-text">{tracked.error}</p>}
          {!RAMP_FINAL.has(tracked.status) && <p className="yf-fine">Rechecking with Ramp every 10 s. The balance above updates when the USDC lands.</p>}
        </section>
      )}

      <p className="yf-fine">Fees, limits and payment methods depend on your country and are shown by Ramp before you pay. Purchases can take a few minutes after payment.</p>
    </div>
  );
}
