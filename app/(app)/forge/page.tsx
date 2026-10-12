import { getSession } from '@/lib/server/session';
import { HomeView } from './HomeView';

export default async function ForgePage() {
  const session = await getSession();
  return <HomeView address={session!.address} />;
}
