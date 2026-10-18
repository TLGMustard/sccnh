'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import Link from 'next/link';
import { MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatTime, formatTimeRange } from '@/lib/domain';
import type { PublicSnapshot, ShiftView, VolunteerDashboard } from '@/lib/repository';
import { initialVerificationState, signupNextStep, verificationReducer } from '@/lib/signup-verification-state';

type View = 'signup' | 'mine';
type Contact = { firstName: string; lastName: string; email: string; phone: string; wantsSiteLead: boolean };
type WebMcpTool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute(input: unknown): unknown };
type WebMcpContext = { registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void> };

const EMPTY_CONTACT: Contact = { firstName: '', lastName: '', email: '', phone: '', wantsSiteLead: false };

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
  const [queuedShiftIds, setQueuedShiftIds] = useState<string[]>([]);
  const [changingSignupId, setChangingSignupId] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [dashboard, setDashboard] = useState<VolunteerDashboard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verification, dispatchVerification] = useReducer(verificationReducer, initialVerificationState);
  const [verificationCode, setVerificationCode] = useState('');
  const [mineCodeSent, setMineCodeSent] = useState(false);
  const [mineCode, setMineCode] = useState('');

  function updateContact(next: Contact) {
    if (next.email !== contact.email) { dispatchVerification({ type: 'email-changed', email: next.email }); setDashboard(null); setMineCodeSent(false); }
    setContact(next);
  }

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
    const result = await response.json() as { ok?: boolean; code?: string; message?: string; dashboard?: VolunteerDashboard; receipt?: 'sent' | 'failed' };
    return { response, result };
  }

  async function requestVerificationCode() {
    const response = await fetch('/api/verification', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request', email: contact.email }) });
    const result = await response.json() as { ok?: boolean; message?: string };
    if (!response.ok || !result.ok) throw new Error(result.message ?? 'We could not send a verification code.');
    dispatchVerification({ type: 'code-requested', email: contact.email });
    setVerificationCode('');
    setMessage(result.message ?? 'Check your email for a verification code.');
  }

  async function saveClaim() {
    if (!selected) return;
    setPending(true); setMessage(null);
    try {
      const shiftIds = [...new Set([...queuedShiftIds, selected.id])];
      let saved = 0;
      let deliveryFailures = 0;
      const failures: string[] = [];
      for (const shiftId of shiftIds) {
        const { response, result } = await send({ action: 'claim', shiftId, ...contact });
        if (result.code === 'email_verification_required') {
          if (saved === 0) { await requestVerificationCode(); return; }
          failures.push(shiftId);
          continue;
        }
        if (!response.ok || !result.ok || !result.dashboard) { failures.push(shiftId); continue; }
        saved += 1;
        if (result.receipt !== 'sent') deliveryFailures += 1;
        setDashboard(result.dashboard);
      }
      setQueuedShiftIds(failures.filter((id) => id !== selected.id));
      setMessage(saved ? `Shift saved. ${saved} shift${saved === 1 ? '' : 's'} confirmed${failures.length ? `; ${failures.length} could not be saved. Please try those again.` : '.'}${deliveryFailures ? ` ${deliveryFailures} email confirmation${deliveryFailures === 1 ? '' : 's'} could not be sent.` : ' Check your email for confirmation.'}` : 'None of those shifts could be saved. Refresh availability and try again.');
      dispatchVerification({ type: 'confirmed', email: contact.email });
      setVerificationCode('');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'We could not save that shift.'); }
    finally { setPending(false); }
  }

  async function claim(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || signupNextStep(snapshot.emailVerificationRequired, verification, contact.email) === 'confirm') return;
    await saveClaim();
  }

  async function confirmVerification(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !/^\d{6}$/.test(verificationCode)) return;
    setPending(true); setMessage(null);
    try {
      const response = await fetch('/api/verification', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm', email: contact.email, code: verificationCode }) });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) { setMessage(result.message ?? 'We could not verify that code.'); return; }
      dispatchVerification({ type: 'confirmed', email: contact.email });
      setVerificationCode('');
    } catch { setMessage('We could not verify that code.'); return; }
    finally { setPending(false); }
    await saveClaim();
  }

  async function resendVerificationCode() {
    if (pending) return;
    setPending(true); setMessage(null);
    try { await requestVerificationCode(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'We could not send a verification code.'); }
    finally { setPending(false); }
  }

  async function lookup(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage(null);
    try {
      const { response, result } = await send({ action: 'mine', email: contact.email });
      if (result.code === 'email_verification_required') {
        await requestVerificationCode();
        setMineCodeSent(true);
      } else if (!response.ok || !result.dashboard) { setDashboard(null); setMessage('No matching volunteer record.'); }
      else setDashboard(result.dashboard);
    } catch { setMessage('We could not load your shifts.'); }
    finally { setPending(false); }
  }

  async function confirmMine(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(null);
    try {
      const response = await fetch('/api/verification', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm', email: contact.email, code: mineCode }) });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) { setMessage(result.message ?? 'We could not verify that code.'); return; }
      setMineCodeSent(false); setMineCode('');
      const lookupResult = await send({ action: 'mine', email: contact.email });
      if (lookupResult.response.ok && lookupResult.result.dashboard) setDashboard(lookupResult.result.dashboard);
      else setMessage('No matching volunteer record.');
    } catch { setMessage('We could not verify that code.'); }
    finally { setPending(false); }
  }

  async function cancel(signupId: string) {
    setPending(true); setMessage(null);
    try {
      const { response, result } = await send({ action: 'cancel', signupId, email: contact.email });
      if (!response.ok || !result.ok) setMessage(result.message ?? 'That shift could not be found.');
      else { setMessage('Shift cancelled.'); await lookup({ preventDefault() {} } as React.SyntheticEvent<HTMLFormElement>); await refresh(); }
    } finally { setPending(false); }
  }

  async function change(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !changingSignupId || pending) return;
    setPending(true); setMessage(null);
    try {
      const { response, result } = await send({ action: 'change', signupId: changingSignupId, targetShiftId: selected.id, email: contact.email });
      if (!response.ok || !result.ok || !result.dashboard) setMessage(result.message ?? 'We could not change that shift.');
      else { setDashboard(result.dashboard); setChangingSignupId(null); setSelected(null); setView('mine'); setMessage('Shift changed.'); await refresh(); }
    } catch { setMessage('We could not change that shift.'); }
    finally { setPending(false); }
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
            <Link href="/admin" prefetch={false} className="text-orange">Organizer</Link>
          </nav>
        </div>
      </header>

      {view === 'signup' ? (
        <main>
          <section className="border-b-2 border-blue bg-paper-deep">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-7 sm:px-7 sm:py-9">
              <div className="eyebrow text-blue">University of Florida · Bagel Day: Jan 28, 2027 · Packing: Jan 27</div>
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
            {changingSignupId && <div className="mt-5 flex items-center justify-between gap-3 border-2 border-orange bg-orange-wash p-3 text-sm"><span>Choose an open replacement shift. Your current shift stays reserved until this change succeeds.</span><button onClick={() => { setChangingSignupId(null); setMessage(null); }} className="shrink-0 font-bold text-blue underline">Cancel change</button></div>}
            {!changingSignupId && queuedShiftIds.length > 0 && <div className="mt-5 flex items-center justify-between gap-3 border-2 border-orange bg-orange-wash p-3 text-sm"><span>{queuedShiftIds.length} shift{queuedShiftIds.length === 1 ? '' : 's'} selected. Pick one more to finish signing up for all of them together.</span><button onClick={() => setQueuedShiftIds([])} className="shrink-0 font-bold text-blue underline">Clear</button></div>}
            <div className="mt-6 space-y-4">{groups.map((shifts) => <LocationBlock key={shifts[0].locationId} shifts={shifts} onSelect={(shift) => { setSelected(shift); setMessage(null); }} />)}</div>
          </section>
        </main>
      ) : <MyShifts contact={contact} setContact={updateContact} dashboard={dashboard} message={message} pending={pending} codeSent={mineCodeSent} code={mineCode} setCode={setMineCode} onConfirm={confirmMine} onLookup={lookup} onCancel={cancel} onChange={(signupId) => { setChangingSignupId(signupId); setMessage(null); setView('signup'); }} onBrowse={() => setView('signup')} />}

      <footer className="border-t-2 border-blue bg-blue text-paper"><div className="mx-auto max-w-6xl px-4 py-5 text-sm sm:px-7">UF Hillel · SCCNH 2027</div></footer>
      <ShiftSheet shift={selected} queuedCount={queuedShiftIds.length} contact={contact} setContact={updateContact} pending={pending} message={message} changing={Boolean(changingSignupId)} verificationStep={signupNextStep(snapshot.emailVerificationRequired, verification, contact.email)} verificationCode={verificationCode} setVerificationCode={setVerificationCode} onClaim={claim} onConfirm={confirmVerification} onResend={() => void resendVerificationCode()} onBack={() => { dispatchVerification({ type: 'reset' }); setVerificationCode(''); setMessage(null); }} onChange={change} onQueue={() => { if (selected) setQueuedShiftIds((current) => [...new Set([...current, selected.id])]); setSelected(null); setMessage(null); }} onClose={() => setSelected(null)} onAnother={() => { setSelected(null); setMessage(null); }} onMine={() => { setSelected(null); setView('mine'); }} />
    </div>
  );
}

