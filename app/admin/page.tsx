import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { OrganizerApp } from '@/components/OrganizerApp';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = process.env.NODE_ENV === 'development'
    ? { displayName: 'Local organizer' }
    : await requireChatGPTUser('/admin');
  return <OrganizerApp organizerName={user.displayName} />;
}
