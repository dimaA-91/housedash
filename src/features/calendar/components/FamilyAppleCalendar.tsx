'use client';
import { useEffect, useRef, useState } from 'react';
import type { FamilyEvent } from '@/features/calendar/shared';

interface Source { id: string; name: string; color: string; enabled: boolean }
interface Payload { sources: Source[]; events?: FamilyEvent[]; status?: { id: string; name: string; ok: boolean; message: string | null }[]; truncated?: boolean }
const CHANGE = 'housedash-apple-change';

function FamilyCalendarSubscription() {
  const [access, setAccess] = useState<{ enabled: boolean; token: string | null; baseUrl?: string | null } | null>(null);
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
    const controller = new AbortController();
    void fetch('/api/family/calendar/subscription', { cache: 'no-store', signal: controller.signal })
      .then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Freigabe konnte nicht geladen werden.'); setAccess(value); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, []);
  const linkOrigin = access?.baseUrl || origin;
  const link = access?.token && linkOrigin ? `${linkOrigin}/api/family/calendar/feed.ics?token=${encodeURIComponent(access.token)}` : '';
  async function change(action: string) {
    setBusy(true); setError(''); setCopied(false); setConfirm('');
    try {
      const response = await fetch('/api/family/calendar/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }), signal: AbortSignal.timeout(15_000) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Freigabe konnte nicht geändert werden.');
      setAccess(value);
    } catch (failure) { setError(failure instanceof Error && !['TypeError', 'TimeoutError'].includes(failure.name) ? failure.message : 'Der Pi ist gerade nicht erreichbar.'); }
    finally { setBusy(false); }
  }
  async function copy() {
    setError('');
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch {
      input.current?.focus(); input.current?.select();
      // Clipboard API needs HTTPS; the LAN dashboard also supports plain HTTP.
      let success = false;
      try { success = document.execCommand('copy'); } catch { /* manual copy below */ }
      if (success) setCopied(true); else setError('Bitte den markierten Link manuell kopieren.');
    }
  }
  return <div className="family-tile"><h3>HouseDash auf dem iPhone anzeigen</h3>
    <p>Ein eigenes, schreibgeschütztes Abo für lokale HouseDash-Termine und Geburtstage. Apple-Abonnements werden nicht weitergegeben.</p>
    {error && <p className="family-error" role="alert">{error}</p>}
    {!access ? !error && <p role="status">Freigabe wird geladen …</p> : !access.enabled ? <button type="button" className="family-primary" disabled={busy} onClick={() => void change('enable')}>{busy ? 'Link wird erstellt …' : 'Geschützten Abo-Link erstellen'}</button> : <>
      <label className="family-apple-link">Dein privater Abo-Link<input ref={input} type="text" readOnly value={link} aria-label="Privater HouseDash-Kalenderlink" onFocus={e => e.currentTarget.select()} /></label>
      <button type="button" className="family-primary" disabled={busy || !link} onClick={() => void copy()}>{copied ? 'Link kopiert' : 'Abo-Link kopieren'}</button>
      <p className="family-hint">Dieser Link bleibt bei Pi-Neustarts, Container-Neustarts und Updates gültig.</p>
      <details className="family-subscription-advanced" onToggle={event => { if (!event.currentTarget.open) setConfirm(''); }}>
        <summary>Erweiterte Einstellungen</summary>
        <p className="family-hint">Nur nötig, wenn du den Zugang bewusst ersetzen oder sperren möchtest. Alle iPhones mit dem bisherigen Link verlieren dadurch die Verbindung.</p>
        <div className="family-phone-actions"><button type="button" disabled={busy} onClick={() => setConfirm('rotate')}>Link erneuern</button>
          <button type="button" disabled={busy} onClick={() => setConfirm('disable')}>Freigabe beenden</button></div>
        {confirm && <div className="family-subscription-confirm" role="group" aria-label="Änderung der Kalenderfreigabe bestätigen">
          <p>{confirm === 'rotate' ? 'Neuen Zugangsschlüssel erstellen? Danach muss der neue Abo-Link auf allen iPhones eingerichtet werden.' : 'Zugriff für alle bisherigen iPhone-Abos sperren? Es werden darüber keine neuen Kalenderdaten mehr abgerufen.'}</p>
          <div className="family-phone-actions"><button type="button" disabled={busy} onClick={() => void change(confirm)}>{confirm === 'rotate' ? 'Ja, bisherigen Link ungültig machen' : 'Ja, Zugriff für alle sperren'}</button>
            <button type="button" disabled={busy} onClick={() => setConfirm('')}>Abbrechen</button></div>
        </div>}
        <p className="family-hint">Termine in HouseDash bleiben erhalten. Bereits heruntergeladene Daten werden dadurch nicht vom iPhone gelöscht.</p>
      </details>
    </>}
    <ol><li>Das iPhone mit dem Heim-WLAN verbinden und den Abo-Link kopieren.</li><li>In Apple Kalender: <strong>Kalender → Hinzufügen → Kalenderabonnement hinzufügen</strong>.</li><li>Den Link einfügen und <strong>Suchen/Abonnieren</strong> wählen. Als Account <strong>Auf meinem iPhone</strong> wählen, falls angeboten, damit das Gerät den lokalen Pi direkt erreicht.</li></ol>
    <p className="family-hint">Nur im Heim-WLAN aktualisierbar. Kein Apple-Passwort nötig. Bei einer HTTP-Adresse gegebenenfalls „SSL verwenden“ ausschalten. Den Link nur mit deiner Familie teilen. Apple bestimmt den Abrufzeitpunkt; die 15-Minuten-Empfehlung ist keine garantierte Sofort-Synchronisierung.</p>
  </div>;
}