function LocationBlock({ shifts, onSelect }: { shifts: ShiftView[]; onSelect: (shift: ShiftView) => void }) {
  const first = shifts[0]; const open = shifts.reduce((sum, shift) => sum + shift.remaining, 0); const capacity = shifts.reduce((sum, shift) => sum + shift.capacity, 0);
  return <article className="location-block"><div className="location-copy"><div className="eyebrow text-orange">{open} of {capacity} open</div><h3 className="mt-1 font-display text-3xl font-black">{first.location.name}</h3><p className="mt-3 flex gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-orange" />{first.location.walkingNote}</p></div><div className="shift-grid">{shifts.map((shift) => <button key={shift.id} onClick={() => onSelect(shift)} className={`shift-button state-${shift.state}`} aria-label={`${formatTimeRange(shift.startsAt, shift.endsAt)}, ${shift.remaining} spots open`}><span className="block text-xs font-bold">{formatTime(shift.startsAt)}</span><span className="mt-1 block font-display text-2xl font-black tabular-nums">{shift.state === 'full' ? 'Full' : shift.remaining}</span><span className="block text-[11px] font-bold uppercase tracking-[.06em]">{shift.task.name}</span></button>)}</div></article>;
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block"><span className="eyebrow block text-orange">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="field-input" /></label>;
}

