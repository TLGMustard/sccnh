'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDay, formatTime, formatTimeRange } from '@/lib/domain';
import type { BrowserDashboard, PublicSnapshot, ShiftView } from '@/lib/repository';

type Contact = { firstName: string; lastName: string; email: string; phone: string; wantsSiteLead: boolean };
const EMPTY_CONTACT: Contact = { firstName: '', lastName: '', email: '', phone: '', wantsSiteLead: false };
type WebMcpContext = { registerTool(tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute(input: unknown): unknown }, options?: { signal?: AbortSignal }): void | Promise<void> };

export function VolunteerApp({ initial }: { initial: PublicSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [view, setView] = useState<'signup' | 'mine'>('signup');
  const days = useMemo(() => [...new Set(snapshot.shifts.map((shift) => shift.day))], [snapshot.shifts]);
  const [day, setDay] = useState(initial.event.bagelDay);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<ShiftView | null>(null);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [consent, setConsent] = useState(false);
  const [dashboard, setDashboard] = useState<BrowserDashboard>({ shifts: [] });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/site', { cache: 'no-store' });
    if (response.ok) setSnapshot(await response.json() as PublicSnapshot);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 45000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'list_open_sccnh_shifts', title: 'List open SCCNH shifts', description: 'Read current SCCNH 2027 shift availability.',
      inputSchema: { type: 'object', properties: { day: { type: 'string' }, locationId: { type: 'string' } }, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const filters = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
        return snapshot.shifts.filter((shift) => shift.remaining > 0 && (typeof filters.day !== 'string' || shift.day === filters.day) && (typeof filters.locationId !== 'string' || shift.locationId === filters.locationId)).map((shift) => ({ shiftId: shift.id, day: shift.day, time: formatTimeRange(shift.startsAt, shift.endsAt), location: shift.location.name, role: shift.title ?? shift.task.name, remaining: shift.remaining }));
      },
    }, { signal: controller.signal })).catch(() => undefined);
    return () => controller.abort();
  }, [snapshot.shifts]);

  const selected = snapshot.shifts.filter((shift) => selectedIds.includes(shift.id));
  const groups = useMemo(() => {
    const byLocation = new Map<string, ShiftView[]>();
    for (const shift of snapshot.shifts.filter((item) => item.day === day)) byLocation.set(shift.locationId, [...(byLocation.get(shift.locationId) ?? []), shift]);
    return [...byLocation.values()];
  }, [day, snapshot.shifts]);

  async function loadMine() {
    const response = await fetch('/api/signup', { cache: 'no-store' });
    const result = await response.json() as { dashboard?: BrowserDashboard; message?: string };
    if (!response.ok || !result.dashboard) throw new Error(result.message ?? 'Your shifts could not be loaded.');
    setDashboard(result.dashboard);
  }

  async function goMine() {
    setView('mine'); setMessage(null); setPending(true);
    try { await loadMine(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Your shifts could not be loaded.'); }
    finally { setPending(false); }
  }

  async function send(body: Record<string, unknown>) {
    const response = await fetch('/api/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as { ok?: boolean; message?: string };
    if (!response.ok || !result.ok) throw new Error(result.message ?? 'We could not save this change.');
    return result;
  }

  function select(shift: ShiftView) {
    if (pending) return;
    setMessage(null);
    if (changingId) { setReplacement(shift); return; }
    if (selectedIds.includes(shift.id)) setSelectedIds(selectedIds.filter((id) => id !== shift.id));
    else if (selectedIds.length < 20) setSelectedIds([...selectedIds, shift.id]);
    else setMessage('Save up to 20 shifts at a time.');
  }

  async function claim(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !consent || !selected.length) return;
    setPending(true); setMessage(null);
    try {
      await send({ action: 'claim', shiftIds: selectedIds, ...contact, consent });
      setSelectedIds([]); setCheckout(false); setView('mine');
      setMessage('Shifts saved. Keep using this browser to view or change them.');
      await Promise.all([loadMine(), refresh()]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'We could not save your shifts.'); }
    finally { setPending(false); }
  }

  async function cancel(signupId: string) {
    if (pending) return;
    setPending(true); setMessage(null);
    try { await send({ action: 'cancel', signupId }); await Promise.all([loadMine(), refresh()]); setMessage('Shift cancelled.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'We could not cancel that shift.'); }
    finally { setPending(false); }
  }

  async function change(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!replacement || !changingId || pending) return;
    setPending(true); setMessage(null);
    try {
      await send({ action: 'change', signupId: changingId, targetShiftId: replacement.id });
      setChangingId(null); setReplacement(null); setView('mine');
      await Promise.all([loadMine(), refresh()]); setMessage('Shift changed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'We could not change that shift.'); }
    finally { setPending(false); }
  }

  const totalOpen = snapshot.shifts.reduce((sum, shift) => sum + shift.remaining, 0);
  return <div className="min-h-screen bg-paper text-ink">
    <header className="border-b-2 border-blue bg-paper"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7">
      <button type="button" onClick={() => setView('signup')} className="min-w-0 text-left font-display text-lg font-black sm:text-2xl"><span className="title-blue">Spread </span><span className="title-orange">Cream Cheese </span><span className="title-blue">Not Hate</span></button>
      <nav className="flex items-center gap-4 text-xs font-bold uppercase tracking-[.1em]" aria-label="Site navigation"><button type="button" onClick={() => setView('signup')} className="text-blue">Schedule</button><button type="button" onClick={() => void goMine()} className="text-blue">My shifts</button><Link href="/admin" prefetch={false} className="text-orange">Organizer</Link></nav>
    </div></header>

    {view === 'signup' ? <main>
      <section className="border-b-2 border-blue bg-paper-deep"><div className="mx-auto max-w-6xl px-4 py-7 sm:px-7 sm:py-9">
        <div className="eyebrow text-blue">University of Florida · Bagel Day · {formatDay(snapshot.event.bagelDay)}, 2027</div>
        <h1 className="mt-4 font-display text-[clamp(2.7rem,8vw,6.8rem)] font-black uppercase leading-[.85] tracking-[-.045em]"><span className="title-blue">Spread </span><span className="title-orange">Cream Cheese </span><span className="title-blue">Not Hate</span></h1>
        <p className="mt-5 text-sm">Select your shifts. Sign up once with your personal email.</p>
      </div></section>
      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-7 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-blue pb-4"><h2 className="font-display text-4xl font-black uppercase">Find shifts</h2><div className="flex items-center gap-3 text-sm"><span>{totalOpen} spots open</span><button type="button" onClick={() => void refresh().catch(() => setMessage('Availability could not be refreshed.'))} className="text-blue" aria-label="Refresh availability"><RefreshCw className="size-4" /></button></div></div>
        <div className="day-tabs mt-5" role="tablist" aria-label="Event days">{days.map((item) => {
          const role = item === snapshot.event.bagelDay ? 'Bagel Day' : item === '2027-01-27' ? 'Pre-packaging' : 'Announcing';
          return <button key={item} type="button" role="tab" aria-label={`${formatDay(item)}, ${role}`} aria-selected={item === day} onClick={() => setDay(item)} className="day-tab"><span className="day-tab-label"><span className="block font-display text-base font-black sm:text-xl">{formatDay(item)}</span><span className="mt-1 block text-[10px] font-bold uppercase sm:text-xs">{role}</span></span></button>;
        })}</div>
        {changingId && <div className="mt-5 flex items-center justify-between gap-3 border-2 border-orange bg-orange-wash p-3 text-sm"><span>Choose a replacement. Your current shift stays booked until the change is saved.</span><button type="button" onClick={() => { setChangingId(null); setMessage(null); }} className="font-bold text-blue underline">Cancel change</button></div>}
        {message && <output className="mt-4 block border border-orange bg-orange-wash p-3 text-sm">{message}</output>}
        <div className="mt-6 space-y-4">{groups.map((shifts) => <LocationBlock key={shifts[0].locationId} shifts={shifts} selectedIds={selectedIds} onSelect={select} />)}</div>
        {!changingId && selected.length > 0 && <div className="sticky bottom-3 mt-5 flex flex-wrap items-center justify-between gap-3 border-2 border-blue bg-paper p-4 shadow-lg"><strong className="text-blue">{selected.length} shift{selected.length === 1 ? '' : 's'} selected</strong><div className="flex gap-4"><button type="button" onClick={() => setSelectedIds([])} className="text-sm text-blue underline">Clear</button><Button onClick={() => { setMessage(null); setCheckout(true); }} className="rounded-none bg-orange text-paper">Review &amp; sign up</Button></div></div>}
      </section>
    </main> : <main className="mx-auto min-h-[72vh] max-w-4xl px-4 py-10 sm:px-7">
      <h1 className="font-display text-5xl font-black uppercase">My shifts</h1><p className="mt-3 text-sm">Bookings made in this browser. For earlier bookings or another device, contact an organizer.</p>
      {message && <output className="mt-4 block border border-orange bg-orange-wash p-3 text-sm">{message}</output>}
      {pending && <output className="mt-4 block text-sm">Loading…</output>}
      <div className="mt-7 space-y-3">{dashboard.shifts.map((shift) => <article key={shift.signupId} className="grid gap-3 border-2 border-blue p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><strong className="text-blue">{formatDay(shift.day)} · {formatTimeRange(shift.startsAt, shift.endsAt)}</strong><p className="mt-1 text-sm">{shift.location.name} · {shift.title ?? shift.task.name}</p></div><button type="button" disabled={pending || shift.status === 'checked_in'} onClick={() => { setChangingId(shift.signupId); setMessage(null); setView('signup'); }} className="border border-orange px-3 py-2 text-sm font-bold text-orange disabled:opacity-40">Change</button><button type="button" disabled={pending} onClick={() => void cancel(shift.signupId)} className="border border-blue px-3 py-2 text-sm font-bold text-blue disabled:opacity-40">Cancel</button></article>)}</div>
      {!dashboard.shifts.length && !pending && <p className="mt-7 text-sm">No bookings saved in this browser.</p>}
      <Button onClick={() => setView('signup')} className="mt-5 rounded-none bg-orange text-paper">Browse shifts</Button>
    </main>}

    <footer className="border-t-2 border-blue bg-blue text-paper"><div className="mx-auto max-w-6xl px-4 py-5 text-sm sm:px-7">UF Hillel · SCCNH 2027</div></footer>
    <Sheet open={checkout || Boolean(replacement)} onOpenChange={(open) => { if (!open && !pending) { setCheckout(false); setReplacement(null); } }}><SheetContent side="right" className="w-full max-w-xl overflow-y-auto border-l-2 border-blue bg-paper p-0">
      <SheetHeader className="border-b-2 border-blue bg-paper-deep p-6 pr-14"><SheetTitle className="font-display text-4xl font-black">{replacement ? 'Change shift' : 'Sign up'}</SheetTitle><SheetDescription>{replacement ? 'Your current booking stays reserved until this succeeds.' : `${selected.length} shifts · Personal email · No password`}</SheetDescription></SheetHeader>
      <form onSubmit={replacement ? change : claim} className="p-6">
        <ul className="mb-5 divide-y divide-blue border-y border-blue">{(replacement ? [replacement] : selected).map((shift) => <li key={shift.id} className="flex items-start justify-between gap-2 py-3 text-sm"><div><strong className="text-blue">{formatDay(shift.day)} · {formatTimeRange(shift.startsAt, shift.endsAt)}</strong><p>{shift.location.name} · {shift.title ?? shift.task.name}</p></div>{!replacement && <button type="button" aria-label={`Remove ${shift.location.name} at ${formatTime(shift.startsAt)}`} onClick={() => setSelectedIds(selectedIds.filter((id) => id !== shift.id))} className="text-orange underline">Remove</button>}</li>)}</ul>
        {!replacement && <><div className="grid grid-cols-2 gap-3"><Field label="First name" value={contact.firstName} onChange={(firstName) => setContact({ ...contact, firstName })} /><Field label="Last name" value={contact.lastName} onChange={(lastName) => setContact({ ...contact, lastName })} /><div className="col-span-2"><Field label="Personal email" type="email" value={contact.email} onChange={(email) => setContact({ ...contact, email })} /></div><div className="col-span-2"><Field label="Phone" type="tel" value={contact.phone} onChange={(phone) => setContact({ ...contact, phone })} /></div></div>
          <label className="lead-choice mt-4" aria-label="Interested in being a site lead"><input type="checkbox" checked={contact.wantsSiteLead} onChange={(event) => setContact({ ...contact, wantsSiteLead: event.target.checked })} /><span><strong>Interested in being a site lead</strong><small>The VC of Ops will contact selected leads.</small></span></label>
          <p className="mt-4 text-sm">Training: 1.5 hours. Bring your SCCNH shirt. Event shirts are provided at training.</p>
          <label className="lead-choice mt-4"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span className="text-sm">I agree to volunteer for the selected shifts and let organizers use my contact details for this event.</span></label>
          <p className="mt-3 text-xs">My shifts stays private in this browser. Contact an organizer for access from another device.</p>
        </>}
        {message && <p role="alert" className="mt-4 border border-orange bg-orange-wash p-3 text-sm">{message}</p>}
        <Button type="submit" disabled={pending || (!replacement && (!selected.length || !consent))} className="mt-5 h-12 w-full rounded-none bg-orange text-paper">{pending ? 'Saving…' : replacement ? 'Save change' : `Save ${selected.length} shift${selected.length === 1 ? '' : 's'}`}</Button>
      </form>
    </SheetContent></Sheet>
  </div>;
}

function LocationBlock({ shifts, selectedIds, onSelect }: { shifts: ShiftView[]; selectedIds: string[]; onSelect: (shift: ShiftView) => void }) {
  const first = shifts[0];
  return <article className="location-block"><div className="location-copy"><div className="eyebrow text-orange">{shifts.reduce((sum, shift) => sum + shift.remaining, 0)} spots open</div><h3 className="mt-1 font-display text-3xl font-black">{first.location.name}</h3><p className="mt-3 flex gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-orange" />{first.location.walkingNote}</p></div><div className="shift-grid">{shifts.map((shift) => {
    const selected = selectedIds.includes(shift.id);
    return <button key={shift.id} type="button" disabled={!selected && shift.remaining === 0} onClick={() => onSelect(shift)} aria-pressed={selected} className={`shift-button state-${shift.state}`} aria-label={`${first.location.name}, ${formatTimeRange(shift.startsAt, shift.endsAt)}, ${shift.remaining} spots open${selected ? ', selected' : ''}`}><span className="block text-xs font-bold">{formatTimeRange(shift.startsAt, shift.endsAt)}</span><span className="mt-1 flex items-center justify-center gap-1 font-display text-2xl font-black">{selected && <Check aria-hidden="true" className="size-5" />}{shift.remaining === 0 ? 'Full' : shift.remaining}</span><span className="block text-[11px] font-bold uppercase tracking-[.06em]">{selected ? 'Selected' : shift.title ?? shift.task.name}</span></button>;
  })}</div></article>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="eyebrow block text-orange">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required maxLength={type === 'email' ? 254 : type === 'tel' ? 32 : 80} autoComplete={type === 'email' ? 'email' : type === 'tel' ? 'tel' : label === 'First name' ? 'given-name' : 'family-name'} className="field-input" /></label>;
}
