import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { ClientOnly } from '@/components/ClientOnly';
import { getSession } from '@/lib/server/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/connect');
  return (
    <AppShell address={session.address}>
      <ClientOnly>{children}</ClientOnly>
    </AppShell>
  );
}
