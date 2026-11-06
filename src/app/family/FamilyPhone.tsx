'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { PHONE_BUSY_PHASES, PHONE_PHASE_LABEL, type ParentSlot } from '@/lib/family-phone-shared';
import { CalendarSymbol } from './CalendarKeywordIcon';
import { useFamilyPhone } from './FamilyPhoneContext';

const slots: { id: ParentSlot; label: string }[] = [{ id: 'mama', label: 'Mama' }, { id: 'papa', label: 'Papa' }];

function ParentSettings({ slot, label: fallback }: { slot: ParentSlot; label: string }) {
  const { state, command, pending } = useFamilyPhone();
  const parent = state.parents.find(p => p.slot === slot);
  const [label, setLabel] = useState(parent?.label ?? fallback);
  const [target, setTarget] = useState(parent?.username ? `@${parent.username}` : '');
  const [saved, setSaved] = useState(false);
  return <form className="family-phone-parent-form" onSubmit={async e => {
    e.preventDefault(); setSaved(false);
    if (await command('save-parent', { slot, label, target })) { setTarget(''); setSaved(true); }
  }}>
    <h3>{fallback}</h3>
    {parent && <p className="family-hint">Verbunden mit {parent.name}{parent.username ? ` (@${parent.username})` : ''}</p>}
    <label>Anzeigename<input value={label} maxLength={40} onChange={e => setLabel(e.target.value)} required /></label>
    <label>Telegram-Kontakt<input value={target} maxLength={100} placeholder="@benutzername oder +49…" autoComplete="off" onChange={e => setTarget(e.target.value)} required /></label>
    <button type="submit" className="family-primary" disabled={pending || !target.trim()}>{parent ? 'Kontakt ändern' : 'Kontakt verbinden'}</button>
    {saved && <p role="status" className="family-phone-success">Kontakt verbunden.</p>}
  </form>;
}

