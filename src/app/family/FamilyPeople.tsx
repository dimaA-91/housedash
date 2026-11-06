'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MEMBER_COLORS, type FamilyMember } from '@/types/family';
import { HOUSEHOLD } from './household';
import { birthdayEvents, isBirthdayCategory } from '@/lib/family-birthdays';
export { birthdayEvents, recurringBirthdayEvents, isBirthdayCategory } from '@/lib/family-birthdays';

export const isBirthdayEvent = (event: { id: string }) => event.id.startsWith('birthday:');
/** Termine, die aus Familienangaben entstehen und im Kalender nicht bearbeitet werden. */
export const isDerivedEvent = (event: { id: string }) => event.id.startsWith('waste:') || isBirthdayEvent(event);

const pad = (n: number) => String(n).padStart(2, '0');


/** Kleine Geburtstagstorte als Symbol, weil Emoji auf dem Pi nicht sicher dargestellt werden. */
export function BirthdayCake({ size = 22 }: { size?: number }) {
  return <svg className="family-bin" viewBox="0 0 32 32" width={size} height={size} role="img" aria-label="Geburtstag" focusable="false">
    <rect x="15" y="3" width="2" height="6" rx="1" fill="#f59e0b" /><ellipse cx="16" cy="3" rx="2" ry="2.4" fill="#fb923c" />
    <rect x="6" y="10" width="20" height="7" rx="2" fill="#f472b6" />
    <path d="M6 14c2 3 4 0 5.300 2.200 1.500-2.500 3.700 1 4.700-1.400 1.200 2.600 3.200-.4 4.500 1.800C22 15 24 15.500 26 14v3H6z" fill="#fff" opacity=".85" />
    <rect x="4" y="17" width="24" height="11" rx="3" fill="#a78bfa" /><rect x="4" y="22" width="24" height="2.500" fill="#fff" opacity=".4" />
  </svg>;
}

interface Person { id?: string; name: string; color: string; birthday?: string; emoji?: string }

/** Familienliste, Familienname und die daraus entstehenden Geburtstage. */
export function useFamilyPeople() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [revision, setRevision] = useState('');
  const [profileRevision, setProfileRevision] = useState('');
  const [familyName, setFamilyName] = useState<string>(HOUSEHOLD.name);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    try {
      const family = await fetch('/api/family/household', { cache: 'no-store' });
      if (family.ok) { const value = await family.json(); setMembers(value.members); setRevision(value.revision); setFamilyName(value.familyName); setProfileRevision(value.profileRevision); }
    } catch { /* letzter Stand bleibt */ } finally { setReady(true); }
  }, []);
  useEffect(() => {
    void load();
    const wake = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('housedash-change', load);
    return () => { document.removeEventListener('visibilitychange', wake); window.removeEventListener('housedash-change', load); };
  }, [load]);
  /** Speichert Familienname und Personen. Gibt eine Fehlermeldung zurück oder nichts. */
  async function save(name: string, people: Person[]): Promise<string | undefined> {
    const keep = new Set(people.map(p => p.id).filter(Boolean));
    const removedIds = members.filter(m => !keep.has(m.id)).map(m => m.id);
    const res = await fetch('/api/family/household', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ familyName: name, members: people, revision, removedIds, profileRevision }) });
    if (!res.ok) { await load(); return res.status === 409 ? 'Die Familie wurde inzwischen geändert. Bitte noch einmal speichern.' : 'Die Familie konnte nicht gespeichert werden.'; }
    const value = await res.json();
    setMembers(value.members); setRevision(value.revision); setFamilyName(value.familyName); setProfileRevision(value.profileRevision);
    return undefined;
  }
  const year = new Date().getFullYear();
  const events = useMemo(() => birthdayEvents(members, year), [members, year]);
  return { members, familyName, ready, events, save };
}
type People = ReturnType<typeof useFamilyPeople>;

const years = Array.from({ length: new Date().getFullYear() - 1929 }, (_, i) => new Date().getFullYear() - i);
const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('de-DE', { month: 'long' }));
const split = (b?: string) => { const m = b?.match(/^(\d{4}|----)-(\d{2}|--)-(\d{2}|--)$/); const keep = (v?: string) => (v && !v.includes('-') ? v : ''); return { y: keep(m?.[1]), m: keep(m?.[2]), d: keep(m?.[3]) }; };

