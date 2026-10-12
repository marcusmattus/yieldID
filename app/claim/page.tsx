import { redirect } from 'next/navigation';

/** Old path. The YieldID maker lives in the app now. */
export default function ClaimPage() {
  redirect('/yid');
}