export function AppleEventDetail({ event, onClose }: { event: FamilyEvent; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  const end = new Date(event.end);
  if (event.allDay) end.setDate(end.getDate() - 1);
  const date = (value: Date) => value.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const time = (value: string) => new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return <div className="family-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab') { e.preventDefault(); close.current?.focus(); } }}>
    <section className="family-form family-apple-detail" role="dialog" aria-modal="true" aria-labelledby="apple-event-title">
      <p className="family-hint">{event.member} · Apple Kalender · Nur lesen</p><h2 id="apple-event-title" style={{ borderLeft: `5px solid ${event.color}`, paddingLeft: 14 }}>{event.title}</h2>
      <p>{date(new Date(event.start))}{event.allDay ? ` · Ganztägig${date(end) !== date(new Date(event.start)) ? ` bis ${date(end)}` : ''}` : `, ${time(event.start)} – ${date(end)}, ${time(event.end)}`}</p>
      {event.notes && <p className="family-apple-notes">{event.notes}</p>}<p className="family-hint">Änderungen bitte in Apple Kalender vornehmen. Eigene HouseDash-Termine erstellst du über „+ Termin“.</p>
      <button ref={close} type="button" className="family-primary" onClick={onClose}>Schließen</button>
    </section>
  </div>;
}

export function useAppleCalendar(from: string, to: string) {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let closed = false, running = false, queued = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (closed || document.visibilityState === 'hidden') return;
      if (running) { queued = true; return; }
      running = true;
      try {
        const response = await fetch(`/api/family/apple-calendar?${new URLSearchParams({ from, to })}`, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
        });
        const value: Payload & { error?: string } = await response.json();
        if (!response.ok) throw new Error(value.error || 'Apple Kalender konnte nicht geladen werden.');
        if (!closed) {
          setEvents(value.events ?? []);
          setMessage(value.status?.find(status => !status.ok)?.message || (value.truncated ? 'Apple Kalender: Es werden maximal 3000 Termine im Zeitraum angezeigt.' : ''));
        }
      } catch (error) { if (!closed) setMessage(error instanceof Error && error.name !== 'TypeError' ? error.message : 'Apple Kalender gerade nicht erreichbar. Bereits geladene Termine bleiben sichtbar.'); }
      finally { running = false; if (queued && !closed) { queued = false; void refresh(); } }
    };
    const wake = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    // Apple publishes a read-only feed, without a push channel. Server cache coalesces devices.
    const timer = setInterval(() => void refresh(), 5 * 60_000);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener(CHANGE, wake);
    return () => { closed = true; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener(CHANGE, wake); };
  }, [from, to]);
  return { events, message };
}

