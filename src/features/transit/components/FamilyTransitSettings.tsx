'use client';
import { useEffect, useState } from 'react';
import type { TransitConfig, TransitStop } from '@/features/transit/shared';

type Found = TransitStop & { modes: string[] };
const modeLabel: Record<string, string> = { TRAM: 'Bahn', BUS: 'Bus' };

/** Haltestelle suchen und antippen. Gesucht wird erst ab zwei Buchstaben. */
function StopPicker({ title, value, onPick }: { title: string; value: TransitStop; onPick: (stop: TransitStop) => void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); setError(''); return; }
    const timer = setTimeout(async () => {
      setBusy(true); setError('');
      try {
        const res = await fetch(`/api/family/transit/stops?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
        if (!res.ok) throw new Error();
        setFound((await res.json()).stops ?? []);
      } catch { setError('Die Suche ist gerade nicht erreichbar.'); } finally { setBusy(false); }
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);
  return <div className="family-stop-picker">
    <p className="family-stop-current">{title}: <strong>{value.name}</strong></p>
    <input type="text" value={query} maxLength={60} placeholder="Haltestelle suchen, zum Beispiel Hauptbahnhof" aria-label={`${title} suchen`} onChange={e => setQuery(e.target.value)} />
    {busy && <p className="family-hint">Suche läuft …</p>}
    {error && <p role="alert" className="family-error">{error}</p>}
    {!busy && query.trim().length >= 2 && !error && found.length === 0 && <p className="family-hint">Keine Haltestelle gefunden.</p>}
    {found.length > 0 && <ul className="family-stop-results">{found.map(s => <li key={s.id}><button type="button" onClick={() => { onPick({ id: s.id, name: s.name }); setQuery(''); setFound([]); }}><strong>{s.name}</strong><span>{s.modes.map(m => modeLabel[m]).filter(Boolean).join(', ')}</span></button></li>)}</ul>}
  </div>;
}

/** Seite "Straßenbahn" unter Mehr: Start, Ziel und Linie festlegen. Die Karte auf Home bietet beide Richtungen als Reiter an. */
export default function TransitSettings() {
  const [config, setConfig] = useState<TransitConfig | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch('/api/family/transit/config', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setConfig).catch(() => setError('Die Einstellungen konnten nicht geladen werden.')); }, []);
  if (!config) return <div className="family-settings">{error ? <p role="alert" className="family-error">{error}</p> : <p role="status" className="family-empty">Wird geladen …</p>}</div>;
  async function save() {
    if (!config) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/family/transit/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error || 'Das Speichern hat nicht geklappt.');
      setConfig(value); setMessage('Gespeichert. Auf Home gibt es jetzt Reiter für beide Richtungen.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="family-settings">
    <section className="family-tile">
      <h3>Strecke</h3>
      <StopPicker title="Start" value={config.from} onPick={from => setConfig({ ...config, from })} />
      <button type="button" className="family-swap" onClick={() => setConfig({ ...config, from: config.to, to: config.from })}>⇅ Start und Ziel tauschen</button>
      <StopPicker title="Ziel" value={config.to} onPick={to => setConfig({ ...config, to })} />
    </section>
    <section className="family-tile">
      <h3>Linie</h3>
      <input type="text" value={config.line} maxLength={12} placeholder="zum Beispiel 11" aria-label="Liniennummer" onChange={e => setConfig({ ...config, line: e.target.value })} />
      <p className="family-hint">Nur diese Linie wird gezeigt. Leer lassen, um alle direkten Verbindungen zu zeigen.</p>
    </section>
    {error && <p role="alert" className="family-error">{error}</p>}
    {message && <p role="status" className="family-hint family-saved">{message}</p>}
    <div className="family-settings-save"><button type="button" className="family-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </div>;
}
