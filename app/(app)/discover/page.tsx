import { headers } from 'next/headers';
import { readLiveVenues, readPaidServices } from '@/lib/server/discovery';
import { readX402Config } from '@/lib/x402/networks';
import { DiscoverView } from './DiscoverView';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage() {
  const [venues, services] = await Promise.all([readLiveVenues(), readPaidServices()]);
  const x402 = readX402Config(process.env);
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? 'yield-id.vercel.app'}`;
  return (
    <DiscoverView
      venues={venues.ok ? { ok: true, data: venues.data, readAt: venues.readAt, stale: venues.stale } : { ok: false, error: venues.error }}
      services={services.ok ? { ok: true, data: services.data.slice(0, 40), readAt: services.readAt, stale: services.stale } : { ok: false, error: services.error }}
      paid={{ priceUsd: x402.priceUsd, networks: x402.accepts.map((a) => ({ label: a.net.label, testnet: a.net.testnet })), problem: x402.problem, endpoint: `${origin}/api/x402/yields`, free: `${origin}/api/discover` }}
    />
  );
}
