import { getSession } from '@/lib/server/session';
import { TrackerView } from './TrackerView';

export default async function TrackerPage() {
  const session = await getSession();
  return <TrackerView address={session!.address} />;
}
