import { NextResponse } from 'next/server';
import { ownerFromSession } from '@/lib/agent/http';
import { getStore } from '@/lib/agent/store';
import { listCards } from '@/lib/card';
import { fromMicro } from '@/lib/chain';
import { listProposals } from '@/lib/pot';

/** Owner only: what agents have done, for the Agents screen. */
export async function GET() {
  const o = await ownerFromSession();
  if ('res' in o) return o.res;
  const s = await getStore().read();
  const labels = Object.fromEntries(s.keys.filter((k) => k.owner === o.owner).map((k) => [k.id, k.label]));
  return NextResponse.json({
    ok: true,
    proposals: (await listProposals(o.owner)).slice(0, 20),
    cards: await listCards(o.owner),
    payments: s.ledger
      .filter((e) => e.owner === o.owner)
      .slice(-20)
      .reverse()
      .map((e) => ({ id: e.id, key: labels[e.keyId] ?? e.keyId, kind: e.kind, amountUsdc: fromMicro(e.amountMicro), at: new Date(e.at).toISOString(), ref: e.ref, txSignature: e.txSignature ?? null })),
  });
}