/** Tag, Monat und Jahr als Auswahlfelder (kein Kalender-Popup, das am Touchscreen schlecht geht).
 *  Unvollständige Angaben werden als Teilstring weitergegeben und beim Speichern bemängelt. */
export function BirthdayPicker({ value, onChange }: { value?: string; onChange: (value: string | undefined) => void }) {
  const [part, setPart] = useState(() => split(value));
  const change = (key: 'y' | 'm' | 'd', v: string) => {
    const next = { ...part, [key]: v };
    setPart(next);
    onChange(!next.y && !next.m && !next.d ? undefined : `${next.y || '----'}-${next.m || '--'}-${next.d || '--'}`);
  };
  return <div className="family-birthday" role="group" aria-label="Geburtstag">
    <select aria-label="Tag" value={part.d} onChange={e => change('d', e.target.value)}><option value="">Tag</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={pad(i + 1)}>{i + 1}</option>)}</select>
    <select aria-label="Monat" value={part.m} onChange={e => change('m', e.target.value)}><option value="">Monat</option>{months.map((name, i) => <option key={name} value={pad(i + 1)}>{name}</option>)}</select>
    <select aria-label="Jahr" value={part.y} onChange={e => change('y', e.target.value)}><option value="">Jahr</option>{years.map(year => <option key={year} value={String(year)}>{year}</option>)}</select>
  </div>;
}

const validDate = (b?: string) => {
  if (!b) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
  const date = new Date(`${b}T12:00:00Z`);
  return date.toISOString().startsWith(b) && date.getTime() <= Date.now();
};

/** Seite "Familie" unter Mehr: Name der Familie, Personen mit Farbe und Geburtstag. */
export function FamilySettings({ people }: { people: People }) {
  const [name, setName] = useState(people.familyName);
  const [draft, setDraft] = useState<Person[] | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (people.ready && draft === null) { setDraft(people.members.map(({ id, name: n, color, birthday, emoji }) => ({ id, name: n, color, birthday, emoji }))); setName(people.familyName); } }, [people.ready, people.members, people.familyName, draft]);
  if (!draft) return <p role="status" className="family-empty">Wird geladen …</p>;
  const update = (i: number, patch: Partial<Person>) => setDraft(draft.map((p, n) => n === i ? { ...p, ...patch } : p));
  const add = (nameValue = '') => setDraft(d => [...(d ?? []), { name: nameValue, color: MEMBER_COLORS[(d ?? []).length % MEMBER_COLORS.length] }]);
  async function save() {
    setError(''); setMessage('');
    if (!draft) return;
    if (draft.some(p => !p.name.trim())) { setError('Jede Person braucht einen Namen.'); return; }
    if (draft.some(p => !validDate(p.birthday))) { setError('Bitte bei jedem Geburtstag Tag, Monat und Jahr wählen (oder alles leer lassen). Das Datum darf nicht in der Zukunft liegen.'); return; }
    setBusy(true);
    const result = await people.save(name, draft.map(p => ({ ...p, name: p.name.trim() })));
    setBusy(false);
    if (result) { setError(result); return; }
    setDraft(null); setMessage('Gespeichert. Geburtstage stehen jetzt im Kalender.');
  }
  return <div className="family-settings">
    <section className="family-tile">
      <h3>Name der Familie</h3>
      <input value={name} maxLength={60} placeholder="Familie Muster" aria-label="Name der Familie" onChange={e => setName(e.target.value)} />
      <p className="family-hint">Steht in der Begrüßung auf Home.</p>
    </section>
    <section className="family-tile">
      <h3>Personen</h3>
      {draft.length === 0 && <p className="family-empty">Noch niemand angelegt. Mit „Person hinzufügen“ geht es los.</p>}
      <ul className="family-people">{draft.map((p, i) => <li key={p.id ?? `neu-${i}`}>
        <div className="family-person-main">
          <span className="family-swatch" style={{ background: p.color }} aria-hidden="true" />
          <input value={p.name} maxLength={40} placeholder="Name" aria-label={`Name von Person ${i + 1}`} onChange={e => update(i, { name: e.target.value })} />
          {confirm === i
            ? <button type="button" className="family-danger" onClick={() => { setDraft(draft.filter((_, n) => n !== i)); setConfirm(null); }}>Wirklich entfernen?</button>
            : <button type="button" aria-label={`${p.name || 'Person'} entfernen`} onClick={() => setConfirm(i)}>Entfernen</button>}
        </div>
        <div className="family-person-row"><span>Geburtstag</span><BirthdayPicker value={p.birthday} onChange={b => update(i, { birthday: b })} /></div>
        <div className="family-person-row"><span>Farbe</span><div className="family-swatches">{MEMBER_COLORS.map(c => <button key={c} type="button" className="family-swatch-btn" style={{ background: c }} aria-label={`Farbe ${c}`} aria-pressed={p.color === c} onClick={() => update(i, { color: c })} />)}</div></div>
        {confirm === i && <p className="family-hint">Beim Entfernen werden die Zuordnungen dieser Person in Aufgaben und Terminen gelöst.</p>}
      </li>)}</ul>
      <button type="button" onClick={() => add()}>+ Person hinzufügen</button>
    </section>
    {error && <p role="alert" className="family-error">{error}</p>}
    {message && <p role="status" className="family-hint family-saved">{message}</p>}
    <div className="family-settings-save"><button type="button" className="family-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </div>;
}

