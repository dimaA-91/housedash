'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoftwareState } from '@/features/software/shared';

const PHASES: Record<string, string> = {
  start: 'Wird vorbereitet', download: 'Wird geladen', verify: 'Wird geprüft', images: 'Programmteile', install: 'Wird installiert', done: 'Fertig', failed: 'Nicht installiert',
};
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Software: installierte Version, nach Updates suchen, auf Klick oder nachts automatisch installieren.
 * Der Updater am Pi prüft die Signatur jeder Version und sichert vor der Installation alle Daten.
 */
export default function FamilySoftware() {
  const [state, setState] = useState<SoftwareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/family/software', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error();
      const value = await response.json() as SoftwareState;
      if (alive.current) setState(value);
      return value;
    } catch { return null; }
  }, []);
  useEffect(() => { void load().then(value => { if (!value && alive.current) setState(current => current ?? { available: false, installed: '', repo: '', lastCheck: null, checkError: 'Der Software-Stand ist gerade nicht erreichbar.', update: null, job: null }); }); }, [load]);

  const running = !!state?.job && !['done', 'failed'].includes(state.job.phase);
  // Während der Installation den Fortschritt verfolgen. Startet HouseDash neu, ist die Seite kurz weg:
  // dann warten, bis sie wieder antwortet, und neu laden.
  useEffect(() => {
    if (!running && !restarting) return;
    let lost = 0;
    const timer = window.setInterval(async () => {
      const value = await load();
      if (!value) { lost += 1; if (lost >= 2) setRestarting(true); return; }
      if (restarting || (value.job?.phase === 'done' && value.installed === value.job.version)) {
        if (value.job?.phase === 'done' || value.job?.phase === 'failed') window.location.reload();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [running, restarting, load]);

  async function setAuto(enabled: boolean) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/family/software', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto', enabled }), signal: AbortSignal.timeout(15_000) });
      const value = await response.json();
      if (value && typeof value === 'object' && 'installed' in value) setState(value as SoftwareState);
      if (!response.ok) setError(value.error || 'Die Einstellung wurde nicht gespeichert.');
    } catch { setError('Der Updater antwortet gerade nicht.'); }
    finally { setBusy(false); }
  }

  async function command(action: 'check' | 'install') {
    setBusy(true); setError(''); setConfirm(false);
    try {
      const response = await fetch('/api/family/software', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, version: state?.update?.version }), signal: AbortSignal.timeout(60_000) });
      const value = await response.json();
      if (value && typeof value === 'object' && 'installed' in value) setState(value as SoftwareState);
      if (!response.ok) setError(value.error || 'Das hat nicht geklappt.');
    } catch { setError('Der Updater antwortet gerade nicht.'); }
    finally { setBusy(false); }
  }

  if (!state) return <div className="family-settings"><p role="status" className="family-hint">Software-Stand wird geladen …</p></div>;
  const job = state.job;
  return <div className="family-settings family-software">
    <section className="family-tile family-software-current">
      <div className="family-software-logo" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg></div>
      <div className="family-software-text">
        <h3>HouseDash{state.installed ? ` ${state.installed}` : ''}</h3>
        <p>{!state.available ? 'Der Updater läuft nur auf dem Raspberry Pi.'
          : state.update ? `Neue Version ${state.update.version} verfügbar.${state.prepared ? ' Sie ist bereits geladen.' : ''}`
          : state.checkError ? state.checkError
          : state.lastCheck ? 'HouseDash ist auf dem neuesten Stand.' : 'Noch nicht nach Updates gesucht.'}</p>
        {state.lastCheck && <small>Zuletzt gesucht: {when(state.lastCheck)}{state.repo ? ` · Quelle: github.com/${state.repo}` : ''}</small>}
      </div>
      <button type="button" disabled={busy || running || !state.available} onClick={() => void command('check')}>{busy && !confirm ? 'Suche …' : 'Nach Updates suchen'}</button>
    </section>

    {error && <p role="alert" className="family-error">{error}</p>}

    {job && (running || restarting || job.phase === 'failed' || (job.phase === 'done' && job.version === state.installed)) && <section className={`family-tile family-software-job ${job.phase}`} role="status" aria-live="polite">
      <div className="family-software-job-head"><strong>{restarting ? 'HouseDash startet neu …' : `${PHASES[job.phase] ?? job.phase} · Version ${job.version}`}</strong>{running && !restarting && <span>{job.progress}%</span>}</div>
      {(running || restarting) && <div className="family-software-bar"><i style={{ width: `${restarting ? 100 : Math.max(4, job.progress)}%` }} /></div>}
      <p>{restarting ? 'Gleich wieder da. Die Seite lädt dann von selbst neu.' : job.message}</p>
      {job.phase === 'failed' && <small>Deine Daten sind gesichert. HouseDash läuft mit der bisherigen Version weiter.</small>}
    </section>}

    {state.update && !running && !restarting && <section className="family-tile family-software-update">
      <div className="family-software-update-head"><div><h3>Version {state.update.version}</h3>{state.update.published && <small>Veröffentlicht am {when(state.update.published)}{state.prepared ? ' · Bereits geladen' : ''}</small>}</div>
        {!confirm
          ? <button type="button" className="family-primary" disabled={busy} onClick={() => setConfirm(true)}>Jetzt installieren</button>
          : <span className="family-software-confirm"><button type="button" className="family-primary" disabled={busy} onClick={() => void command('install')}>Ja, installieren</button><button type="button" onClick={() => setConfirm(false)}>Abbrechen</button></span>}
      </div>
      {!confirm && state.autoInstall && <p className="family-hint">{state.prepared ? 'Wird heute Nacht zwischen 3 und 5 Uhr automatisch installiert.' : 'Wird gerade im Hintergrund geladen und danach nachts automatisch installiert.'}</p>}
      {confirm && <p className="family-hint">HouseDash sichert zuerst alle Daten und Fotos und startet dann für etwa zwei Minuten neu. Klappt etwas nicht, läuft automatisch die bisherige Version weiter.</p>}
      {state.update.notes && <div className="family-software-notes"><span className="family-eyebrow">Neu in dieser Version</span><p>{state.update.notes}</p></div>}
    </section>}

    {state.available && <section className="family-tile family-software-auto">
      <label className="family-switch"><input type="checkbox" role="switch" checked={!!state.autoInstall} disabled={busy} onChange={e => void setAuto(e.target.checked)} /><span className="family-switch-track" aria-hidden="true" /><span>Updates automatisch installieren</span></label>
      <p className="family-hint">Neue Versionen werden immer im Hintergrund geladen. Eingeschaltet installiert HouseDash sie nachts zwischen 3 und 5 Uhr, nie während eines Telefonats. Ausgeschaltet entscheidest du per Klick.</p>
    </section>}

    <section className="family-tile family-software-about">
      <h3>So funktionieren Updates</h3>
      <ul>
        <li>Der Pi sucht alle sechs Stunden nach einer neuen Version und lädt sie vor. Installiert wird auf deinen Klick oder, wenn eingeschaltet, nachts.</li>
        <li>Jede Version ist signiert. Der Pi installiert nur, was mit dem HouseDash-Schlüssel unterschrieben ist.</li>
        <li>Vor der Installation werden Daten und Fotos gesichert. Startet die neue Version nicht, läuft die alte weiter.</li>
        <li>Beim Suchen wird nur die öffentliche Versionsliste geladen. Es werden keine Daten von dir gesendet.</li>
      </ul>
    </section>
  </div>;
}