function ShiftSheet({
  shift,
  queuedCount,
  contact,
  setContact,
  pending,
  message,
  changing,
  verificationStep,
  verificationCode,
  setVerificationCode,
  onClaim,
  onConfirm,
  onResend,
  onBack,
  onChange,
  onQueue,
  onClose,
  onAnother,
  onMine,
}: {
  shift: ShiftView | null;
  queuedCount: number;
  contact: Contact;
  setContact: (contact: Contact) => void;
  pending: boolean;
  message: string | null;
  changing: boolean;
  verificationStep: 'claim' | 'confirm';
  verificationCode: string;
  setVerificationCode: (code: string) => void;
  onClaim: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onConfirm: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onResend: () => void;
  onBack: () => void;
  onChange: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onQueue: () => void;
  onClose: () => void;
  onAnother: () => void;
  onMine: () => void;
}) {
  const confirming = !changing && verificationStep === 'confirm';

  return <Sheet open={Boolean(shift)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent side="right" className="w-full max-w-xl gap-0 overflow-y-auto border-l-2 border-blue bg-paper p-0">
      {shift && <><SheetHeader className="border-b-2 border-blue bg-paper-deep p-5 pr-14 sm:p-7"><div className="eyebrow text-orange">{formatTimeRange(shift.startsAt, shift.endsAt)}</div><SheetTitle className="mt-2 font-display text-4xl font-black leading-[.9]">{shift.location.name}</SheetTitle><SheetDescription className="mt-2 text-base font-semibold text-orange">{shift.task.name}</SheetDescription></SheetHeader>
        <form onSubmit={changing ? onChange : confirming ? onConfirm : onClaim} className="p-5 sm:p-7">
          {changing ? <p className="text-sm">Your current shift stays reserved unless this replacement is saved.</p> : confirming ? <div>
            <div className="eyebrow text-orange">Verify your email</div>
            <p className="mt-2 text-sm">Enter the six-digit code sent to <strong>{contact.email}</strong>.</p>
            <label className="mt-5 block">
              <span className="eyebrow block text-orange">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className="field-input text-center font-display text-3xl tracking-[.3em]"
                aria-describedby="verification-help"
              />
              <span id="verification-help" className="mt-2 block text-xs">Codes expire after ten minutes.</span>
            </label>
          </div> : <>
            <div className="grid grid-cols-2 gap-3"><Field label="First name" value={contact.firstName} onChange={(value) => setContact({ ...contact, firstName: value })} required /><Field label="Last name" value={contact.lastName} onChange={(value) => setContact({ ...contact, lastName: value })} required /><div className="col-span-2"><Field label="Personal email" type="email" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} required /></div><div className="col-span-2"><Field label="Phone" type="tel" value={contact.phone} onChange={(value) => setContact({ ...contact, phone: value })} required /></div><div className="lead-choice col-span-2"><input id="site-lead-interest" type="checkbox" checked={contact.wantsSiteLead} onChange={(event) => setContact({ ...contact, wantsSiteLead: event.target.checked })} /><label htmlFor="site-lead-interest"><strong>Interested in being a site lead</strong><small>The VC of Ops will contact selected leads.</small></label></div></div>
            <p className="mt-3 text-sm">Use your personal email. We’ll verify it and send a confirmation for each shift. Training is 1.5 hours. Bring your SCCNH shirt.{queuedCount ? ` This will also sign you up for ${queuedCount} selected shift${queuedCount === 1 ? '' : 's'}.` : ''}</p>
          </>}
          {message && <p role="alert" className="mt-3 border border-orange bg-orange-wash p-3 text-sm">{message}</p>}
          <Button type="submit" disabled={pending || shift.remaining === 0 || (confirming && verificationCode.length !== 6)} className="mt-4 h-12 w-full rounded-none bg-orange font-bold text-paper hover:bg-orange-dark">{shift.remaining === 0 ? 'Full' : pending ? confirming ? 'Checking' : 'Saving' : changing ? 'Change shift' : confirming ? 'Verify email and save shifts' : queuedCount ? `Save ${queuedCount + 1} shifts` : 'Save shift'}</Button>
          {!changing && !confirming && !message?.startsWith('Shift saved.') && <Button type="button" onClick={onQueue} disabled={pending || shift.remaining === 0} className="mt-3 h-11 w-full rounded-none border-2 border-blue bg-paper text-blue hover:bg-paper-deep">Add to selection and choose another</Button>}
          {confirming && <div className="mt-3 grid grid-cols-2 gap-3"><Button type="button" onClick={onResend} disabled={pending} className="h-11 rounded-none border-2 border-blue bg-paper px-2 text-blue hover:bg-paper-deep">Send another code</Button><Button type="button" onClick={onBack} disabled={pending} className="h-11 rounded-none border-2 border-blue bg-paper text-blue hover:bg-paper-deep">Back</Button></div>}
          {!changing && message?.startsWith('Shift saved.') && <Button type="button" onClick={onMine} className="mt-3 h-11 w-full rounded-none border-2 border-blue bg-paper text-blue hover:bg-paper-deep">My shifts</Button>}
          {!changing && message?.startsWith('Shift saved.') && <Button type="button" onClick={onAnother} className="mt-3 h-11 w-full rounded-none border-2 border-blue bg-paper text-blue hover:bg-paper-deep">Add another shift</Button>}
        </form></>}
    </SheetContent>
  </Sheet>;
}

