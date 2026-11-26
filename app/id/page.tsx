import { redirect } from 'next/navigation';
import { LookupForm, LookupShell } from './Lookup';

export const metadata = { title: 'Look up a YieldID · where idle stablecoins could earn more' };

export default async function IdSearch({ searchParams }: { searchParams: Promise<{ q?: string; horizon?: string }> }) {
  const { q, horizon } = await searchParams;
  if (q?.trim()) redirect(`/id/${encodeURIComponent(q.trim())}${horizon ? `?horizon=${encodeURIComponent(horizon)}` : ''}`);
  return (
    <LookupShell>
      <LookupForm />
    </LookupShell>
  );
}
