'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Check, Clock3, MapPin, RefreshCw, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDay, formatTime, formatTimeRange } from '@/lib/domain';
import type { PublicSnapshot, ShiftView, VolunteerDashboard } from '@/lib/repository';

type View = 'signup' | 'mine';
type Contact = { firstName: string; lastName: string; email: string; phone: string };
type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input: unknown): unknown;
};
type WebMcpContext = { registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void> };

const EMPTY_CONTACT: Contact = { firstName: '', lastName: '', email: '', phone: '' };
const CONTACT_KEY = 'sccnh-2027-contact';

export function VolunteerApp({ initial }: { initial: PublicSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [view, setView] = useState<View>('signup');
  const days = useMemo(() => [...new Set(snapshot.shifts.map((shift) => shift.day))], [snapshot.shifts]);
  const [day, setDay] = useState(days.at(-1) ?? initial.event.startDate);
  const [selected, setSelected] = useState<ShiftView | null>(null);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [dashboard, setDashboard] = useState<VolunteerDashboard | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/site', { cache: 'no-store' });
    if (!response.ok) return;
    const next = (await response.json()) as PublicSnapshot;
    setSnapshot(next);
    setSelected((current) => current ? next.shifts.find((shift) => shift.id === current.id) ?? null : null);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONTACT_KEY);
      if (saved) queueMicrotask(() => setContact({ ...EMPTY_CONTACT, ...(JSON.parse(saved) as Partial<Contact>) }));
    } catch {
      // A remembered contact is a convenience, never a dependency.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(refresh, 45000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const activeShifts = snapshot.shifts.filter((shift) => shift.day === day);
  const groups = useMemo(() => {
    const map = new Map<string, ShiftView[]>();
    for (const shift of activeShifts) {
      const current = map.get(shift.locationId) ?? [];
      current.push(shift);
      map.set(shift.locationId, current);
    }
    return [...map.values()];
  }, [activeShifts]);

  const totalCapacity = snapshot.shifts.reduce((sum, shift) => sum + shift.capacity, 0);
  const totalFilled = snapshot.shifts.reduce((sum, shift) => sum + shift.filled, 0);
  const totalOpen = totalCapacity - totalFilled;
  const locationCount = new Set(snapshot.shifts.map((shift) => shift.locationId)).size;

  const alternatives = useMemo(() => {
    if (!selected) return [];
    const sameTime = snapshot.shifts.filter(
      (shift) =>
        shift.id !== selected.id &&
        shift.day === selected.day &&
        shift.startsAt.slice(11, 16) === selected.startsAt.slice(11, 16) &&
        shift.remaining > 0,
    );
    const adjacent = snapshot.shifts
      .filter(
        (shift) =>
          shift.id !== selected.id &&
          shift.day === selected.day &&
          shift.locationId === selected.locationId &&
          shift.remaining > 0,
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.startsAt) - Date.parse(selected.startsAt)) -
          Math.abs(Date.parse(b.startsAt) - Date.parse(selected.startsAt)),
      );
    return [...sameTime.sort((a, b) => b.remaining - a.remaining), ...adjacent].slice(0, 3);
  }, [selected, snapshot.shifts]);

  async function claim(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || claiming || selected.remaining === 0) return;
    setClaiming(true);
    setClaimMessage(null);
    try {
      const response = await fetch('/api/site', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'claim', shiftId: selected.id, ...contact }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; dashboard?: VolunteerDashboard };
      if (!response.ok || !result.ok || !result.dashboard) {
        setClaimMessage(result.message ?? 'We could not claim that shift.');
        await refresh();
        return;
      }
      setDashboard(result.dashboard);
      setClaimMessage('You are in. Your shift is saved.');
      try {
        window.localStorage.setItem(CONTACT_KEY, JSON.stringify(contact));
      } catch {
        // Saving locally is optional.
      }
      await refresh();
    } catch {
      setClaimMessage('We could not reach the signup service. Check your connection and try again.');
    } finally {
      setClaiming(false);
    }
  }

  async function lookup(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookupMessage(null);
    try {
      const response = await fetch(`/api/site?mode=mine&email=${encodeURIComponent(contact.email)}`, { cache: 'no-store' });
      const result = (await response.json()) as { dashboard: VolunteerDashboard | null; message?: string };
      if (!response.ok) {
        setLookupMessage(result.message ?? 'We could not look up your shifts.');
        return;
      }
      setDashboard(result.dashboard);
      if (!result.dashboard) setLookupMessage('No active shifts are registered to that email yet.');
    } catch {
      setLookupMessage('We could not reach the signup service. Check your connection and try again.');
    }
  }

  async function cancel(signupId: string) {
    const email = dashboard?.volunteer.email ?? contact.email;
    const response = await fetch('/api/site', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', signupId, email }),
    });
    const result = (await response.json()) as { ok?: boolean; message?: string };
    if (!response.ok || !result.ok) {
      setLookupMessage(result.message ?? 'We could not cancel that shift.');
      return;
    }
    const updated = await fetch(`/api/site?mode=mine&email=${encodeURIComponent(email)}`, { cache: 'no-store' });
    const data = (await updated.json()) as { dashboard: VolunteerDashboard | null };
    setDashboard(data.dashboard);
    setLookupMessage(result.message ?? null);
    await refresh();
  }

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };
    const register = (tool: WebMcpTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, options)).catch((error: unknown) => {
          console.error('WebMCP tool registration failed', error);
        });
      } catch (error) {
        console.error('WebMCP tool registration failed', error);
      }
    };

    register({
      name: 'list_open_sccnh_shifts',
      title: 'List open SCCNH shifts',
      description: 'Read the current SCCNH 2027 shift availability, optionally filtered to one event day or location.',
      inputSchema: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'Optional YYYY-MM-DD event day.' },
          locationId: { type: 'string', description: 'Optional location id such as turlington, plaza, hpnp, hillel, or greek.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const filters = input && typeof input === 'object' && !Array.isArray(input)
          ? input as Record<string, unknown>
          : {};
        const dayFilter = typeof filters.day === 'string' ? filters.day : null;
        const locationFilter = typeof filters.locationId === 'string' ? filters.locationId : null;
        return snapshot.shifts
          .filter((shift) => shift.remaining > 0)
          .filter((shift) => !dayFilter || shift.day === dayFilter)
          .filter((shift) => !locationFilter || shift.locationId === locationFilter)
          .map((shift) => ({
            shiftId: shift.id,
            day: shift.day,
            time: formatTimeRange(shift.startsAt, shift.endsAt),
            location: shift.location.name,
            role: shift.title ?? shift.task.name,
            remaining: shift.remaining,
          }));
      },
    });

    register({
      name: 'claim_sccnh_shift',
      title: 'Claim an SCCNH shift',
      description: 'Complete one SCCNH 2027 volunteer signup using the same validation and live-capacity check as the visible form.',
      inputSchema: {
        type: 'object',
        properties: {
          shiftId: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
        },
        required: ['shiftId', 'firstName', 'lastName', 'email'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Signup input must be an object.');
        const values = input as Record<string, unknown>;
        const required = ['shiftId', 'firstName', 'lastName', 'email'] as const;
        if (required.some((key) => typeof values[key] !== 'string' || !String(values[key]).trim())) {
          throw new Error('shiftId, firstName, lastName, and email are required.');
        }
        const response = await fetch('/api/site', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'claim',
            shiftId: values.shiftId,
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            phone: typeof values.phone === 'string' ? values.phone : '',
          }),
        });
        const result = (await response.json()) as { ok?: boolean; message?: string; dashboard?: VolunteerDashboard };
        if (!response.ok || !result.ok || !result.dashboard) throw new Error(result.message ?? 'The shift could not be claimed.');
        setDashboard(result.dashboard);
        setContact({
          firstName: String(values.firstName),
          lastName: String(values.lastName),
          email: String(values.email),
          phone: typeof values.phone === 'string' ? values.phone : '',
        });
        setClaimMessage('You are in. Your shift is saved.');
        await refresh();
        const claimed = result.dashboard.shifts.find((shift) => shift.id === values.shiftId);
        return {
          status: 'confirmed',
          shiftId: values.shiftId,
          day: claimed?.day,
          time: claimed ? formatTimeRange(claimed.startsAt, claimed.endsAt) : undefined,
          location: claimed?.location.name,
        };
      },
    });

    return () => lifecycle.abort();
  }, [refresh, snapshot.shifts]);

  function openShift(shift: ShiftView) {
    setClaimMessage(null);
    setSelected(shift);
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-7">
          <button onClick={() => setView('signup')} className="group flex min-w-0 items-center gap-2 text-left">
            <span className="brand-mark" aria-hidden>S</span>
            <span className="truncate font-display text-base font-bold tracking-tight sm:text-xl">Spread Cream Cheese Not Hate</span>
          </button>
          <nav className="flex shrink-0 items-center border border-ink" aria-label="Site navigation">
            <button onClick={() => setView('signup')} aria-current={view === 'signup' ? 'page' : undefined} className={`nav-button ${view === 'signup' ? 'nav-button-active' : ''}`}>Sign up</button>
            <button onClick={() => setView('mine')} aria-current={view === 'mine' ? 'page' : undefined} className={`nav-button border-l border-ink ${view === 'mine' ? 'nav-button-active' : ''}`}>My shifts</button>
            <Link href="/admin" className="nav-button hidden border-l border-ink sm:block">Organizer</Link>
          </nav>
        </div>
      </header>

      {view === 'signup' ? (
        <main>
          <section className="border-b-2 border-ink bg-paper-deep">
            <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-7 sm:px-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)] lg:py-9">
              <div>
                <div className="eyebrow">University of Florida · Jan 25–27, 2027</div>
                <div className="mt-3 grid items-end gap-4 md:grid-cols-[minmax(0,.9fr)_minmax(280px,1.1fr)]">
                  <h1 className="font-display text-[clamp(3.15rem,7.2vw,7.6rem)] font-black uppercase leading-[.78] tracking-[-.045em]">Spread<br /><span className="text-poppy">Cream<br />Cheese</span><br />Not Hate</h1>
                  <div className="border-l-2 border-ink pl-4 md:pb-1">
                    <p className="max-w-xl text-base font-medium leading-relaxed sm:text-lg">{snapshot.event.overview}</p>
                    <details className="mt-4 border-t border-ink pt-3">
                      <summary className="cursor-pointer font-bold underline decoration-poppy decoration-2 underline-offset-4">What to know before you sign up</summary>
                      <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-ink-soft sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3">{snapshot.essentials.map((item) => <li key={item}>{item}</li>)}</ul>
                    </details>
                  </div>
                </div>
              </div>
              <aside className="self-stretch border-2 border-ink bg-paper">
                <div className="border-b-2 border-ink bg-ink px-4 py-2 text-paper"><span className="eyebrow text-paper">Live signup board</span></div>
                <dl className="grid grid-cols-3 divide-x divide-ink lg:grid-cols-1 lg:divide-x-0 lg:divide-y"><Stat label="Spots open" value={totalOpen} accent /><Stat label="Signups" value={totalFilled} /><Stat label="Locations" value={locationCount} /></dl>
                <div className="flex items-center justify-between border-t-2 border-ink px-4 py-2 text-xs font-bold uppercase tracking-[.12em]"><span className="flex items-center gap-2"><span className="live-dot" /> Updated live</span><button onClick={refresh} className="p-1" aria-label="Refresh availability"><RefreshCw className="size-4" /></button></div>
              </aside>
            </div>
          </section>

          <section className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-10" id="schedule">
            <div className="flex flex-col justify-between gap-4 border-b-2 border-ink pb-4 md:flex-row md:items-end">
              <div><div className="eyebrow">Choose a day, then a time</div><h2 className="mt-1 font-display text-4xl font-black uppercase leading-none sm:text-5xl">Find your shift</h2></div>
              <div className="flex flex-wrap gap-3 text-xs font-bold uppercase tracking-[.1em]"><Legend state="open" label="Open" /><Legend state="filling" label="Almost full" /><Legend state="full" label="Full" /></div>
            </div>
            <Tabs value={day} onValueChange={setDay} className="mt-5">
              <TabsList variant="line" className="grid h-auto w-full grid-cols-3 gap-0 border-2 border-ink p-0">
                {days.map((item) => {
                  const dayShifts = snapshot.shifts.filter((shift) => shift.day === item);
                  const open = dayShifts.reduce((sum, shift) => sum + shift.remaining, 0);
                  return <TabsTrigger key={item} value={item} className="day-tab h-auto rounded-none border-r-2 border-ink px-2 py-3 last:border-r-0"><span className="block text-center"><span className="block font-display text-lg font-black sm:text-2xl">{formatDay(item)}</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[.12em]">{open} open</span></span></TabsTrigger>;
                })}
              </TabsList>
            </Tabs>
            <div className="mt-6 space-y-5">{groups.map((shifts) => <LocationBlock key={shifts[0].locationId} shifts={shifts} onSelect={openShift} />)}</div>
          </section>
        </main>
      ) : (
        <MyShifts contact={contact} setContact={setContact} dashboard={dashboard} message={lookupMessage} onLookup={lookup} onCancel={cancel} onBrowse={() => setView('signup')} />
      )}

      <footer className="border-t-2 border-ink bg-ink text-paper"><div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-7"><div><p className="font-display text-2xl font-bold">{snapshot.event.tagline}</p><p className="mt-2 max-w-lg text-sm text-paper/70">Questions or bringing a whole chapter? Contact the SCCNH operations team at UF Hillel.</p></div><div className="eyebrow text-paper/60 sm:text-right">UF Hillel<br />2020 W University Ave · Gainesville</div></div></footer>

      <ShiftSheet shift={selected} alternatives={alternatives} contact={contact} setContact={setContact} pending={claiming} message={claimMessage} onClaim={claim} onClose={() => setSelected(null)} onAlternative={openShift} onMine={() => { setSelected(null); setView('mine'); }} />
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className="px-3 py-3.5 lg:flex lg:items-baseline lg:justify-between lg:px-4"><dt className="eyebrow text-[10px]">{label}</dt><dd className={`font-display text-3xl font-black tabular-nums ${accent ? 'text-poppy' : ''}`}>{value}</dd></div>;
}

