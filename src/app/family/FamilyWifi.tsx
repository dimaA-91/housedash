'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WifiNetwork, WifiStatus } from '@/lib/family-wifi-server';

type Status = Partial<WifiStatus> & { available: boolean };

async function api(body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/family/wifi', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const value = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof value.error === 'string' ? value.error : 'WLAN ist gerade nicht erreichbar.');
  return value;
}

function SignalBars({ signal }: { signal: number }) {
  const level = signal >= 75 ? 4 : signal >= 55 ? 3 : signal >= 35 ? 2 : 1;
  return <svg className="family-signal" viewBox="0 0 24 20" width="26" height="22" role="img" aria-label={`Signal ${signal} Prozent`}>
    {[0, 1, 2, 3].map(i => <rect key={i} x={2 + i * 6} y={16 - i * 4.5} width="4" height={4 + i * 4.5} rx="1.2" fill={i < level ? 'currentColor' : 'var(--rail)'} />)}
  </svg>;
}
const Lock = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Mit Passwort"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;

/** Seite "WLAN" unter Mehr: Status von Kabel und WLAN, Netze suchen, mit Passwort verbinden, gespeicherte Netze vergessen. Das Kabel wird nie verändert. */
export default function FamilyWifi() {
  const [status, setStatus] = useState<Status | null>(null);
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const [busy, setBusy] = useState<'scan' | 'connect' | 'radio' | 'forget' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pick, setPick] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [forgetting, setForgetting] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    try { const value = await api() as unknown as Status; if (alive.current) setStatus(value); return value; }
    catch (e) { if (alive.current) setError((e as Error).message); return null; }
  }, []);
  const scan = useCallback(async () => {
    setBusy('scan'); setError(''); setPick(null);
    try { const value = await api({ action: 'scan' }) as { networks: WifiNetwork[] }; if (alive.current) setNetworks(value.networks); }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(null); }
  }, []);
  useEffect(() => { void refresh().then(value => { if (value?.available && value.radio && value.wifi) void scan(); }); }, [refresh, scan]);
  // Solange die Seite offen ist, bleibt der Status aktuell (zum Beispiel nach dem Verbinden oder Abziehen des Kabels).
  useEffect(() => { const timer = setInterval(() => { if (!busy && document.visibilityState === 'visible') void refresh(); }, 10_000); return () => clearInterval(timer); }, [busy, refresh]);

  async function run(kind: 'connect' | 'radio' | 'forget', body: Record<string, unknown>, done: string, then?: () => Promise<void>) {
    setBusy(kind); setError(''); setMessage('');
    try {
      const value = await api(body) as unknown as Status;
      if (!alive.current) return;
      setStatus(value); setMessage(done); setPick(null); setPassword(''); setReveal(false); setForgetting('');
      if (then) await then();
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(null); }
  }
  const toggleRadio = () => run('radio', { action: 'radio', on: !status?.radio }, status?.radio ? 'WLAN ausgeschaltet.' : 'WLAN eingeschaltet.', status?.radio ? async () => { setNetworks(null); } : scan);
  const choose = (n: WifiNetwork) => {
    if (n.inUse || busy) return;
    setError(''); setMessage('');
    if (n.uuid) void run('connect', { action: 'connect', uuid: n.uuid }, `Verbunden mit ${n.ssid}.`, scan);
    else if (!n.secured) void run('connect', { action: 'connect', bssid: n.bssid }, `Verbunden mit ${n.ssid}.`, scan);
    else { setPick(n); setPassword(''); setReveal(false); }
  };

  if (!status) return <div className="family-settings">{error ? <p role="alert" className="family-error">{error}</p> : <p role="status" className="family-hint">Netzwerk wird geprüft …</p>}</div>;
  if (!status.available) return <div className="family-settings"><section className="family-tile"><h3>WLAN-Steuerung nicht erreichbar</h3><p className="family-hint">Auf diesem Gerät ist die WLAN-Steuerung nicht eingerichtet. Sie läuft nur auf dem Raspberry Pi nach einem Deployment.</p></section></div>;

  const wifi = status.wifi, wired = status.ethernet;
  const working = busy === 'connect' ? 'Verbindung wird aufgebaut … das kann bis zu 30 Sekunden dauern.' : '';
  return <div className="family-settings family-wifi">
    <section className="family-tile">
      <h3>Verbindung</h3>
      <ul className="family-wifi-status">
        <li><span>Kabel</span><b className={wired?.connected ? 'on' : 'off'}>{wired ? (wired.connected ? `Verbunden${wired.ip ? ` · ${wired.ip}` : ''}` : 'Nicht verbunden') : 'Kein Anschluss'}</b></li>
        <li><span>WLAN</span><b className={wifi?.connected ? 'on' : 'off'}>{!wifi ? 'Keine WLAN-Karte' : !status.radio ? 'Ausgeschaltet' : wifi.connected ? `${wifi.ssid}${wifi.ip ? ` · ${wifi.ip}` : ''}` : 'Nicht verbunden'}</b></li>
      </ul>
      {wifi && <label className="family-switch family-wifi-switch"><input type="checkbox" role="switch" checked={!!status.radio} disabled={!!busy} onChange={() => void toggleRadio()} /><span className="family-switch-track" aria-hidden="true" /><span>WLAN {status.radio ? 'ein' : 'aus'}</span></label>}
      <p className="family-hint">Das Kabel wird hier nie verändert. Solange es steckt, bleibt der Pi darüber erreichbar.</p>
    </section>

    {error && <p role="alert" className="family-error">{error}</p>}
    {message && <p role="status" className="family-hint family-saved">{message}</p>}
    {working && <p role="status" className="family-hint">{working}</p>}

    {wifi && status.radio && <section className="family-tile">
      <div className="family-tile-head"><h3>Netze in der Nähe</h3><button type="button" disabled={!!busy} onClick={() => void scan()}>{busy === 'scan' ? 'Suche läuft …' : 'Neu suchen'}</button></div>
      {networks === null && busy === 'scan' && <p className="family-hint">Netze werden gesucht …</p>}
      {networks?.length === 0 && <p className="family-hint">Keine Netze gefunden.</p>}
      {networks && networks.length > 0 && <ul className="family-wifi-list">{networks.map(n => <li key={n.ssid}>
        <button type="button" className={n.inUse ? 'current' : ''} disabled={!!busy} aria-pressed={n.inUse} onClick={() => choose(n)}>
          <SignalBars signal={n.signal} />
          <span className="family-wifi-name"><strong>{n.ssid}</strong><small>{n.inUse ? 'Verbunden' : n.uuid ? 'Gespeichert' : n.secured ? n.security : 'Offenes Netz'}</small></span>
          {n.secured && <Lock />}
        </button>
        {pick?.ssid === n.ssid && <form className="family-wifi-form" onSubmit={e => { e.preventDefault(); if (password) void run('connect', { action: 'connect', bssid: n.bssid, password }, `Verbunden mit ${n.ssid}.`, scan); }}>
          <input type={reveal ? 'text' : 'password'} value={password} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} placeholder={`Passwort für ${n.ssid}`} aria-label={`Passwort für ${n.ssid}`} onChange={e => setPassword(e.target.value)} />
          <button type="button" aria-pressed={reveal} onClick={() => setReveal(!reveal)}>{reveal ? 'Verbergen' : 'Anzeigen'}</button>
          <button type="submit" className="family-primary" disabled={!!busy || password.length < 8}>{busy === 'connect' ? 'Verbinde …' : 'Verbinden'}</button>
          <button type="button" disabled={!!busy} onClick={() => { setPick(null); setPassword(''); }}>Abbrechen</button>
          {password.length > 0 && password.length < 8 && <small className="family-hint">Mindestens 8 Zeichen.</small>}
        </form>}
      </li>)}</ul>}
    </section>}

    {status.known && status.known.length > 0 && <section className="family-tile">
      <h3>Gespeicherte Netze</h3>
      <ul className="family-wifi-list known">{status.known.map(k => <li key={k.uuid}>
        <span className="family-wifi-name"><strong>{k.name}</strong>{wifi?.connected && wifi.ssid === k.name && <small>Verbunden</small>}</span>
        {forgetting === k.uuid
          ? <><button type="button" className="family-danger" disabled={!!busy} onClick={() => void run('forget', { action: 'forget', uuid: k.uuid }, `${k.name} wurde vergessen.`)}>Wirklich vergessen?</button><button type="button" onClick={() => setForgetting('')}>Abbrechen</button></>
          : <button type="button" disabled={!!busy} onClick={() => setForgetting(k.uuid)}>Vergessen</button>}
      </li>)}</ul>
    </section>}
  </div>;
}
