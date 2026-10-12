import { getSession } from '@/lib/server/session';
import { YidMaker } from './YidMaker';

export default async function YidPage() {
  const session = await getSession();
  return <YidMaker address={session!.address} domain={process.env.NEXT_PUBLIC_YID_DOMAIN ?? null} />;
}
