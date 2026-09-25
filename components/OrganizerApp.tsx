'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDay, formatTimeRange } from '@/lib/domain';
import type { AdminSnapshot, AdminSignup, AdminVolunteer, ShiftView } from '@/lib/repository';

type AdminAction =
  | { action: 'training'; volunteerId: string; type: 'general' | 'lead'; complete: boolean }
  | { action: 'capacity'; shiftId: string; capacity: number }
  | { action: 'checkin'; signupId: string; checkedIn: boolean };

export function OrganizerApp({ organizerName }: { organizerName: string }) {
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAccess, setNeedsAccess] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/admin', { cache: 'no-store' });
      const result = (await response.json()) as AdminSnapshot & { message?: string };
      if (response.status === 401) {
        setNeedsAccess(true);
        return;
      }
      if (!response.ok) {
        setError(result.message ?? 'Organizer data is unavailable.');
        return;
      }
      setData(result);
    } catch {
      setError('Organizer data is unavailable. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The callback is the external data subscription for this client surface.
  // oxlint-disable-next-line react/react-compiler
  useEffect(() => { void load(); }, [load]);

  async function mutate(action: AdminAction) {
    setError(null);
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(action),
    });
    const result = (await response.json()) as { ok?: boolean; message?: string };
    if (!response.ok || !result.ok) {
      setError(result.message ?? 'That change could not be saved.');
      return false;
    }
    await load();
    return true;
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b-2 border-ink bg-ink text-paper">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold uppercase tracking-[.1em]"><ArrowLeft className="size-4" /> Volunteer site</Link>
          <div className="flex items-center gap-2 text-right"><ShieldCheck className="size-5 text-[#f06a43]" /><span className="text-xs font-bold uppercase tracking-[.1em]">{organizerName}</span></div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-7 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-5">
          <div><div className="eyebrow">Organizer workspace</div><h1 className="mt-1 font-display text-5xl font-black uppercase leading-[.84] tracking-tight sm:text-7xl">Back of house</h1></div>
          <div className="flex items-center gap-2 border border-ink bg-paper-deep px-3 py-2 text-xs font-bold uppercase tracking-[.1em]"><span className="live-dot" /> Event phase: {data?.phase ?? 'loading'}</div>
        </div>

        {needsAccess ? <OrganizerLogin onSignedIn={() => { setNeedsAccess(false); setLoading(true); void load(); }} /> : <>
        {error && <div role="alert" className="mt-5 flex items-center justify-between gap-3 border-2 border-poppy bg-poppy-wash p-3 text-sm font-bold text-poppy-dark"><span>{error}</span><button onClick={load} aria-label="Retry"><RefreshCw className="size-4" /></button></div>}
        {loading && <div className="mt-8 animate-pulse border-2 border-ink bg-paper-deep p-8 font-display text-2xl">Loading the operation board…</div>}

        {data && (
          <Tabs defaultValue="overview" className="mt-7">
            <TabsList variant="line" className="grid h-auto w-full grid-cols-4 gap-0 border-2 border-ink p-0">
              {['overview', 'volunteers', 'shifts', 'check-in'].map((tab) => <TabsTrigger key={tab} value={tab} className="day-tab h-auto rounded-none border-r-2 border-ink px-2 py-3 text-xs font-black uppercase tracking-[.08em] last:border-r-0 sm:text-sm">{tab}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="overview" className="mt-6"><Overview data={data} /></TabsContent>
            <TabsContent value="volunteers" className="mt-6"><VolunteerRoster volunteers={data.volunteers} mutate={mutate} /></TabsContent>
            <TabsContent value="shifts" className="mt-6"><ShiftManager shifts={data.shifts} mutate={mutate} /></TabsContent>
            <TabsContent value="check-in" className="mt-6"><CheckIn data={data} mutate={mutate} /></TabsContent>
          </Tabs>
        )}
        </>}
      </main>
    </div>
  );
}

function OrganizerLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [accessCode, setAccessCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function signIn(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(null);
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessCode }) });
      if (!response.ok) { setMessage('Organizer sign-in required.'); return; }
      onSignedIn();
    } catch { setMessage('Organizer sign-in required.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={signIn} className="mx-auto mt-10 max-w-md border-2 border-blue bg-paper-deep p-6"><div className="eyebrow text-orange">Organizer access</div><h2 className="mt-1 font-display text-3xl font-black">Enter access code</h2><label className="mt-5 block"><span className="sr-only">Access code</span><input type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required className="field-input" /></label>{message && <p role="alert" className="mt-3 text-sm">{message}</p>}<button type="submit" disabled={pending} className="mt-4 h-11 w-full bg-orange font-bold text-paper">{pending ? 'Checking' : 'Enter'}</button></form>;
}

function Overview({ data }: { data: AdminSnapshot }) {
  const totalCapacity = data.shifts.reduce((sum, shift) => sum + shift.capacity, 0);
  const filled = data.shifts.reduce((sum, shift) => sum + shift.filled, 0);
  const trained = data.volunteers.filter((volunteer) => volunteer.trainings.general).length;
  const checked = data.signups.filter((signup) => signup.status === 'checked_in').length;
  const byLocation = [...new Set(data.shifts.map((shift) => shift.locationId))].map((locationId) => {
    const shifts = data.shifts.filter((shift) => shift.locationId === locationId);
    return {
      name: shifts[0].location.name,
      capacity: shifts.reduce((sum, shift) => sum + shift.capacity, 0),
      filled: shifts.reduce((sum, shift) => sum + shift.filled, 0),
    };
  });
  return (
    <div>
      <div className="grid gap-1 border-2 border-ink bg-ink sm:grid-cols-4"><Metric label="Volunteers" value={data.volunteers.length} /><Metric label="Shifts claimed" value={filled} /><Metric label="General trained" value={trained} /><Metric label="Checked in" value={checked} /></div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section><div className="eyebrow">Fill by location</div><div className="mt-3 border-2 border-ink">{byLocation.map((row) => { const percent = row.capacity ? Math.round(row.filled / row.capacity * 100) : 0; return <div key={row.name} className="grid grid-cols-[minmax(150px,1fr)_2fr_70px] items-center gap-3 border-b border-ink px-3 py-3 last:border-b-0"><strong>{row.name}</strong><div className="h-4 border border-ink bg-paper-deep"><div className="h-full bg-poppy" style={{ width: `${Math.min(100, percent)}%` }} /></div><span className="text-right font-display text-xl font-black tabular-nums">{percent}%</span></div>; })}</div></section>
        <section className="border-2 border-ink bg-paper-deep p-5"><div className="eyebrow">What needs attention</div><h2 className="mt-2 font-display text-3xl font-black">{filled === 0 ? 'Signups are ready to open.' : `${totalCapacity - filled} spots remain.`}</h2><p className="mt-3 text-sm leading-relaxed text-ink-soft">Use Volunteers to manage training, Shifts to rebalance capacity, and Check-in during the event to record attendance.</p></section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-paper p-4"><div className="eyebrow">{label}</div><div className="mt-2 font-display text-4xl font-black tabular-nums text-poppy">{value}</div></div>;
}

function VolunteerRoster({ volunteers, mutate }: { volunteers: AdminVolunteer[]; mutate: (action: AdminAction) => Promise<boolean> }) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return volunteers.filter((volunteer) => !needle || `${volunteer.firstName} ${volunteer.lastName} ${volunteer.email}`.toLowerCase().includes(needle));
  }, [query, volunteers]);
  async function toggle(volunteer: AdminVolunteer, type: 'general' | 'lead') {
    const key = `${volunteer.id}:${type}`;
    setPending(key);
    await mutate({ action: 'training', volunteerId: volunteer.id, type, complete: !volunteer.trainings[type] });
    setPending(null);
  }
  return (
    <section>
      <SectionHeader title="Volunteer roster" copy="Search every person once, then mark training across every shift they hold." />
      <label className="mt-5 flex max-w-md items-center gap-2 border-2 border-ink bg-paper-deep px-3"><Search className="size-4" /><span className="sr-only">Search volunteers</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" className="h-11 min-w-0 flex-1 bg-transparent outline-none" /></label>
      {rows.length ? <div className="mt-4 overflow-x-auto border-2 border-ink"><table className="w-full min-w-[720px] border-collapse text-left"><thead className="bg-ink text-paper"><tr><th className="px-3 py-2 text-xs uppercase tracking-[.1em]">Volunteer</th><th className="px-3 py-2 text-xs uppercase tracking-[.1em]">Contact</th><th className="px-3 py-2 text-center text-xs uppercase tracking-[.1em]">Shifts</th><th className="px-3 py-2 text-center text-xs uppercase tracking-[.1em]">General</th><th className="px-3 py-2 text-center text-xs uppercase tracking-[.1em]">Lead</th></tr></thead><tbody>{rows.map((volunteer) => <tr key={volunteer.id} className="border-b border-ink last:border-b-0"><td className="px-3 py-3 font-bold">{volunteer.lastName}, {volunteer.firstName}</td><td className="px-3 py-3 text-sm text-ink-soft"><div>{volunteer.email}</div><div>{volunteer.phone || 'No phone'}</div></td><td className="px-3 py-3 text-center font-display text-xl font-black">{volunteer.shiftCount}</td>{(['general', 'lead'] as const).map((type) => <td key={type} className="px-3 py-3 text-center"><button onClick={() => toggle(volunteer, type)} disabled={pending === `${volunteer.id}:${type}`} aria-pressed={volunteer.trainings[type]} className={`mx-auto grid size-8 place-items-center border-2 border-ink ${volunteer.trainings[type] ? 'bg-ink text-paper' : 'bg-paper text-transparent'}`}><Check className="size-4" /></button></td>)}</tr>)}</tbody></table></div> : <Empty title="No volunteers match." copy={volunteers.length ? 'Try another name or email.' : 'Volunteer records will appear after the first signup.'} />}
    </section>
  );
}

