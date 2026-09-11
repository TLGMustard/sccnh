import { VolunteerApp } from '@/components/VolunteerApp';
import { getPublicSnapshot } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  return <VolunteerApp initial={await getPublicSnapshot()} />;
}
