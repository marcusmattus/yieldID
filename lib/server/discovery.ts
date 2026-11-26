import 'server-only';
import { liveVenuesFrom, type LiveVenue, type LlamaPool } from '@/lib/defi/pools';
import { BAZAAR_URL, rankServices, type BazaarItem, type PaidService } from '@/lib/x402/bazaar';

/**
 * Server reads behind the discovery layer. Each source is fetched at most
 * once per TTL per server instance; a failed refresh keeps serving the last
 * good read with its original timestamp, so the page can say how old it is.
 */

const POOLS_URL = 'https://yields.llama.fi/pools';
const POOLS_TTL_MS = 5 * 60_000;
const BAZAAR_TTL_MS = 10 * 60_000;
const BAZAAR_PAGES = 5;
const BAZAAR_PAGE_SIZE = 100;

export type Read<T> = { ok: true; data: T; readAt: number; stale: boolean } | { ok: false; error: string };

interface Slot<T> { data: T; readAt: number }
let pools: Slot<LiveVenue[]> | null = null;
let services: Slot<PaidService[]> | null = null;
let poolsInflight: Promise<void> | null = null;
let servicesInflight: Promise<void> | null = null;

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
  return r.json();
}

async function refreshPools() {
  const body = (await getJson(POOLS_URL, 20_000)) as { status?: string; data?: LlamaPool[] };
  if (!Array.isArray(body.data)) throw new Error('DefiLlama returned no pool list');
  const readAt = Date.now();
  pools = { data: liveVenuesFrom(body.data, readAt), readAt };
}

async function refreshServices() {
  const pages = await Promise.all(
    Array.from({ length: BAZAAR_PAGES }, (_, i) =>
      // A failed page fails the whole refresh, so the last complete catalogue is kept (marked stale)
      // instead of being replaced by a partial one with a fresh timestamp.
      getJson(`${BAZAAR_URL}?limit=${BAZAAR_PAGE_SIZE}&offset=${i * BAZAAR_PAGE_SIZE}`, 15_000)
        .then((b) => ((b as { items?: BazaarItem[] }).items ?? [])),
    ),
  );
  const items = pages.flat();
  if (!items.length) throw new Error('The x402 Bazaar returned no services');
  services = { data: rankServices(items), readAt: Date.now() };
}

async function readThrough<T>(
  get: () => Slot<T> | null,
  ttl: number,
  inflight: () => Promise<void> | null,
  setInflight: (p: Promise<void> | null) => void,
  refresh: () => Promise<void>,
): Promise<Read<T>> {
  const cur = get();
  if (cur && Date.now() - cur.readAt < ttl) return { ok: true, data: cur.data, readAt: cur.readAt, stale: false };
  let p = inflight();
  if (!p) {
    p = refresh().finally(() => setInflight(null));
    setInflight(p);
  }
  try {
    await p;
    const fresh = get()!;
    return { ok: true, data: fresh.data, readAt: fresh.readAt, stale: false };
  } catch (e) {
    const last = get();
    if (last) return { ok: true, data: last.data, readAt: last.readAt, stale: true };
    return { ok: false, error: (e as Error).message };
  }
}

export function readLiveVenues(): Promise<Read<LiveVenue[]>> {
  return readThrough(() => pools, POOLS_TTL_MS, () => poolsInflight, (p) => { poolsInflight = p; }, refreshPools);
}

export function readPaidServices(): Promise<Read<PaidService[]>> {
  return readThrough(() => services, BAZAAR_TTL_MS, () => servicesInflight, (p) => { servicesInflight = p; }, refreshServices);
}
