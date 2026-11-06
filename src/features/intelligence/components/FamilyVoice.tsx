'use client';
import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { VOICE_UNAVAILABLE, type VoiceEngineChoice, type VoiceState } from '@/lib/family-voice-shared';

const ENGINES: { id: VoiceEngineChoice; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automatisch (empfohlen)', hint: 'Echtzeit-Stimme, und wenn sie nicht da ist, die lokale.' },
  { id: 'realtime', label: 'Echtzeit-Stimme', hint: 'Natürlich und schnell, Mikrofon-Ton und Antworten laufen über OpenAI.' },
  { id: 'local', label: 'Lokal auf dem Pi', hint: 'Ton bleibt auf dem Pi, nur der erkannte Text geht zur KI. Klingt einfacher und ist langsamer.' },
];

/** Einstellungen unter Mehr: Anmeldung, Modell und Stimme. Das Gespräch selbst läuft in FamilyConversation. */
export default function FamilyVoice({ onAudio }: { onAudio: () => void }) {
  const [state, setState] = useState<VoiceState>(VOICE_UNAVAILABLE);
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/family/voice', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setState(await response.json());
    } catch { setError('Der Sprachdienst ist gerade nicht erreichbar.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const stream = new EventSource('/api/family/voice/stream');
    stream.onopen = () => setLive(true);
    stream.onmessage = message => { try { setState(JSON.parse(message.data)); setLive(true); setLoading(false); } catch { setLive(false); } };
    stream.onerror = () => setLive(false);
    void refresh();
    return () => stream.close();
  }, [refresh]);
  const command = useCallback(async (action: string, fields: Record<string, unknown> = {}) => {
    setPending(true); setError('');
    try {
      const response = await fetch('/api/family/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...fields }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Die Aktion konnte nicht abgeschlossen werden.');
      setState(value as VoiceState);
    } catch (failure) { setError(failure instanceof Error && failure.name !== 'TypeError' ? failure.message : 'Der Sprachdienst antwortet gerade nicht.'); }
    finally { setPending(false); }
  }, []);
  const active = pending || state.interpreting || state.live;
  const message = error || state.error;
  return <section className="family-system family-voice">
    <p className="family-page-intro">Anmeldung und Stimme</p>
    {message && <p role="alert" className="family-error">{message}</p>}
    <section className="family-tile"><h3>ChatGPT verbinden</h3>
      <p className="family-hint">Verwende deine ChatGPT-Anmeldung über Codex. Es gelten die verfügbaren Funktionen und Limits deines Kontos. Die eigene Anmeldesitzung bleibt auf diesem Pi gespeichert.</p>
      {!state.available || !state.ready ? <><p role="status">{loading ? 'Sprachdienst wird verbunden …' : state.available ? 'Der OpenAI-Dienst wird vorbereitet …' : 'Der lokale Sprachdienst ist noch nicht erreichbar.'}</p><button type="button" onClick={() => void refresh()}>Status erneut laden</button></>
        : state.account ? <div className="family-voice-account"><p><strong>Verbunden</strong>{state.account.email ? ` · ${state.account.email}` : ''}{state.account.planType ? ` · ${state.account.planType}` : ''}</p>
          <label>Modell für Antworten<select value={state.model} disabled={active} onChange={event => void command('model', { model: event.target.value })}><option value="">Codex-Standardmodell</option>{state.models.map(model => <option key={model.id} value={model.model}>{model.name}</option>)}</select></label>
          <p className="family-hint">Die Modellauswahl ist ein Katalog. Ob dein Konto ein Modell nutzen kann, zeigt sich beim tatsächlichen Auftrag.</p>
          <button type="button" disabled={active} onClick={() => void command('logout')}>Auf diesem Pi abmelden</button></div>
        : state.login ? <div className="family-voice-login"><div><QRCodeSVG value={state.login.verificationUrl} size={180} marginSize={2} /></div><div>
          <p>Am Handy scannen oder die Anmeldeseite öffnen und diesen Gerätecode eingeben:</p><strong className="family-voice-code">{state.login.userCode}</strong>
          <a className="family-voice-link" href={state.login.verificationUrl} target="_blank" rel="noopener noreferrer">Anmeldeseite öffnen</a>
          <p className="family-hint">Falls nötig, die Gerätecode-Anmeldung in den Sicherheitseinstellungen deines ChatGPT-Kontos erlauben. Der Status aktualisiert sich nach der Anmeldung automatisch.</p>
          <button type="button" disabled={active} onClick={() => void command('cancel-login')}>Anmeldung abbrechen</button></div></div>
        : <button type="button" className="family-primary" disabled={active} onClick={() => void command('login')}>Mit ChatGPT anmelden</button>}
      {state.available && !live && <p className="family-hint" role="status">Live-Verbindung wird wiederhergestellt …</p>}
    </section>
    <section className="family-tile"><h3>Stimme</h3>
      <div className="family-system-form">
        <label>Sprachweg<select value={state.engine} disabled={active || !state.available} onChange={event => void command('voice-settings', { engine: event.target.value })}>{ENGINES.map(engine => <option key={engine.id} value={engine.id}>{engine.label}</option>)}</select></label>
        <p className="family-hint">{ENGINES.find(engine => engine.id === state.engine)?.hint}</p>
        {state.engine !== 'local' && <label>Stimme<select value={state.voice} disabled={active || !state.available} onChange={event => void command('voice-settings', { voice: event.target.value })}>{state.voices.map(voice => <option key={voice} value={voice}>{voice}</option>)}</select></label>}
        {state.engine !== 'local' && <p className="family-hint">Die Echtzeit-Stimme ist bei OpenAI noch als experimentell gekennzeichnet. Eine neue Stimme gilt ab dem nächsten Gespräch.</p>}
      </div>
    </section>
    <section className="family-tile"><h3>Mikrofon & Lautsprecher</h3>
      <p className="family-hint">Welches Mikrofon und welcher Lautsprecher benutzt wird, stellst du unter Audio ein. Das gilt für die KI-Stimme und für das Telefon.</p>
      <button type="button" onClick={onAudio}>Audio-Einstellungen öffnen</button>
    </section>
  </section>;
}