function ShiftManager({ shifts, mutate }: { shifts: ShiftView[]; mutate: (action: AdminAction) => Promise<boolean> }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  async function save(shift: ShiftView) {
    const raw = drafts[shift.id];
    if (raw === undefined || Number(raw) === shift.capacity) return;
    setPending(shift.id);
    const ok = await mutate({ action: 'capacity', shiftId: shift.id, capacity: Number(raw) });
    if (!ok) setDrafts((current) => ({ ...current, [shift.id]: String(shift.capacity) }));
    setPending(null);
  }
  const dayGroups = [...new Map(shifts.map((shift) => [shift.day, shifts.filter((item) => item.day === shift.day)])).entries()];
  return <section><SectionHeader title="Shift capacity" copy="Adjust a cap in place. The site refuses any number below the people already registered." /><div className="mt-5 border-2 border-ink">{dayGroups.map(([day, dayShifts]) => <div key={day}><div className="border-y border-ink bg-ink px-3 py-2 text-paper first:border-t-0"><span className="text-xs font-bold uppercase tracking-[.12em]">{formatDay(day)}</span></div>{dayShifts.map((shift) => <div key={shift.id} className="grid grid-cols-[105px_minmax(0,1fr)_95px] items-center gap-3 border-b border-ink px-3 py-2.5 last:border-b-0 sm:grid-cols-[145px_minmax(0,1fr)_160px_95px]"><strong className="text-sm">{formatTimeRange(shift.startsAt, shift.endsAt)}</strong><div className="min-w-0"><div className="truncate font-bold">{shift.location.shortName} · {shift.title ?? shift.task.name}</div><div className="text-xs text-ink-faint">{shift.filled} signed up</div></div><div className="hidden h-3 border border-ink bg-paper-deep sm:block"><div className="h-full bg-poppy" style={{ width: `${Math.min(100, shift.capacity ? shift.filled / shift.capacity * 100 : 100)}%` }} /></div><label className="flex items-center gap-2"><span className="sr-only">Capacity for {shift.location.name} at {formatTimeRange(shift.startsAt, shift.endsAt)}</span><span className="text-xs font-bold">CAP</span><input type="number" min={shift.filled} max={500} value={drafts[shift.id] ?? shift.capacity} onChange={(event) => setDrafts((current) => ({ ...current, [shift.id]: event.target.value }))} onBlur={() => save(shift)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} disabled={pending === shift.id} className="h-9 w-16 border border-ink bg-paper-deep px-2 text-right font-bold" /></label></div>)}</div>)}</div></section>;
}

