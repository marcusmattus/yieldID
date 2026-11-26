import { parseHorizon } from '@/lib/defi/rank';
import { optimiseLookup } from '@/lib/server/optimise';
import { LookupForm, LookupReport, LookupShell } from '../Lookup';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ q: string }> }) {
  const { q } = await params;
  return { title: `${decodeURIComponent(q)} · YieldID`, description: 'Idle stablecoins in this YieldID and where they would earn most, net of the cost to move.' };
}

export default async function IdReport({ params, searchParams }: { params: Promise<{ q: string }>; searchParams: Promise<{ horizon?: string }> }) {
  const { q } = await params;
  const { horizon } = await searchParams;
  const h = parseHorizon(horizon);
  const query = decodeURIComponent(q);
  const report = await optimiseLookup(query, h);
  return (
    <LookupShell>
      <LookupReport report={report} />
      <LookupForm q={query} horizon={h} />
    </LookupShell>
  );
}
