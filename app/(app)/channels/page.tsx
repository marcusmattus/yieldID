'use client';

import { Disclaimer, PageHead, SampleRegion } from '@/components/ui';
import { fmtBp, fmtPct } from '@/lib/rates';
import { setAppState, useAppState } from '@/lib/store';
import { useBoard } from '@/lib/useBoard';

const CHANNELS = [
  { key: 'telegram', name: 'Telegram', env: 'TELEGRAM_BOT_TOKEN', asked: ['Post messages in one group', 'Read commands sent to the bot: /board, /why, /mute'], not: ['Read other messages (privacy mode stays on)', 'Admin rights, member list, pins'] },
  { key: 'discord', name: 'Discord', env: 'DISCORD_BOT_TOKEN', asked: ['bot, applications.commands', 'Send Messages, Embed Links in one channel'], not: ['Read Message History, Manage Webhooks', 'Administrator'] },
  { key: 'slack', name: 'Slack', env: 'SLACK_BOT_TOKEN', asked: ['chat:write in one channel', 'commands: /yid board, /yid why'], not: ['channels:history, files:read', 'users:read.email'] },
] as const;

export default function ChannelsPage() {
  const { channels, handle } = useAppState();
  const { best, rule } = useBoard();

  return (
    <>
      <PageHead
        eyebrow="Signal · Channels"
        title="Group chat channels"
        lede="Signal posts proposals to the trading chats you connect. A chat sees the numbers and a link to review; signing always happens in your wallet. Below is every permission each bot asks for, and the ones it does not."
      />

      <div className="yf-grid-3">
        {CHANNELS.map((c) => (
          <article key={c.key} className="yf-card yf-stack">
            <div className="yf-head">
              <h2 className="yf-h2">{c.name}</h2>
              <span className="yf-badge">Not configured</span>
            </div>
            <ul className="yf-scopes">
              {c.asked.map((s) => <li key={s}><span className="yf-scope-word yf-scope-word--asked">Asked</span><span>{s}</span></li>)}
              {c.not.map((s) => <li key={s}><span className="yf-scope-word yf-scope-word--not">Not asked</span><span>{s}</span></li>)}
            </ul>
            <p className="yf-fine">Needs {c.env} on the server before it can connect.</p>
            <button className="yf-btn yf-btn--secondary" type="button" disabled aria-disabled="true">Connect {c.name}</button>
          </article>
        ))}
      </div>

      <div className="yf-split">
        <SampleRegion labelledBy="pv-h">
          <h2 id="pv-h" className="yf-h2">What a post looks like</h2>
          <pre className="yf-code">
            {best
              ? `Signal for ${handle ?? '[handle]'} · ${new Date().toLocaleTimeString('en-GB')}
${best.name} is ${fmtBp(best.edgeBp)} net over ${rule.horizonDays} d vs Venue C.

Gross      ${fmtPct(best.grossPct)}
Move cost  ${fmtPct(best.moveCostPct)} once · ${fmtPct(best.annualisedMovePct)} annualised
Net        ${fmtPct(best.netPct)}
Edge       ${fmtBp(best.edgeBp)}   (rule: ${rule.edgeBp} bp)
${channels.showAmounts ? 'Size       40,000 USDC\n' : ''}
Review     /proposal?venue=${best.id}
Not advice. Only the wallet owner can sign.`
              : 'No venue clears the rule, so there is nothing to post.'}
          </pre>
        </SampleRegion>

        <section className="yf-card yf-stack" aria-labelledby="who-h">
          <h2 id="who-h" className="yf-h2">Who can do what in a chat</h2>
          <ul className="yf-scopes">
            <li><span className="yf-scope-word yf-scope-word--asked">Anyone</span><span>/board and /why: read the ranking and the arithmetic</span></li>
            <li><span className="yf-scope-word yf-scope-word--asked">Owner</span><span>/propose and /mute: open or silence proposals</span></li>
            <li><span className="yf-scope-word yf-scope-word--not">Nobody</span><span>Sign, change a rule or a limit from a chat</span></li>
          </ul>
          <label className="yf-row" style={{ minHeight: 44, fontSize: 14 }}>
            <input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--ember)' }} checked={channels.showAmounts} onChange={() => setAppState((s) => ({ ...s, channels: { ...s.channels, showAmounts: !s.channels.showAmounts } }))} />
            Show amounts in posts
          </label>
          <p className="yf-fine">Off by default: posts carry rates and edge, not your size.</p>
        </section>
      </div>
      <Disclaimer>A post in a chat is information, not advice. Rates in it can be stale by the time it is read; the review link re-reads them.</Disclaimer>
    </>
  );
}
