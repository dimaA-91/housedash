'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PHONE_BUSY_PHASES, PHONE_UNAVAILABLE, type PhoneState } from '@/lib/family-phone-shared';
import { BrowserCallAudio, isPiDisplay } from '@/features/phone/client/browser-audio';

interface PhoneContextValue {
  state: PhoneState; live: boolean; loading: boolean; pending: boolean; error: string;
  command: (action: string, fields?: Record<string, unknown>) => Promise<PhoneState | null>;
  /** Anrufen oder Annehmen: Der Ton läuft auf dem Gerät, mit dem man telefoniert (am Pi-Display über das Headset am Pi). */
  talk: (action: 'call' | 'accept', fields?: Record<string, unknown>) => Promise<PhoneState | null>;
  /** Telefonieren ist möglich: am Pi-Display mit Audio-Ausgang, auf jedem anderen Gerät mit dessen Browser. */
  audioReady: boolean;
  /** Das Display am Pi: nur dort zählen Headset und Audio-Geräte am Pi. */
  piDisplay: boolean;
  restarting: boolean; restartService: () => Promise<void>; reconnect: () => void;
}
const PhoneContext = createContext<PhoneContextValue | null>(null);

export function FamilyPhoneProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PhoneState>(PHONE_UNAVAILABLE);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState(false);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [piDisplay, setPiDisplay] = useState(true);
  const browserAudio = useRef<BrowserCallAudio | null>(null);
  useEffect(() => { setPiDisplay(isPiDisplay()); }, []);
  const currentState = useRef(state);
  const recovery = useRef<AbortController | null>(null);
  useEffect(() => { currentState.current = state; }, [state]);
  useEffect(() => () => recovery.current?.abort(), []);
  const reconnect = useCallback(() => setConnectionEpoch(value => value + 1), []);
  const receive = useCallback((next: PhoneState) => setState(previous =>
    previous.generation === next.generation && previous.revision > next.revision ? previous : next), []);
  useEffect(() => {
    const controller = new AbortController();
    let closed = false;
    let receivedStream = 0;
    let lastContact = Date.now();
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || closed) return;
      refreshing = true;
      const sequence = receivedStream;
      try {
        const response = await fetch('/api/family/phone', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
        if (response.ok && !closed) {
          const value = await response.json();
          if (sequence === receivedStream) receive(value);
          lastContact = Date.now();
        }
      } catch { /* EventSource retries independently. Keep the last known call. */ }
      finally { refreshing = false; if (!closed) setLoading(false); }
    };
    const stream = new EventSource('/api/family/phone/stream');
    stream.onopen = () => { lastContact = Date.now(); setLive(true); setLoading(false); };
    stream.addEventListener('heartbeat', () => { lastContact = Date.now(); });
    stream.onmessage = message => {
      try { const value = JSON.parse(message.data); receivedStream++; lastContact = Date.now(); receive(value); setLive(true); setLoading(false); } catch { setLive(false); }
    };
    stream.onerror = () => { setLive(false); setLoading(false); void refresh(); };
    // Local watchdog only: no recurring network requests while SSE is healthy.
    const watchdog = setInterval(() => { if (Date.now() - lastContact > 55_000) reconnect(); }, 15_000);
    const wake = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', wake);
    void refresh();
    return () => { closed = true; clearInterval(watchdog); controller.abort(); stream.close(); document.removeEventListener('visibilitychange', wake); };
  }, [receive, reconnect, connectionEpoch]);
  const restartService = useCallback(async () => {
    if (recovery.current) return;
    const controller = new AbortController();
    recovery.current = controller;
    setRestarting(true); setError('');
    const previousGeneration = currentState.current.generation;
    try {
      const response = await fetch('/api/family/phone', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart-service' }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Der Telefon-Dienst konnte nicht gestartet werden.');
      const deadline = Date.now() + 40_000;
      // Bounded startup checks only after an explicit restart, never steady polling.
      while (Date.now() < deadline) {
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new DOMException('Abgebrochen', 'AbortError')); };
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, 1200);
          controller.signal.addEventListener('abort', abort, { once: true });
          if (controller.signal.aborted) abort();
        });
        try {
          const status = await fetch('/api/family/phone', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) });
          if (!status.ok) continue;
          const next: PhoneState = await status.json();
          if (next.available && next.generation !== previousGeneration) {
            receive(next); reconnect(); return;
          }
        } catch { if (controller.signal.aborted) return; }
      }
      throw new Error('Start angefordert, aber der Telefon-Dienst antwortet noch nicht. Bitte erneut verbinden.');
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error && !['TimeoutError', 'AbortError', 'TypeError'].includes(failure.name) ? failure.message : 'Die Start-Steuerung antwortet nicht.');
    } finally {
      recovery.current = null;
      if (!controller.signal.aborted) setRestarting(false);
    }
  }, [receive, reconnect]);
  const command = useCallback(async (action: string, fields: Record<string, unknown> = {}) => {
    setPending(true); setError('');
    try {
      const response = await fetch('/api/family/phone', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, action }), signal: AbortSignal.timeout(20_000) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Die Telefon-Aktion ist fehlgeschlagen.');
      receive(value);
      return value as PhoneState;
    } catch (failure) {
      setError(failure instanceof Error && !['TimeoutError', 'AbortError', 'TypeError'].includes(failure.name) ? failure.message : 'Der Telefon-Dienst antwortet momentan nicht.');
      return null;
    } finally { setPending(false); }
  }, [receive]);
  const talk = useCallback(async (action: 'call' | 'accept', fields: Record<string, unknown> = {}) => {
    if (piDisplay) return command(action, { ...fields, audioHost: 'pi' });
    // Auf Handy und iPad läuft der Ton im Browser. Die Berechtigung fürs Mikrofon fragt der Browser hier, aus dem Tipp heraus.
    browserAudio.current?.stop();
    const audio = await BrowserCallAudio.prepare();
    browserAudio.current = audio;
    const result = await command(action, { ...fields, audioHost: 'browser', browserMicrophone: audio.hasMicrophone });
    if (!result && browserAudio.current === audio) { audio.stop(); browserAudio.current = null; }
    return result;
  }, [command, piDisplay]);
  // Ton starten, sobald das Gespräch läuft, und aufräumen, wenn es endet.
  useEffect(() => {
    const call = state.call, audio = browserAudio.current;
    if (!audio) return;
    if (!call || call.audioHost !== 'browser' || !PHONE_BUSY_PHASES.includes(call.phase)) { audio.stop(); browserAudio.current = null; return; }
    if (call.phase === 'connecting' || call.phase === 'active') { audio.start(); audio.setMuted(call.muted); }
  }, [state.call]);
  useEffect(() => () => { browserAudio.current?.stop(); browserAudio.current = null; }, []);
  const audioReady = state.audio.ready || !piDisplay;
  const value = useMemo(() => ({ state, live, loading, pending: pending || restarting, error, command, talk, audioReady, piDisplay, restarting, restartService, reconnect }), [state, live, loading, pending, error, command, talk, audioReady, piDisplay, restarting, restartService, reconnect]);
  return <PhoneContext.Provider value={value}>{children}</PhoneContext.Provider>;
}