function MyShifts({ contact, setContact, dashboard, message, pending, codeSent, code, setCode, onConfirm, onLookup, onCancel, onChange, onBrowse }: { contact: Contact; setContact: (contact: Contact) => void; dashboard: VolunteerDashboard | null; message: string | null; pending: boolean; codeSent: boolean; code: string; setCode: (code: string) => void; onConfirm: (event: React.SyntheticEvent<HTMLFormElement>) => void; onLookup: (event: React.SyntheticEvent<HTMLFormElement>) => void; onCancel: (signupId: string) => void; onChange: (signupId: string) => void; onBrowse: () => void }) {
  return <main className="mx-auto min-h-[72vh] max-w-4xl px-4 py-10 sm:px-7 sm:py-16"><div className="eyebrow text-orange">Private volunteer access</div><h1 className="mt-2 font-display text-5xl font-black uppercase leading-[.86]">My shifts</h1><form onSubmit={codeSent ? onConfirm : onLookup} className="mt-7 grid gap-3 border-y-2 border-blue py-4 sm:grid-cols-[1fr_auto]"><Field label="Personal email" type="email" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} required />{codeSent && <Field label="Six-digit email code" value={code} onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} required />}<Button type="submit" disabled={pending || (codeSent && code.length !== 6)} className="h-11 self-end rounded-none bg-orange text-paper hover:bg-orange-dark">{codeSent ? 'Verify email' : 'Find shifts'}</Button></form>{message && <output className="mt-4 block border border-orange bg-orange-wash p-3 text-sm">{message}</output>}{dashboard && <section className="mt-8"><h2 className="font-display text-3xl font-black">{dashboard.volunteer.firstName} {dashboard.volunteer.lastName}</h2><Button onClick={onBrowse} className="mt-3 rounded-none bg-orange text-paper hover:bg-orange-dark">Add another shift</Button><div className="mt-4 space-y-3">{dashboard.shifts.length ? dashboard.shifts.map((shift) => <article key={shift.signupId} className="grid gap-3 border-2 border-blue bg-paper-deep p-4 sm:grid-cols-[150px_1fr_auto_auto] sm:items-center"><div><div className="text-sm">{compactDay(shift.day).weekday} · {compactDay(shift.day).date}</div><strong className="title-blue font-display text-2xl">{formatTimeRange(shift.startsAt, shift.endsAt)}</strong></div><div><strong>{shift.location.name}</strong><p className="text-sm">{shift.task.name}</p></div><button onClick={() => onChange(shift.signupId)} disabled={pending || shift.status === 'checked_in'} className="border border-orange px-3 py-2 text-xs font-bold uppercase tracking-[.1em] text-orange hover:bg-orange hover:text-paper disabled:cursor-not-allowed disabled:opacity-40">Change</button><button onClick={() => onCancel(shift.signupId)} disabled={pending} className="border border-blue px-3 py-2 text-xs font-bold uppercase tracking-[.1em] text-blue hover:bg-blue hover:text-paper">Cancel</button></article>) : <div className="border-2 border-blue p-6"><p>No active shifts.</p><Button onClick={onBrowse} className="mt-3 rounded-none bg-orange text-paper hover:bg-orange-dark">Browse schedule</Button></div>}</div></section>}</main>;
}