export default function FamilyPhone({ settings, onSettings, onAudio }: { settings: boolean; onSettings: (open: boolean) => void; onAudio: () => void }) {
  const { state, live, loading, pending, error, command, talk, audioReady, piDisplay, restarting, restartService, reconnect } = useFamilyPhone();
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [editApi, setEditApi] = useState(false);
  const [password, setPassword] = useState('');
  const [logout, setLogout] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const call = state.call;
  const busy = !!call && PHONE_BUSY_PHASES.includes(call.phase);
  const ready = state.auth === 'ready';
  const connectionProblem = !loading && (!state.available || !live || (ready && !state.connected));
  const timed = call?.phase === 'active' || state.auth === 'qr';
  useEffect(() => {
    if (!timed) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timed]);
  const elapsed = call?.connectedAt ? Math.max(0, Math.floor((now - Date.parse(call.connectedAt)) / 1000)) : 0;
  const connection = restarting ? 'Telefon-Dienst wird gestartet …' : loading ? 'Telefon wird verbunden …' : !state.available ? 'Telefon-Dienst nicht erreichbar' : !live ? 'Live-Verbindung wird wiederhergestellt …'
    : !ready ? 'Telegram einrichten' : !state.connected ? 'Telegram-Verbindung unterbrochen' : !audioReady ? 'Audio-Ausgang fehlt' : piDisplay && !state.audio.microphones.length ? 'Bereit · Nur zuhören' : 'Bereit zum Telefonieren';
  return <section className="family-phone-page">
    <div className="family-phone-heading"><div><p className={`family-phone-connection${ready && live && state.connected && audioReady ? ' ready' : ''}`}><i />{connection}</p></div>
      {ready && !settings && <button type="button" disabled={busy} onClick={() => onSettings(true)}>Kontakte & Ton</button>}
    </div>
    {(error || state.error) && <p role="alert" className="family-error">{error || state.error}</p>}
    {(connectionProblem || restarting) && <div className="family-tile family-phone-setup">
      <p>{restarting ? 'Der Start kann bis zu 40 Sekunden dauern. Deine Anmeldung und Kontakte bleiben erhalten.' : 'Bei Verbindungsproblemen kannst du die Webseite neu verbinden oder den Telefon-Dienst am Pi starten / neu starten.'}</p>
      <div className="family-phone-actions"><button type="button" disabled={pending} onClick={reconnect}>Erneut verbinden</button>
        <button type="button" disabled={pending || busy} onClick={() => void restartService()}>{restarting ? 'Telefon wird gestartet …' : 'Telefon-Dienst starten / neu starten'}</button></div>
      {busy && <p className="family-hint">Für einen Neustart zuerst das aktuelle Gespräch beenden.</p>}
    </div>}
    {!state.available ? <div className="family-tile family-phone-setup"><h3>Telefon-Dienst nicht erreichbar</h3><p>Mit dem Startknopf oben kannst du ihn am Pi wieder starten.</p></div> : !ready ? <div className="family-tile family-phone-setup">
      <h3>Familienkonto mit Telegram verbinden</h3>
      <p>Verwende das separate Telegram-Konto mit der Watch-Mobilnummer. Die Anmeldung bestätigst du auf deinem iPhone.</p>
      {(!state.configured || editApi) && <>
        <details><summary>Woher bekomme ich api_id und api_hash?</summary><ol>
          <li>Am iPhone <strong>my.telegram.org/apps</strong> öffnen und mit dem Familienkonto anmelden.</li>
          <li>Unter <strong>API development tools</strong> eine eigene Anwendung anlegen, zum Beispiel „HouseDash“.</li>
          <li><strong>api_id</strong> und <strong>api_hash</strong> hier direkt eintragen. Telegram stellt diese Schnittstelle kostenlos bereit.</li>
        </ol></details>
        <form className="family-phone-auth-form" onSubmit={async e => {
          e.preventDefault();
          const value = await command('configure', { apiId: Number(apiId), apiHash: apiHash.trim() });
          if (value) { setApiHash(''); setEditApi(false); if (value.auth !== 'ready') await command('qr'); }
        }}>
          <label>api_id<input value={apiId} maxLength={12} inputMode="numeric" autoComplete="off" onChange={e => setApiId(e.target.value.replace(/\D/g, ''))} required /></label>
          <label>api_hash<input type="password" value={apiHash} minLength={32} maxLength={32} autoComplete="off" onChange={e => setApiHash(e.target.value)} required /></label>
          <button type="submit" className="family-primary" disabled={pending}>Speichern & Anmeldung starten</button>
        </form>
      </>}
      {state.configured && !editApi && state.auth !== 'connecting' && <button type="button" disabled={pending} onClick={() => setEditApi(true)}>Telegram-App-Zugangsdaten ändern</button>}
      {state.configured && state.auth !== 'qr' && state.auth !== 'password' && <button type="button" className="family-primary" disabled={pending || state.auth === 'connecting'} onClick={() => void command('qr')}>{state.auth === 'connecting' ? 'Verbindung wird aufgebaut …' : 'QR-Code zur Anmeldung anzeigen'}</button>}
      {state.auth === 'qr' && state.qrUrl && <div className="family-phone-qr"><div><QRCodeSVG value={state.qrUrl} size={240} marginSize={3} /></div><section><h3>Am iPhone scannen</h3><p>Im richtigen Telegram-Konto auf <strong>Einstellungen → Geräte → Desktop-Gerät verknüpfen</strong> tippen und diesen QR-Code scannen.</p><p className="family-hint">{state.qrExpiresAt ? `Noch ${Math.max(0, Math.ceil((Date.parse(state.qrExpiresAt) - now) / 1000))} Sekunden gültig.` : ''}</p><button type="button" disabled={pending} onClick={() => void command('qr')}>Neuen QR-Code anzeigen</button></section></div>}
      {state.auth === 'password' && <form className="family-phone-auth-form" onSubmit={async e => { e.preventDefault(); if (await command('password', { password })) setPassword(''); }}><label>Telegram-Passwort<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={256} required /></label><button type="submit" className="family-primary" disabled={pending}>Anmeldung abschließen</button></form>}
    </div> : settings ? <>
      <div className="family-phone-settings"><section className="family-tile"><h3>Elternkontakte</h3><p className="family-hint">Diese beiden Kontakte können angerufen werden und hier anrufen. Es wird keine Nachricht versendet.</p><div className="family-phone-parent-settings">{slots.map(slot => <ParentSettings key={slot.id} slot={slot.id} label={slot.label} />)}</div></section>
        <section className="family-tile family-phone-audio"><h3>Ton</h3>
          <p className="family-hint">{piDisplay ? 'Mikrofon, Lautsprecher und Lautstärke am Pi stellst du unter Audio ein, gemeinsam für Telefon und KI-Stimme.' : 'Der Ton läuft über dieses Gerät. Mikrofon und Lautsprecher wählst du unter Audio. Beim ersten Anruf fragt der Browser nach dem Mikrofon.'}</p>
          <button type="button" onClick={onAudio}>Audio-Einstellungen öffnen</button>
        </section>
      </div>
      <section className="family-tile family-phone-account"><span>Verbunden als <strong>{state.account?.name}</strong></span><button type="button" disabled={pending} onClick={() => { if (!logout) setLogout(true); else { void command('logout'); setLogout(false); } }}>{logout ? 'Abmelden bestätigen' : 'Telegram abmelden'}</button>{logout && <button type="button" onClick={() => setLogout(false)}>Abbrechen</button>}</section>
    </> : <>
      {piDisplay && state.audio.message && <p className="family-phone-notice"><CalendarSymbol name="microphone" size={22} />{state.audio.message}</p>}
      <div className="family-phone-parents">{slots.map(slot => {
        const parent = state.parents.find(value => value.slot === slot.id);
        return <button type="button" key={slot.id} className={`family-phone-parent ${slot.id}`} disabled={busy || (!!parent && (!audioReady || !state.connected || !live || pending))}
          onClick={() => { if (!parent) onSettings(true); else void talk('call', { slot: slot.id }); }}>
          <span className="family-phone-avatar">{(parent?.label || slot.label).slice(0, 1)}</span><span><strong>{parent?.label || slot.label}</strong><small>{parent ? 'Anrufen' : 'Kontakt einrichten'}</small></span><CalendarSymbol name="phone" size={30} />
        </button>;
      })}</div>
      <section className={`family-tile family-phone-call${busy ? ' running' : ''}`} aria-label="Gesprächsstatus">
        {call ? <>
          <span className="family-phone-avatar large">{call.label.slice(0, 1)}</span><h3>{call.label}</h3><p className="family-phone-call-status" role="status">{PHONE_PHASE_LABEL[call.phase]}</p>
          {call.phase === 'active' && <strong className="family-phone-duration">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</strong>}
          {call.message && <p className="family-hint">{call.message}</p>}
          <div className="family-phone-actions">
            {call.phase === 'incoming' && <button type="button" className="family-phone-answer" disabled={pending || !audioReady} onClick={() => void talk('accept')}>Annehmen</button>}
            {call.phase === 'active' && (call.listenOnly ? <p className="family-phone-notice">Nur zuhören · Dein Gegenüber kann dich nicht hören.</p> : <button type="button" aria-pressed={call.muted} disabled={pending} onClick={() => void command('mute', { muted: !call.muted })}>{call.muted ? 'Mikrofon einschalten' : 'Stummschalten'}</button>)}
            {busy && <button type="button" className="family-phone-hangup" disabled={pending} onClick={() => void command('hangup')}>{call.phase === 'incoming' ? 'Ablehnen' : 'Auflegen'}</button>}
          </div>
        </> : <><CalendarSymbol name="phone" size={48} /><h3>Mit den Eltern sprechen</h3><p>Mama oder Papa antippen, um einen Telegram-Anruf zu starten.</p><small>{piDisplay ? 'Der Ton läuft über das Headset am Pi.' : 'Der Ton läuft über dieses Gerät.'}</small></>}
      </section>
    </>}
  </section>;
}
