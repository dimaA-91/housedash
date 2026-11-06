'use client';
import { useEffect, useState } from 'react';

interface Settings { latitude: number; longitude: number; timezone: string; authEnabled: boolean }
interface Restore { name: string; body: Record<string, unknown>; encrypted: boolean; credentials: boolean }
const messages: Record<string, string> = {
  wrong_password: 'Das aktuelle Passwort stimmt nicht.', password_too_short: 'Bitte mindestens acht Zeichen verwenden.',
  editor_password_required: 'Bitte zuerst ein Familienpasswort festlegen, um Zugangsdaten zu sichern.',
  passphrase_required: 'Bitte das Passwort dieser Sicherung eingeben.', bad_passphrase: 'Das Sicherungspasswort stimmt nicht.',
};
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const value = await response.json();
  if (!response.ok) throw new Error(messages[value.code] || value.error || 'Die Aktion konnte nicht abgeschlossen werden.');
  return value;
}
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function FamilySystemSettings({ onVoice }: { onVoice: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [password, setPassword] = useState('');
  const [current, setCurrent] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [keys, setKeys] = useState(true);
  const [photos, setPhotos] = useState(true);
  const [restore, setRestore] = useState<Restore | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void request('/api/family/settings', { signal: controller.signal }).then(setSettings).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, []);
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (failure) { setError(failure instanceof Error && failure.name !== 'TypeError' ? failure.message : 'Der Pi ist gerade nicht erreichbar.'); }
    finally { setBusy(false); }
  }
  async function saveBackup() {
    const bundle = await request('/api/backup');
    if (keys) bundle.credentials = await request('/api/backup/credentials', json('POST', { passphrase: backupPassword }));
    const name = `HouseDash-${new Date().toISOString().slice(0, 10)}`;
    if (photos) {
      const archive = await fetch('/api/backup/archive', json('POST', { bundle, pictures: 'all' }));
      if (!archive.ok) { const value = await archive.json(); throw new Error(value.error || 'Fotos konnten nicht gesichert werden.'); }
      if (archive.status !== 204) { download(await archive.blob(), `${name}.zip`); setBackupPassword(''); setNotice('Sicherung heruntergeladen. Bitte zusätzlich außerhalb des Pi aufbewahren.'); return; }
    }
    download(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), `${name}.json`);
    setBackupPassword(''); setNotice('Sicherung heruntergeladen. Bitte zusätzlich außerhalb des Pi aufbewahren.');
  }
  async function loadRestore(file: File) {
    setRestore(null); setRestoreConfirmed(false); setRestorePassword('');
    if (/\.zip$/i.test(file.name)) {
      const value = await request('/api/backup/upload', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
      setRestore({ name: file.name, body: { _archive: value.id }, encrypted: value.credentialsEncrypted, credentials: value.hasCredentials });
    } else {
      const body = JSON.parse(await file.text());
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Ungültige Sicherung.');
      setRestore({ name: file.name, body, encrypted: !!body.credentials?.encrypted, credentials: !!body.credentials });
    }
  }
  return <section className="family-system"><p className="family-page-intro">Einstellungen bleiben lokal auf dem Pi gespeichert.</p>
    {error && <p className="family-error" role="alert">{error}</p>}{notice && <p className="family-phone-success" role="status">{notice}</p>}
    <section className="family-tile"><h3>OpenAI & Sprache</h3><p className="family-hint">ChatGPT verbinden und Kalenderaufträge per Text oder Mikrofon vorbereiten.</p><button type="button" onClick={onVoice}>OpenAI & Sprache konfigurieren</button></section>
    {!settings ? <p role="status">{error ? 'Einstellungen nicht verfügbar.' : 'Einstellungen werden geladen …'}</p> : <>
      <section className="family-tile"><h3>Standort für das Wetter</h3><p className="family-hint">Gespeichert: {settings.latitude.toFixed(4)}, {settings.longitude.toFixed(4)} · {settings.timezone}</p>
        <form className="family-system-form" onSubmit={event => { event.preventDefault(); void act(async () => {
          const found = await request(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
          setLocationCoords({ latitude: found.latitude, longitude: found.longitude }); setLocation(found.displayName);
        }); }}><label>Ort<input value={query} maxLength={100} placeholder="Zum Beispiel Dresden" onChange={event => setQuery(event.target.value)} required /></label><button type="submit" disabled={busy}>Ort suchen</button></form>
        {location && locationCoords && <div className="family-system-form"><p>{location}</p><button type="button" className="family-primary" disabled={busy} onClick={() => void act(async () => { await request('/api/family/settings', json('PUT', locationCoords)); setSettings({ ...settings, ...locationCoords }); setLocation(''); setLocationCoords(null); setNotice('Wetterstandort gespeichert. Die Anzeige übernimmt ihn beim nächsten Wetterabruf.'); })}>Diesen Standort speichern</button></div>}
      </section>
      <section className="family-tile"><h3>Familienpasswort</h3><p className="family-hint">{settings.authEnabled ? 'Passwortschutz ist aktiviert.' : 'Im Heimnetz ist derzeit kein Anmeldepasswort eingerichtet.'}</p>
        <form className="family-system-form" onSubmit={event => { event.preventDefault(); void act(async () => {
          await request('/api/auth/password', json('POST', { newPassword: password, currentPassword: current }));
          setSettings({ ...settings, authEnabled: true }); setPassword(''); setCurrent(''); setNotice('Familienpasswort gespeichert.');
        }); }}>{settings.authEnabled && <label>Aktuelles Passwort<input type="password" value={current} autoComplete="current-password" required onChange={event => setCurrent(event.target.value)} maxLength={256} /></label>}
          <label>{settings.authEnabled ? 'Neues Familienpasswort' : 'Familienpasswort festlegen'}<input type="password" value={password} autoComplete="new-password" minLength={8} maxLength={256} required onChange={event => setPassword(event.target.value)} /></label>
          <button className="family-primary" type="submit" disabled={busy}>Passwort speichern</button></form>
        {settings.authEnabled && <button type="button" disabled={busy} onClick={() => void act(async () => { await request('/api/auth/logout', { method: 'POST' }); window.location.reload(); })}>Auf diesem Gerät abmelden</button>}
      </section>
      <section className="family-tile"><h3>Auf deinem Gerät sichern</h3><p className="family-hint">Kalender, Familienangaben, Aufgaben, Einstellungen und weitere lokale Daten. Der Download liegt anschließend auf dem Gerät, auf dem du HouseDash gerade geöffnet hast.</p>
        <form className="family-system-form" onSubmit={event => { event.preventDefault(); void act(saveBackup); }}>
          <label className="family-system-check"><input type="checkbox" checked={keys} onChange={event => setKeys(event.target.checked)} />Zugangsdaten und dauerhaften Kalender-Abo-Schlüssel einschließen</label>
          {keys && (!settings.authEnabled ? <p className="family-hint">Für eine Sicherung mit Zugangsdaten zuerst oben ein Familienpasswort festlegen.</p> : <label>Eigenes Passwort für diese Sicherung<input type="password" minLength={8} maxLength={256} autoComplete="new-password" value={backupPassword} required onChange={event => setBackupPassword(event.target.value)} /></label>)}
          <label className="family-system-check"><input type="checkbox" checked={photos} onChange={event => setPhotos(event.target.checked)} />Alle hochgeladenen Fotos einschließen</label>
          {!keys && <p className="family-hint">Ohne Zugangsdaten fehlt der Schlüssel für euren bisherigen Kalender-Abo-Link.</p>}
          <button className="family-primary" type="submit" disabled={busy || (keys && !settings.authEnabled)}>{busy ? 'Bitte warten …' : 'Sicherung herunterladen'}</button></form>
        <p className="family-hint">Die Telegram-Anmeldesitzung des separaten Telefon-Dienstes wird vom Pi-Deployment getrennt gesichert (siehe Telefon-Anleitung).</p>
      </section>
      <section className="family-tile"><h3>Sicherung wiederherstellen</h3><div className="family-system-form"><label>Sicherungsdatei auswählen<input type="file" accept=".json,.zip" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void act(() => loadRestore(file)); }} /></label>
        {restore && <div className="family-system-confirm"><p><strong>{restore.name}</strong> ersetzt die enthaltenen gespeicherten Daten auf dem Pi.</p>{!restore.credentials && <p>Diese Datei enthält keine Zugangsdaten und keinen Kalender-Abo-Schlüssel.</p>}
          {restore.encrypted && <label>Passwort der Sicherung<input type="password" value={restorePassword} autoComplete="off" onChange={event => setRestorePassword(event.target.value)} maxLength={256} /></label>}
          {!restoreConfirmed ? <button type="button" disabled={busy} onClick={() => setRestoreConfirmed(true)}>Wiederherstellung vorbereiten</button> : <div className="family-phone-actions"><button type="button" disabled={busy || (restore.encrypted && !restorePassword)} onClick={() => void act(async () => {
            await request('/api/backup', json('POST', { ...restore.body, _passphrase: restorePassword }));
            setRestorePassword(''); setRestore(null); window.location.reload();
          })}>Ja, gespeicherte Daten wiederherstellen</button><button type="button" onClick={() => setRestoreConfirmed(false)}>Abbrechen</button></div>}
        </div>}
      </div></section>
    </>}
  </section>;
}
