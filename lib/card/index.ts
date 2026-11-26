import 'server-only';
import { randomBytes } from 'node:crypto';
import { fromMicro, toMicro } from '../chain';
import { getStore, type CardRecord } from '../agent/store';
import type { CardIssuer, LimitWindow, ProvisionRequest } from './issuer';
import { PartnerIssuer } from './partner';
import { SandboxIssuer } from './sandbox';

export { IssuerNotConfigured } from './issuer';

let issuer: CardIssuer | null = null;

export function getIssuer(): CardIssuer {
  if (issuer) return issuer;
  const id = (process.env.CARD_ISSUER ?? 'sandbox').toLowerCase();
  issuer = id === 'sandbox' ? new SandboxIssuer() : new PartnerIssuer(id);
  return issuer;
}
export function setIssuer(i: CardIssuer) {
  issuer = i;
}

export function viewCard(c: CardRecord) {
  return {
    id: c.id,
    label: c.label,
    last4: c.last4,
    network: c.network,
    status: c.status,
    spendLimitUsdc: fromMicro(c.spendLimitMicro),
    limitWindow: c.limitWindow,
    issuer: c.issuer,
    sandbox: c.sandbox,
    createdAt: new Date(c.createdAt).toISOString(),
    wallets: 'Add to Apple Pay or Google Pay from the YieldID app on your phone. Agents cannot do this step.',
  };
}

const WINDOWS: LimitWindow[] = ['per_transaction', 'daily', 'monthly'];
const MAX_ACTIVE_CARDS = 5;

export async function listCards(owner: string) {
  const s = await getStore().read();
  return s.cards.filter((c) => c.owner === owner && c.status !== 'closed').map(viewCard);
}

export async function issueCard(owner: string, input: { label?: string; spendLimitUsdc: number; limitWindow?: LimitWindow }, createdByKey: string | null) {
  const label = String(input.label ?? 'YieldID card').trim().slice(0, 40) || 'YieldID card';
  const window = input.limitWindow ?? 'monthly';
  if (!WINDOWS.includes(window)) throw new Error(`limitWindow must be one of ${WINDOWS.join(', ')}.`);
  const limit = toMicro(input.spendLimitUsdc);
  const s = await getStore().read();
  if (s.cards.filter((c) => c.owner === owner && c.status !== 'closed').length >= MAX_ACTIVE_CARDS) {
    throw new Error(`You already have ${MAX_ACTIVE_CARDS} open cards. Close one first.`);
  }
  const iss = getIssuer();
  const issued = await iss.issueVirtualCard({ owner, label, spendLimitMicro: limit, limitWindow: window });
  const rec: CardRecord = {
    id: `card_${randomBytes(6).toString('hex')}`,
    owner,
    issuer: iss.id,
    issuerCardId: issued.issuerCardId,
    label,
    last4: issued.last4,
    network: issued.network,
    status: 'active',
    spendLimitMicro: limit.toString(),
    limitWindow: window,
    createdAt: Date.now(),
    createdByKey,
    sandbox: iss.sandbox,
  };
  await getStore().update((st) => {
    st.cards.push(rec);
  });
  return { ...viewCard(rec), funding: issued.funding };
}

async function mutate(owner: string, cardId: string, fn: (c: CardRecord, iss: CardIssuer) => Promise<void>) {
  const s = await getStore().read();
  const card = s.cards.find((c) => c.id === cardId && c.owner === owner);
  if (!card) throw new Error('Card not found.');
  if (card.status === 'closed') throw new Error('Card is closed.');
  const iss = getIssuer();
  if (iss.id !== card.issuer) throw new Error(`Card was issued by ${card.issuer}, but the configured issuer is ${iss.id}.`);
  await fn(card, iss);
  return getStore().update((st) => {
    const c = st.cards.find((x) => x.id === cardId)!;
    Object.assign(c, card);
    return viewCard(c);
  });
}

export function setCardStatus(owner: string, cardId: string, status: 'active' | 'frozen' | 'closed') {
  return mutate(owner, cardId, async (c, iss) => {
    await iss.setStatus(c.issuerCardId, status);
    c.status = status;
  });
}

export function setCardLimit(owner: string, cardId: string, spendLimitUsdc: number, window?: LimitWindow) {
  const w = window ?? undefined;
  if (w && !WINDOWS.includes(w)) throw new Error(`limitWindow must be one of ${WINDOWS.join(', ')}.`);
  const limit = toMicro(spendLimitUsdc);
  return mutate(owner, cardId, async (c, iss) => {
    await iss.setLimit(c.issuerCardId, limit, w ?? c.limitWindow);
    c.spendLimitMicro = limit.toString();
    if (w) c.limitWindow = w;
  });
}

/** Owner-only: push the card into Apple Pay or Google Pay on the owner's phone. */
export async function provisionCard(owner: string, cardId: string, req: ProvisionRequest) {
  const s = await getStore().read();
  const card = s.cards.find((c) => c.id === cardId && c.owner === owner);
  if (!card) throw new Error('Card not found.');
  if (card.status !== 'active') throw new Error(`Card is ${card.status}. Unfreeze it first.`);
  if (req.wallet !== 'apple_pay' && req.wallet !== 'google_pay') throw new Error('wallet must be apple_pay or google_pay.');
  const out = await getIssuer().provision(card.issuerCardId, req);
  return { ...out, sandbox: card.sandbox };
}