function Legend({ state, label }: { state: ShiftView['state']; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`legend-dot state-${state}`} />{label}</span>;
}

function LocationBlock({ shifts, onSelect }: { shifts: ShiftView[]; onSelect: (shift: ShiftView) => void }) {
  const first = shifts[0];
  const open = shifts.reduce((sum, shift) => sum + shift.remaining, 0);
  const capacity = shifts.reduce((sum, shift) => sum + shift.capacity, 0);
  const tasks = [...new Map(shifts.map((shift) => [shift.task.id, shift.task])).values()];
  const hasDemand = shifts.some((shift) => shift.filled > 0);
  const fillRate = capacity ? (capacity - open) / capacity : 1;
  return (
    <article className={`location-block ${hasDemand && fillRate < 0.2 ? 'location-needed' : ''}`}>
      <div className="location-copy">
        <div className="flex items-start justify-between gap-3"><div><div className="eyebrow">{open} of {capacity} spots open</div><h3 className="mt-1 font-display text-2xl font-black leading-tight sm:text-3xl">{first.location.name}</h3></div>{hasDemand && fillRate < 0.2 && <span className="need-badge">Needs you</span>}</div>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{first.location.blurb}</p>
        <p className="mt-3 flex gap-2 text-xs leading-relaxed text-ink-faint"><MapPin className="mt-0.5 size-3.5 shrink-0" />{first.location.walkingNote}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">{tasks.map((task) => <span key={task.id} className="role-chip">{task.name}</span>)}</div>
      </div>
      <div className="shift-grid">
        {shifts.map((shift) => <button key={shift.id} onClick={() => onSelect(shift)} className={`shift-button state-${shift.state}`} aria-label={`${shift.title ?? shift.task.name}, ${formatTimeRange(shift.startsAt, shift.endsAt)}, ${shift.remaining} spots open`}><span className="block text-[11px] font-bold uppercase tracking-[.08em] opacity-65">{formatTime(shift.startsAt)}</span><span className="mt-1 block font-display text-2xl font-black tabular-nums">{shift.state === 'full' ? 'Full' : shift.remaining}</span><span className="block text-[10px] font-bold uppercase tracking-[.1em]">{shift.title ? shift.title.split(' — ')[0] : shift.task.name}</span></button>)}
      </div>
    </article>
  );
}