export default function FamilyAppleCalendar() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [remove, setRemove] = useState('');
  const [name, setName] = useState('Apple Kalender');
  const [color, setColor] = useState('#a78bfa');
  const [url, setUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/family/apple-calendar', { cache: 'no-store', signal: controller.signal })
      .then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Kalender konnten nicht geladen werden.'); setSources(value.sources); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function save(method: 'POST' | 'DELETE', body: object) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/family/apple-calendar', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Speichern fehlgeschlagen.');
      setSources(value.sources); setUrl(''); setRemove('');
      setNotice(method === 'POST' ? 'Kalender gespeichert. Die Termine werden geladen und nur angezeigt.' : 'Einbindung entfernt. Der Apple Kalender selbst wurde nicht verändert.');
      window.dispatchEvent(new Event(CHANGE));
    } catch (failure) { setError(failure instanceof Error && !['TimeoutError', 'TypeError'].includes(failure.name) ? failure.message : 'Der Pi ist gerade nicht erreichbar. Bitte erneut versuchen.'); }
    finally { setBusy(false); }
  }
  return <section className="family-apple-settings">
    <p className="family-page-intro">Apple-Termine nur lesen · eigene Termine bleiben lokal in HouseDash</p>
    <FamilyCalendarSubscription />
    {error && <p className="family-error" role="alert">{error}</p>}{notice && <p className="family-phone-success" role="status">{notice}</p>}
    <div className="family-tile"><h3>So bekommst du den Link</h3><ol><li>Am iPhone die App <strong>Kalender</strong> öffnen und unten auf <strong>Kalender</strong> tippen.</li><li>Beim gewünschten iCloud-Kalender auf <strong>ⓘ</strong> tippen.</li><li><strong>Öffentlicher Kalender</strong> einschalten und <strong>Link teilen → Kopieren</strong> wählen.</li><li>HouseDash auf dem iPhone öffnen und den Link unten einfügen.</li></ol>
      <p className="family-hint">Wer den Freigabelink kennt, kann diesen Kalender lesen. Nur den gewünschten Kalender freigeben. Hier ist kein Apple-Passwort nötig. Falls „Öffentlicher Kalender“ fehlt, muss der Kalender in iCloud liegen und dir gehören.</p></div>
    <div className="family-tile"><h3>Kalender einbinden</h3><form className="family-apple-form" onSubmit={event => { event.preventDefault(); void save('POST', { name, color, url }); }}>
      <label>Name<input value={name} maxLength={80} required onChange={event => setName(event.target.value)} /></label>
      <label>Farbe<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      <label className="wide">Apple-Abonnement-Link<input type="password" value={url} autoComplete="off" spellCheck={false} maxLength={4000} placeholder="webcal://…icloud.com/published/…" required onChange={event => setUrl(event.target.value)} /></label>
      <button className="family-primary" disabled={busy || loading || !url.trim()} type="submit">{busy ? 'Wird gespeichert …' : 'Kalender hinzufügen'}</button>
    </form></div>
    <div className="family-tile"><h3>Eingebundene Kalender</h3>{loading ? <p role="status">Kalender werden geladen …</p> : !sources.length ? <p className="family-hint">Noch kein Apple Kalender eingebunden.</p> : sources.map(source => <div className="family-apple-source" key={source.id}><span style={{ color: source.color }}>●</span><strong>{source.name}</strong><small>Nur lesen</small><button type="button" disabled={busy} onClick={() => { if (remove === source.id) void save('DELETE', { id: source.id }); else setRemove(source.id); }}>{remove === source.id ? 'Entfernen bestätigen' : 'Entfernen'}</button>{remove === source.id && <button type="button" onClick={() => setRemove('')}>Abbrechen</button>}</div>)}</div>
    <p className="family-hint">Aktualisierung ungefähr alle 5 Minuten, zusätzlich abhängig von Apples Veröffentlichung. Internet ist für neue Apple-Termine nötig. Lokale HouseDash-Termine funktionieren weiterhin ohne Internet.</p>
  </section>;
}