/** Ein Termin der Kategorie "Geburtstag" (für Personen außerhalb der Familie) kehrt jedes Jahr wieder. */

/** Torte zeigen für Familien-Geburtstage und für Geburtstags-Termine. */
export const hasCake = (event: { id: string; category: string }) => isBirthdayEvent(event) || isBirthdayCategory(event);


export interface NextBirthday { names: string[]; days: number; date: Date; age: number; color: string }
/** Der nächste Geburtstag in der Familie ab heute (bei gleichem Tag alle Personen). Termine für andere Personen zählen hier nicht. */
export function nextFamilyBirthday(members: FamilyMember[], from: Date): NextBirthday | null {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let best: NextBirthday | null = null;
  for (const m of members) {
    const parts = m.birthday?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) continue;
    const born = Number(parts[1]), month = Number(parts[2]) - 1, day = Number(parts[3]);
    let date = new Date(today.getFullYear(), month, day);
    if (month === 1 && day === 29 && date.getMonth() !== 1) date = new Date(today.getFullYear(), 1, 28);
    if (date < today) { date = new Date(today.getFullYear() + 1, month, day); if (month === 1 && day === 29 && date.getMonth() !== 1) date = new Date(today.getFullYear() + 1, 1, 28); }
    const days = Math.round((date.getTime() - today.getTime()) / 86400000);
    const age = date.getFullYear() - born;
    if (!best || days < best.days) best = { names: [m.name], days, date, age, color: m.color };
    else if (days === best.days) best.names.push(m.name);
  }
  return best;
}

/** Dunkle Geburtstagskarte auf Home (Design): Avatar, Name und Alter, Tage bis zum Geburtstag. */
export function HomeBirthdayCard({ members, now }: { members: FamilyMember[]; now: Date | null }) {
  const next = nextFamilyBirthday(members, now ?? new Date());
  if (!next) return null;
  const names = next.names.join(' und ');
  const first = members.find(m => m.name === next.names[0]);
  return <div className={`family-bday-card${next.days === 0 ? ' today' : ''}`} style={{ '--c': next.color } as React.CSSProperties} role="status" aria-label={`Nächster Geburtstag: ${names}, ${next.days === 0 ? 'heute' : `in ${next.days} Tagen`}`}>
    <span className="family-bday-avatar" aria-hidden="true">{(first?.name ?? names).charAt(0).toUpperCase()}</span>
    <div className="family-bday-text"><small>Nächster Geburtstag</small><strong>{names} {next.names.length > 1 ? 'werden' : 'wird'} {next.age}</strong></div>
    <div className="family-bday-count">
      {next.days === 0 ? <b className="word">Heute</b> : next.days === 1 ? <b className="word">Morgen</b> : <b>{next.days}</b>}
      <small>{next.days > 1 ? 'Tage · ' : ''}{next.date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}</small>
    </div>
    {next.days === 0 && <BirthdayCake size={30} />}
  </div>;
}
