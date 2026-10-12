import { getSession } from '@/lib/server/session';
import { AddCryptoView } from './AddCryptoView';

export default async function AddCryptoPage() {
  const session = await getSession();
  return <AddCryptoView address={session!.address} />;
}