export function useFamilyPhone() {
  const value = useContext(PhoneContext);
  if (!value) throw new Error('Phone provider missing.');
  return value;
}

/** A real incoming call is visible on every tab, even over the idle screen. */
export function FamilyPhoneIncoming({ phoneVisible, onOpen }: { phoneVisible: boolean; onOpen: () => void }) {
  const { state, pending, error, command, talk, audioReady, piDisplay } = useFamilyPhone();
  const call = state.call;
  const active = call && PHONE_BUSY_PHASES.includes(call.phase);
  return <>
    {active && <span hidden data-phone-active="true" />}
    {call?.phase === 'incoming' && !phoneVisible && <div className="family-overlay family-phone-overlay" role="dialog" aria-modal="true" aria-labelledby="incoming-phone-title">
      <section className="family-phone-incoming"><span className="family-phone-avatar">{call.label.slice(0, 1)}</span>
        <p>Eingehender Telegram-Anruf</p><h2 id="incoming-phone-title">{call.label} ruft an</h2>
        {piDisplay && state.audio.message && <p className="family-phone-notice">{state.audio.message}</p>}
        {error && <p role="alert" className="family-error">{error}</p>}
        <div className="family-phone-actions">
          <button type="button" className="family-phone-answer" disabled={pending || !audioReady} onClick={async () => { if (await talk('accept')) onOpen(); }}>Annehmen</button>
          <button type="button" className="family-phone-hangup" disabled={pending} onClick={() => void command('hangup')}>Ablehnen</button>
          <button type="button" onClick={onOpen}>Telefon öffnen</button>
        </div>
      </section>
    </div>}
  </>;
}
