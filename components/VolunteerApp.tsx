'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatTime, formatTimeRange } from '@/lib/domain';
import type { PublicSnapshot, ShiftView, VolunteerDashboard } from '@/lib/repository';

type View = 'signup' | 'mine';
type Contact = { firstName: string; lastName: string; email: string; phone: string; accessCode: string; wantsSiteLead: boolean };
type WebMcpTool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute(input: unknown): unknown };
type WebMcpContext = { registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void> };

const EMPTY_CONTACT: Contact = { firstName: '', lastName: '', email: '', phone: '', accessCode: '', wantsSiteLead: false };

function compactDay(day: string): { weekday: string; date: string } {
  const date = new Date(`${day}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date),
    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date),
  };
}

export function VolunteerApp({ initial }: { initial: PublicSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [view, setView] = useState<View>('signup');
  const days = useMemo(() => [...new Set(snapshot.shifts.map((shift) => shift.day))], [snapshot.shifts]);
  const [day, setDay] = useState(days.at(-1) ?? initial.event.startDate);
  const [selected, setSelected] = useState<ShiftView | null>(null);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [dashboard, setDashboard] = useState<VolunteerDashboard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/site', { cache: 'no-store' });
    if (!response.ok) return;
    const next = (await response.json()) as PublicSnapshot;
    setSnapshot(next);
    setSelected((current) => current ? next.shifts.find((shift) => shift.id === current.id) ?? null : null);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(refresh, 45000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const groups = useMemo(() => {
    const byLocation = new Map<string, ShiftView[]>();
    for (const shift of snapshot.shifts.filter((item) => item.day === day)) byLocation.set(shift.locationId, [...(byLocation.get(shift.locationId) ?? []), shift]);
    return [...byLocation.values()];
  }, [day, snapshot.shifts]);

  async function send(body: Record<string, unknown>) {
    const response = await fetch('/api/site', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as { ok?: boolean; message?: string; dashboard?: VolunteerDashboard; receipt?: 'sent' | 'failed' };
    return { response, result };
  }

  async function claim(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending) return;
    setPending(true); setMessage(null);
    try {
      const { response, result } = await send({ action: 'claim', shiftId: selected.id, ...contact });
      if (!response.ok || !result.ok || !result.dashboard) setMessage(result.message ?? 'We could not save that shift.');
      else { setDashboard(result.dashboard); setMessage(result.receipt === 'sent' ? 'Shift saved. Check your email for confirmation.' : 'Shift saved. We could not send the email receipt.'); await refresh(); }
    } catch { setMessage('We could not save that shift.'); }
    finally { setPending(false); }
  }

  async function lookup(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage(null);
    try {
      const { response, result } = await send({ action: 'mine', email: contact.email, accessCode: contact.accessCode });
      if (!response.ok || !result.dashboard) { setDashboard(null); setMessage('No matching volunteer record.'); }
      else setDashboard(result.dashboard);
    } catch { setMessage('We could not load your shifts.'); }
    finally { setPending(false); }
  }

  async function cancel(signupId: string) {
    setPending(true); setMessage(null);
    try {
      const { response, result } = await send({ action: 'cancel', signupId, email: contact.email, accessCode: contact.accessCode });
      if (!response.ok || !result.ok) setMessage(result.message ?? 'That shift could not be found.');
      else { setMessage('Shift cancelled.'); await lookup({ preventDefault() {} } as React.SyntheticEvent<HTMLFormElement>); await refresh(); }
    } finally { setPending(false); }
  }

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const register = (tool: WebMcpTool) => void Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(() => undefined);
    register({
      name: 'list_open_sccnh_shifts', title: 'List open SCCNH shifts', description: 'Read current SCCNH 2027 shift availability.', inputSchema: { type: 'object', properties: { day: { type: 'string' }, locationId: { type: 'string' } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const filters = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
        return snapshot.shifts.filter((shift) => shift.remaining > 0 && (typeof filters.day !== 'string' || shift.day === filters.day) && (typeof filters.locationId !== 'string' || shift.locationId === filters.locationId)).map((shift) => ({ shiftId: shift.id, day: shift.day, time: formatTimeRange(shift.startsAt, shift.endsAt), location: shift.location.name, role: shift.title ?? shift.task.name, remaining: shift.remaining }));
      },
    });
    return () => controller.abort();
  }, [snapshot.shifts]);

  const totalOpen = snapshot.shifts.reduce((sum, shift) => sum + shift.remaining, 0);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b-2 border-blue bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-7">
          <button onClick={() => setView('signup')} className="min-w-0 text-left font-display text-lg font-black leading-none tracking-tight sm:text-2xl">
            <span className="title-blue">Spread </span><span className="title-orange">Cream Cheese </span><span className="title-blue">Not Hate</span>
          </button>
          <nav className="flex shrink-0 items-center gap-3 text-xs font-bold uppercase tracking-[.1em] sm:gap-5" aria-label="Site navigation">
            <button onClick={() => setView('signup')} className={view === 'signup' ? 'text-blue underline decoration-orange decoration-2 underline-offset-4' : 'text-blue'}>Schedule</button>
            <button onClick={() => setView('mine')} className={view === 'mine' ? 'text-blue underline decoration-orange decoration-2 underline-offset-4' : 'text-blue'}>My shifts</button>
            <Link href="/admin" className="hidden text-orange sm:block">Organizer</Link>
          </nav>
        </div>
      </header>

      {view === 'signup' ? (
        <main>
          <section className="border-b-2 border-blue bg-paper-deep">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-7 sm:px-7 sm:py-9">
              <div className="eyebrow text-blue">University of Florida · Jan 25 to 27, 2027</div>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <h1 className="font-display text-[clamp(2.7rem,8vw,6.8rem)] font-black uppercase leading-[.8] tracking-[-.045em]"><span className="title-blue">Spread </span><span className="title-orange">Cream Cheese </span><span className="title-blue">Not Hate</span></h1>
                <div className="flex items-baseline gap-4 border-l-2 border-orange pl-4"><strong className="title-blue font-display text-4xl tabular-nums">{totalOpen}</strong><span className="text-sm">spots open</span><button onClick={refresh} className="text-blue" aria-label="Refresh availability"><RefreshCw className="size-4" /></button></div>
              </div>
            </div>
          </section>
          <section className="mx-auto max-w-6xl px-4 py-7 sm:px-7 sm:py-10">
            <div className="flex items-end justify-between gap-3 border-b-2 border-blue pb-4"><div><div className="eyebrow text-orange">Choose a day</div><h2 className="font-display text-4xl font-black uppercase leading-none">Find a shift</h2></div><span className="text-xs">Open counts update live.</span></div>
            <div className="day-tabs mt-5" role="tablist" aria-label="Event days">
              {days.map((item) => {
                const label = compactDay(item); const open = snapshot.shifts.filter((shift) => shift.day === item).reduce((sum, shift) => sum + shift.remaining, 0);
                const active = item === day;
                return <button key={item} type="button" role="tab" aria-selected={active} aria-label={`${label.weekday}, ${label.date}, ${open} spots open`} onClick={() => setDay(item)} className="day-tab"><span className="day-tab-label"><span className="block font-display text-base font-black sm:text-xl">{label.weekday}</span><span className="block text-[11px] font-bold uppercase tracking-[.08em]">{label.date}</span><span className="block text-[11px]">{open} open</span></span></button>;
              })}
            </div>
            <div className="mt-6 space-y-4">{groups.map((shifts) => <LocationBlock key={shifts[0].locationId} shifts={shifts} onSelect={(shift) => { setSelected(shift); setMessage(null); }} />)}</div>
          </section>
        </main>
      ) : <MyShifts contact={contact} setContact={setContact} dashboard={dashboard} message={message} pending={pending} onLookup={lookup} onCancel={cancel} onBrowse={() => setView('signup')} />}

      <footer className="border-t-2 border-blue bg-blue text-paper"><div className="mx-auto max-w-6xl px-4 py-5 text-sm sm:px-7">UF Hillel · SCCNH 2027</div></footer>
      <ShiftSheet shift={selected} contact={contact} setContact={setContact} pending={pending} message={message} onClaim={claim} onClose={() => setSelected(null)} onMine={() => { setSelected(null); setView('mine'); }} />
    </div>
  );
}

function LocationBlock({ shifts, onSelect }: { shifts: ShiftView[]; onSelect: (shift: ShiftView) => void }) {
  const first = shifts[0]; const open = shifts.reduce((sum, shift) => sum + shift.remaining, 0); const capacity = shifts.reduce((sum, shift) => sum + shift.capacity, 0);
  return <article className="location-block"><div className="location-copy"><div className="eyebrow text-orange">{open} of {capacity} open</div><h3 className="mt-1 font-display text-3xl font-black">{first.location.name}</h3><p className="mt-3 flex gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-orange" />{first.location.walkingNote}</p></div><div className="shift-grid">{shifts.map((shift) => <button key={shift.id} onClick={() => onSelect(shift)} className={`shift-button state-${shift.state}`} aria-label={`${formatTimeRange(shift.startsAt, shift.endsAt)}, ${shift.remaining} spots open`}><span className="block text-xs font-bold">{formatTime(shift.startsAt)}</span><span className="mt-1 block font-display text-2xl font-black tabular-nums">{shift.state === 'full' ? 'Full' : shift.remaining}</span><span className="block text-[11px] font-bold uppercase tracking-[.06em]">{shift.task.training} training</span></button>)}</div></article>;
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block"><span className="eyebrow block text-orange">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="field-input" /></label>;
}

function ShiftSheet({ shift, contact, setContact, pending, message, onClaim, onClose, onMine }: { shift: ShiftView | null; contact: Contact; setContact: (contact: Contact) => void; pending: boolean; message: string | null; onClaim: (event: React.SyntheticEvent<HTMLFormElement>) => void; onClose: () => void; onMine: () => void }) {
  return <Sheet open={Boolean(shift)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent side="right" className="w-full max-w-xl gap-0 overflow-y-auto border-l-2 border-blue bg-paper p-0">
      {shift && <><SheetHeader className="border-b-2 border-blue bg-paper-deep p-5 pr-14 sm:p-7"><div className="eyebrow text-orange">{formatTimeRange(shift.startsAt, shift.endsAt)}</div><SheetTitle className="mt-2 font-display text-4xl font-black leading-[.9]">{shift.location.name}</SheetTitle><SheetDescription className="mt-2 text-base font-semibold text-orange">{shift.task.training} training</SheetDescription></SheetHeader>
        <form onSubmit={onClaim} className="p-5 sm:p-7"><div className="grid grid-cols-2 gap-3"><Field label="First name" value={contact.firstName} onChange={(value) => setContact({ ...contact, firstName: value })} required /><Field label="Last name" value={contact.lastName} onChange={(value) => setContact({ ...contact, lastName: value })} required /><div className="col-span-2"><Field label="Email" type="email" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} required /></div><div className="col-span-2"><Field label="Phone" type="tel" value={contact.phone} onChange={(value) => setContact({ ...contact, phone: value })} required /></div><div className="col-span-2"><Field label="Access code" type="password" value={contact.accessCode} onChange={(value) => setContact({ ...contact, accessCode: value })} required /></div><div className="lead-choice col-span-2"><input id="site-lead-interest" type="checkbox" checked={contact.wantsSiteLead} onChange={(event) => setContact({ ...contact, wantsSiteLead: event.target.checked })} /><label htmlFor="site-lead-interest"><strong>Interested in being a site lead</strong><small>The VC of Ops will contact selected leads.</small></label></div></div><p className="mt-3 text-sm">Training is 1.5 hours. Bring your SCCNH shirt. Event shirts are provided at training. Use your access code to view or cancel shifts.</p>{message && <p role="alert" className="mt-3 border border-orange bg-orange-wash p-3 text-sm">{message}</p>}<Button type="submit" disabled={pending || shift.remaining === 0} className="mt-4 h-12 w-full rounded-none bg-orange font-bold text-paper hover:bg-orange-dark">{shift.remaining === 0 ? 'Full' : pending ? 'Saving' : 'Save shift'}</Button>{message?.startsWith('Shift saved.') && <Button type="button" onClick={onMine} className="mt-3 h-11 w-full rounded-none border-2 border-blue bg-paper text-blue hover:bg-paper-deep">My shifts</Button>}</form></>}
    </SheetContent>
  </Sheet>;
}

function MyShifts({ contact, setContact, dashboard, message, pending, onLookup, onCancel, onBrowse }: { contact: Contact; setContact: (contact: Contact) => void; dashboard: VolunteerDashboard | null; message: string | null; pending: boolean; onLookup: (event: React.SyntheticEvent<HTMLFormElement>) => void; onCancel: (signupId: string) => void; onBrowse: () => void }) {
  return <main className="mx-auto min-h-[72vh] max-w-4xl px-4 py-10 sm:px-7 sm:py-16"><div className="eyebrow text-orange">Private volunteer access</div><h1 className="mt-2 font-display text-5xl font-black uppercase leading-[.86]">My shifts</h1><form onSubmit={onLookup} className="mt-7 grid gap-3 border-y-2 border-blue py-4 sm:grid-cols-[1fr_1fr_auto]"><Field label="Email" type="email" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} required /><Field label="Access code" type="password" value={contact.accessCode} onChange={(value) => setContact({ ...contact, accessCode: value })} required /><Button type="submit" disabled={pending} className="h-11 self-end rounded-none bg-orange text-paper hover:bg-orange-dark">Find shifts</Button></form>{message && <output className="mt-4 block border border-orange bg-orange-wash p-3 text-sm">{message}</output>}{dashboard && <section className="mt-8"><h2 className="font-display text-3xl font-black">{dashboard.volunteer.firstName} {dashboard.volunteer.lastName}</h2><div className="mt-4 space-y-3">{dashboard.shifts.length ? dashboard.shifts.map((shift) => <article key={shift.signupId} className="grid gap-3 border-2 border-blue bg-paper-deep p-4 sm:grid-cols-[150px_1fr_auto] sm:items-center"><div><div className="text-sm">{compactDay(shift.day).weekday} · {compactDay(shift.day).date}</div><strong className="title-blue font-display text-2xl">{formatTimeRange(shift.startsAt, shift.endsAt)}</strong></div><div><strong>{shift.location.name}</strong><p className="text-sm">{shift.task.training} training</p></div><button onClick={() => onCancel(shift.signupId)} disabled={pending} className="border border-blue px-3 py-2 text-xs font-bold uppercase tracking-[.1em] text-blue hover:bg-blue hover:text-paper">Cancel</button></article>) : <div className="border-2 border-blue p-6"><p>No active shifts.</p><Button onClick={onBrowse} className="mt-3 rounded-none bg-orange text-paper hover:bg-orange-dark">Browse schedule</Button></div>}</div></section>}</main>;
}