function Field({ label, value, onChange, type = 'text', autoComplete, required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; required?: boolean }) {
  return <label className="block"><span className="eyebrow block text-[10px]">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required={required} className="field-input" /></label>;
}

function ShiftSheet({ shift, alternatives, contact, setContact, pending, message, onClaim, onClose, onAlternative, onMine }: { shift: ShiftView | null; alternatives: ShiftView[]; contact: Contact; setContact: (contact: Contact) => void; pending: boolean; message: string | null; onClaim: (event: React.SyntheticEvent<HTMLFormElement>) => void; onClose: () => void; onAlternative: (shift: ShiftView) => void; onMine: () => void }) {
  const full = shift?.remaining === 0;
  const success = message?.startsWith('You are in');
  return (
    <Sheet open={Boolean(shift)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-xl gap-0 overflow-y-auto border-l-2 border-ink bg-paper p-0 sm:max-w-xl">
        {shift && <><SheetHeader className="border-b-2 border-ink bg-paper-deep p-5 pr-14 sm:p-7 sm:pr-16"><div className="eyebrow">{formatDay(shift.day)} · {formatTimeRange(shift.startsAt, shift.endsAt)}</div><SheetTitle className="mt-2 font-display text-4xl font-black leading-[.9] tracking-tight text-ink">{shift.title ?? shift.task.name}</SheetTitle><SheetDescription className="mt-2 text-base font-semibold text-poppy">{shift.location.name}</SheetDescription></SheetHeader><div className="p-5 sm:p-7">
          <div className="grid grid-cols-3 border-2 border-ink"><Info icon={<Clock3 />} label="Time" value={formatTimeRange(shift.startsAt, shift.endsAt)} /><Info icon={<UsersRound />} label="Open" value={`${shift.remaining} / ${shift.capacity}`} /><Info icon={<CalendarDays />} label="Training" value={shift.task.training === 'lead' ? 'Lead' : 'General'} /></div>
          <div className="mt-5 border-b border-ink pb-5"><h3 className="font-display text-2xl font-black">What you will do</h3><p className="mt-2 text-base leading-relaxed text-ink-soft">{shift.description ?? shift.task.description}</p>{shift.description && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{shift.task.description}</p>}</div>
          {full ? <div className="mt-5"><h3 className="font-display text-2xl font-black">This one is full. Stay nearby.</h3><p className="mt-1 text-sm leading-relaxed text-ink-soft">These open shifts keep the time or location as close as possible.</p><div className="mt-4 space-y-2">{alternatives.length ? alternatives.map((item) => <button key={item.id} onClick={() => onAlternative(item)} className="alternative-row"><span><strong>{item.location.shortName}</strong><br /><span className="text-sm text-ink-soft">{formatTimeRange(item.startsAt, item.endsAt)} · {item.task.name}</span></span><span className="flex items-center gap-2 font-bold text-poppy">{item.remaining} open <ArrowRight className="size-4" /></span></button>) : <p className="border border-ink bg-paper-deep p-4">No nearby alternatives are open right now. Try another day.</p>}</div></div> : success ? <div className="mt-5 border-2 border-ink bg-success p-5"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-ink text-paper"><Check /></span><strong className="font-display text-2xl">{message}</strong></div><Button onClick={onMine} className="mt-5 h-11 w-full rounded-none border-2 border-ink bg-poppy font-bold text-paper hover:bg-poppy-dark">View my shifts</Button></div> : <form onSubmit={onClaim} className="mt-5"><h3 className="font-display text-2xl font-black">Claim this shift</h3><p className="mt-1 text-sm text-ink-soft">Use the same email for every shift. We will keep them together for you.</p><div className="mt-4 grid grid-cols-2 gap-3"><Field label="First name" value={contact.firstName} onChange={(value) => setContact({ ...contact, firstName: value })} autoComplete="given-name" required /><Field label="Last name" value={contact.lastName} onChange={(value) => setContact({ ...contact, lastName: value })} autoComplete="family-name" required /><div className="col-span-2"><Field label="Email" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} type="email" autoComplete="email" required /></div><div className="col-span-2"><Field label="Phone (optional)" value={contact.phone} onChange={(value) => setContact({ ...contact, phone: value })} type="tel" autoComplete="tel" /></div></div>{message && <p role="alert" className="mt-3 border border-poppy bg-poppy-wash p-3 text-sm font-semibold text-poppy-dark">{message}</p>}<Button type="submit" disabled={pending} className="mt-4 h-12 w-full rounded-none border-2 border-ink bg-poppy font-display text-xl font-black text-paper hover:bg-poppy-dark">{pending ? 'Saving your spot…' : `Claim ${formatTime(shift.startsAt)}`}</Button><p className="mt-2 text-xs leading-relaxed text-ink-faint">By signing up, you agree that SCCNH organizers may contact you about training, this shift, and event-day changes.</p></form>}
        </div></>}
      </SheetContent>
    </Sheet>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="border-r border-ink p-2.5 last:border-r-0 sm:p-3"><div className="flex items-center gap-1.5 text-ink-faint [&_svg]:size-3.5">{icon}<span className="eyebrow text-[9px]">{label}</span></div><div className="mt-1 text-sm font-bold leading-tight">{value}</div></div>;
}

function MyShifts({ contact, setContact, dashboard, message, onLookup, onCancel, onBrowse }: { contact: Contact; setContact: (contact: Contact) => void; dashboard: VolunteerDashboard | null; message: string | null; onLookup: (event: React.SyntheticEvent<HTMLFormElement>) => void; onCancel: (signupId: string) => void; onBrowse: () => void }) {
  return (
    <main className="mx-auto min-h-[72vh] max-w-5xl px-4 py-10 sm:px-7 sm:py-16"><div className="eyebrow">Volunteer self-service</div><h1 className="mt-2 font-display text-5xl font-black uppercase leading-[.86] tracking-tight sm:text-7xl">My shifts</h1><form onSubmit={onLookup} className="mt-7 flex max-w-2xl flex-col gap-2 border-y-2 border-ink py-4 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Email used to sign up" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} type="email" autoComplete="email" required /></div><Button type="submit" className="h-11 rounded-none border-2 border-ink bg-poppy px-5 font-bold text-paper hover:bg-poppy-dark">Find my shifts</Button></form>{message && <output className="mt-4 block border border-ink bg-paper-deep p-3 text-sm">{message}</output>}
      {dashboard && <section className="mt-8"><div className="flex flex-col justify-between gap-4 border-b-2 border-ink pb-4 sm:flex-row sm:items-end"><div><div className="eyebrow">Signed in as</div><h2 className="font-display text-3xl font-black">{dashboard.volunteer.firstName} {dashboard.volunteer.lastName}</h2></div><div className="grid grid-cols-2 border-2 border-ink text-sm"><Training label="General training" complete={dashboard.trainings.general} /><Training label="Lead training" complete={dashboard.trainings.lead} /></div></div>{dashboard.shifts.length ? <div className="mt-5 space-y-3">{dashboard.shifts.map((shift) => <article key={shift.signupId} className="grid gap-4 border-2 border-ink bg-paper-deep p-4 sm:grid-cols-[170px_1fr_auto] sm:items-center"><div><div className="eyebrow">{formatDay(shift.day)}</div><div className="font-display text-2xl font-black">{formatTimeRange(shift.startsAt, shift.endsAt)}</div></div><div><h3 className="text-base font-bold">{shift.title ?? shift.task.name}</h3><p className="mt-1 text-sm text-ink-soft">{shift.location.name} · {shift.task.training === 'lead' ? 'Lead training required' : 'General training required'}</p></div><button onClick={() => onCancel(shift.signupId)} className="border border-ink px-3 py-2 text-xs font-bold uppercase tracking-[.1em] hover:bg-ink hover:text-paper">Cancel shift</button></article>)}</div> : <div className="mt-8 border-2 border-ink p-8 text-center"><p className="font-display text-2xl font-black">No active shifts.</p><Button onClick={onBrowse} className="mt-4 rounded-none bg-poppy text-paper">Browse open shifts</Button></div>}</section>}
    </main>
  );
}

function Training({ label, complete }: { label: string; complete: boolean }) {
  return <div className={`flex items-center gap-2 border-r border-ink px-3 py-2 last:border-r-0 ${complete ? 'bg-success' : 'bg-paper'}`}><span className={`flex size-5 items-center justify-center border border-ink text-xs ${complete ? 'bg-ink text-paper' : 'text-transparent'}`}>✓</span><span className="font-bold">{label}</span></div>;
}
