import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';
import { ClaimView } from './ClaimView';

export default async function ClaimPage() {
  const session = await getSession();
  if (!session) redirect('/');
  return <ClaimView address={session.address} domain={process.env.NEXT_PUBLIC_YID_DOMAIN ?? null} />;
}