function CheckIn({ data, mutate }: { data: AdminSnapshot; mutate: (action: AdminAction) => Promise<boolean> }) {
  const [shiftId, setShiftId] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const roster = data.signups.filter((signup) => signup.shiftId === shiftId);
  const selected = data.shifts.find((shift) => shift.id === shiftId);
  if (data.phase !== 'during') return <Empty title="Check-in opens on January 25." copy="Attendance controls stay locked until the event begins, so an early tap cannot create a false check-in." />;
  async function toggle(signup: AdminSignup) { setPending(signup.id); await mutate({ action: 'checkin', signupId: signup.id, checkedIn: signup.status !== 'checked_in' }); setPending(null); }
  return <section><SectionHeader title="Day-of check-in" copy="Choose a location and time, then tap each volunteer as they arrive." /><select value={shiftId} onChange={(event) => setShiftId(event.target.value)} className="mt-5 h-12 w-full max-w-2xl border-2 border-ink bg-paper-deep px-3"><option value="">Choose a shift…</option>{data.shifts.map((shift) => <option key={shift.id} value={shift.id}>{formatDay(shift.day)} · {formatTimeRange(shift.startsAt, shift.endsAt)} · {shift.location.shortName} · {shift.title ?? shift.task.name}</option>)}</select>{selected && <div className="mt-5"><div className="flex items-end justify-between border-b-2 border-ink pb-2"><h3 className="font-display text-2xl font-black">{selected.location.name}</h3><span className="eyebrow">{roster.filter((row) => row.status === 'checked_in').length} of {roster.length} here</span></div>{roster.length ? <div className="mt-3 grid gap-1 border-2 border-ink bg-ink sm:grid-cols-2">{roster.map((signup) => <button key={signup.id} onClick={() => toggle(signup)} disabled={pending === signup.id} className={`flex items-center gap-3 p-3 text-left ${signup.status === 'checked_in' ? 'bg-success' : 'bg-paper'}`}><span className={`grid size-8 place-items-center border-2 border-ink ${signup.status === 'checked_in' ? 'bg-ink text-paper' : 'text-transparent'}`}><Check className="size-4" /></span><span><strong className="block">{signup.volunteerName}</strong><span className="text-sm text-ink-soft">{signup.phone || signup.email}</span></span></button>)}</div> : <Empty title="Nobody is signed up for this shift." copy="Choose another shift or return when registrations arrive." />}</div>}</section>;
}

function SectionHeader({ title, copy }: { title: string; copy: string }) { return <div><div className="eyebrow">Operations</div><h2 className="mt-1 font-display text-3xl font-black">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{copy}</p></div>; }
function Empty({ title, copy }: { title: string; copy: string }) { return <div className="mt-5 border-2 border-ink bg-paper-deep p-8 text-center"><UsersRound className="mx-auto size-8 text-poppy" /><h2 className="mt-3 font-display text-2xl font-black">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm text-ink-soft">{copy}</p></div>; }
