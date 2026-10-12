import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Brand } from '@/components/ui';

export const metadata = {
  title: 'YieldID · One name for your wallets. Every stable ranked net.',
};

function ConnectButton({ tone = 'dark' }: { tone?: 'dark' | 'ember' }) {
  return (
    <Link href="/connect" className={`yf-pillbtn yf-pillbtn--${tone}`}>
      {Icon.wallet(20)} Connect wallet
    </Link>
  );
}

export default function Landing() {
  return (
    <div className="yf-landbg">
      <div className="yf-land">
        <header className="yf-land__nav">
          <Link href="/" aria-label="YieldID home" style={{ textDecoration: 'none' }}><Brand /></Link>
          <nav aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#net">Ranked net</a>
            <a href="#yid">YieldID maker</a>
            <a href="#crypto">Add crypto</a>
          </nav>
          <ConnectButton />
        </header>

        <section className="yf-hero" aria-labelledby="hero-h">
          <div>
            <span className="yf-badge yf-badge--forge">Colosseum Arena · Solana + Hyperliquid</span>
            <h1 id="hero-h">One name for your wallets. Every stable <em>ranked net.</em></h1>
            <p className="lede">
              YieldID names your wallets, watches stablecoin venues and proposes a switch only when it pays after the cost of moving. You sign every move. We never hold a coin.
            </p>
            <div className="yf-row" style={{ gap: 12 }}>
              <ConnectButton tone="ember" />
              <a href="#how" className="yf-pillbtn yf-pillbtn--ghost">See how it works</a>
            </div>
            <p className="yf-fine" style={{ marginTop: 16 }}>Connecting is a public-key read. No transaction, no allowance, no fee.</p>
          </div>

          <div className="yf-preview" aria-label="Preview of the YieldID app with sample data">
            <div className="yf-preview__rail" aria-hidden="true">
              {Icon.home(20)}{Icon.id(20)}{Icon.wallet(20)}{Icon.signal(20)}{Icon.policy(20)}
            </div>
            <div className="yf-preview__card yf-sample-region" style={{ border: '1px solid var(--status-sample)' }}>
              <div className="yf-status"><span className="yf-badge yf-badge--sample"><span className="yf-badge__dot" aria-hidden="true" />Illustrative sample data</span></div>
              <div className="yf-head">
                <div className="yf-seg" aria-hidden="true"><a aria-current="page">Earn</a><a>Build</a></div>
                <span className="yf-chip"><span className="yf-chip__mark" aria-hidden="true" />[handle]@[domain]</span>
              </div>
              <p className="yf-sec-title">Capital across sleeves</p>
              <p className="yf-bignum" style={{ fontSize: 'clamp(40px, 5vw, 64px)', margin: 0 }}>100,000<small>.00 USDC</small></p>
              <div className="yf-circles" style={{ marginTop: 4, gap: 14 }} aria-hidden="true">
                {[['Add crypto', 'arrowDown'], ['Add wallet', 'plus'], ['Route', 'route']].map(([l, i]) => (
                  <span key={l} className="yf-circle"><span className="yf-circle__btn" style={{ width: 56, height: 56 }}>{Icon[i as keyof typeof Icon](20)}</span>{l}</span>
                ))}
                <span className="yf-circle yf-circle--accent"><span className="yf-circle__btn" style={{ width: 56, height: 56 }}>{Icon.signal(20)}</span>Signal</span>
              </div>
              <div className="yf-rows">
                <div className="yf-rowcard yf-rowcard--hot" style={{ gridTemplateColumns: '1.4fr repeat(3, 1fr)' }}>
                  <span><b>Venue B</b><br /><span className="yf-fine">Best net · meets rule</span></span>
                  <span className="num">7.00%<br /><span className="yf-fine">gross</span></span>
                  <span className="num">6.39%<br /><span className="yf-fine">net</span></span>
                  <span className="num">+139 bp<br /><span className="yf-fine">edge</span></span>
                </div>
                <div className="yf-rowcard" style={{ gridTemplateColumns: '1.4fr repeat(3, 1fr)', background: 'var(--surface-sunken)' }}>
                  <span><b>Venue A</b><br /><span className="yf-fine">Highest gross</span></span>
                  <span className="num">9.00%<br /><span className="yf-fine">gross</span></span>
                  <span className="num">5.35%<br /><span className="yf-fine">net</span></span>
                  <span className="num">+35 bp<br /><span className="yf-fine">edge</span></span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="yf-band" aria-labelledby="how-h">
          <div className="yf-head">
            <h2 id="how-h">From wallet to watched yield in four steps</h2>
            <ConnectButton />
          </div>
          <div className="yf-stepcards">
            <article className="yf-stepcard"><b>01</b><h3>Connect wallet</h3><p>Phantom, Solflare, Backpack, a Ledger through Phantom, or email through Privy. A public-key read.</p></article>
            <article className="yf-stepcard"><b>02</b><h3>Make your YieldID</h3><p>Pick a handle, add every wallet you route from, and sign one record that anyone can check in DNS.</p></article>
            <article className="yf-stepcard"><b>03</b><h3>Add crypto</h3><p>Send USDC on Solana from an exchange, bridge it from Base or Ethereum, or buy with a card through Privy.</p></article>
            <article className="yf-stepcard"><b>04</b><h3>Let Signal watch</h3><p>Set your edge and horizon. Signal proposes a switch with every check shown; you sign or ignore it.</p></article>
          </div>
        </section>

        <section id="net" className="yf-band" aria-labelledby="net-h">
          <div>
            <h2 id="net-h">The highest rate is often the worst move</h2>
            <p className="yf-lede">A rate is paid per year. Moving is paid once. YieldID spreads the move over how long you will stay, then ranks by what is left.</p>
          </div>
          <p className="yf-formula">net = gross − (moveCost × 365 ÷ horizonDays)</p>
          <div className="yf-sample-region">
            <div className="yf-status"><span className="yf-badge yf-badge--sample"><span className="yf-badge__dot" aria-hidden="true" />Illustrative sample data</span><span>30-day horizon, round figures.</span></div>
            <div className="yf-compare">
              <div>
                <p className="yf-sec-title">Venue A · higher gross</p>
                <dl className="yf-math" style={{ marginTop: 12 }}>
                  <div><dt>Gross</dt><dd>9.00%</dd></div>
                  <div><dt>Move 0.30% × 365 ÷ 30</dt><dd>3.65%</dd></div>
                  <div><dt>Net</dt><dd>5.35%</dd></div>
                  <div><dt>Rank</dt><dd>3rd</dd></div>
                </dl>
              </div>
              <div>
                <p className="yf-sec-title">Venue B · lower gross</p>
                <dl className="yf-math" style={{ marginTop: 12 }}>
                  <div><dt>Gross</dt><dd>7.00%</dd></div>
                  <div><dt>Move 0.05% × 365 ÷ 30</dt><dd>0.61%</dd></div>
                  <div><dt>Net</dt><dd>6.39%</dd></div>
                  <div><dt>Rank</dt><dd>1st</dd></div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section id="yid" className="yf-band yf-band--dark" aria-labelledby="yid-h">
          <div className="yf-hero" style={{ gap: 32 }}>
            <div>
              <h2 id="yid-h">Your wallets, under one name anyone can verify</h2>
              <p className="yf-lede" style={{ marginTop: 16 }}>
                Add your Solana wallets, link an EVM address for Base and Hyperliquid, and sign one record. Each extra wallet signs too, so the name only lists wallets that are provably yours.
              </p>
              <div style={{ marginTop: 24 }}><ConnectButton tone="ember" /></div>
            </div>
            <pre className="yf-code" style={{ background: '#0a100e', color: '#edefe9', borderColor: '#243029' }}>{`_yid.[handle].[domain].  300  IN  TXT
  "v=yid1;
   sol=[address];
   alt=[address],[address];
   evm=[address];
   sig=[signature]"`}</pre>
          </div>
        </section>

        <section id="crypto" className="yf-band" aria-labelledby="crypto-h">
          <h2 id="crypto-h">Three ways to add crypto</h2>
          <div className="yf-grid-3">
            <a className="yf-pastel yf-pastel--teal" href="/connect"><span className="yf-pastel__icon">{Icon.arrowDown(24)}</span><span className="yf-pastel__body">From an exchange<small>Withdraw USDC on the Solana network to your address.</small></span></a>
            <a className="yf-pastel yf-pastel--info" href="/connect"><span className="yf-pastel__icon">{Icon.route(24)}</span><span className="yf-pastel__body">Bridge from Base or Ethereum<small>Move USDC with Circle&apos;s burn-and-mint transfer.</small></span></a>
            <a className="yf-pastel yf-pastel--ember" href="/connect"><span className="yf-pastel__icon">{Icon.globe(24)}</span><span className="yf-pastel__body">Card or bank<small>Buy through Privy&apos;s on-ramp partners, straight to your wallet.</small></span></a>
          </div>
        </section>

        <section className="yf-band yf-band--dark" aria-labelledby="cta-h" style={{ alignItems: 'flex-start' }}>
          <h2 id="cta-h">Open the app</h2>
          <p className="yf-lede" style={{ margin: 0 }}>Connect a wallet, make your YieldID, and see your stables ranked net.</p>
          <ConnectButton tone="ember" />
        </section>

        <p className="yf-disclaimer">
          Yield is not fixed and can fall to zero. Venues, bridges and stable issuers can fail, pause withdrawals or freeze assets. YieldID shows rates it has read and builds transactions for you to sign; it does not hold funds or sign for you. Nothing here is financial, tax or legal advice.
        </p>
      </div>
    </div>
  );
}
