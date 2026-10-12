import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ClientOnly } from '@/components/ClientOnly';
import { Nav } from '@/components/Nav';
import { getSession } from '@/lib/server/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/');
  return (
    <div className="yf-page">
      <Nav address={session.address} />
      <ClientOnly>{children}</ClientOnly>
    </div>
  );
}
