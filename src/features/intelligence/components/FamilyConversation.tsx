'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { VoiceAction, VoiceEngineChoice, VoiceMessage, VoiceState } from '@/lib/family-voice-shared';
import { validVoiceHistory, VOICE_HISTORY_LIMIT } from '@/lib/family-voice-shared';
import type { VoiceEngine, VoiceEvents, VoicePhase } from '@/features/intelligence/client/engine';
import { LocalEngine } from '@/features/intelligence/client/local-engine';
import { RealtimeEngine } from '@/features/intelligence/client/realtime-engine';
import { readVoiceDevicePreference } from '@/app/family/useVoiceDevices';
import { hasOwnKeyboard } from '@/app/family/TouchKeyboard';
import ConversationIcon from './ConversationIcon';
import './conversation.css';

const LABEL: Record<VoicePhase, string> = { idle: 'Tippe zum Sprechen', connecting: 'Verbinde …', listening: 'Ich höre zu', hearing: 'Ich höre dich …', thinking: 'Einen Moment …', speaking: '' };
const HISTORY_KEY = 'housedash-conversation-v1';
const HISTORY_TTL = 24 * 60 * 60 * 1000;
function readHistory(): VoiceMessage[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || 'null');
    if (saved?.version === 1 && typeof saved.expires === 'number' && saved.expires > Date.now() && validVoiceHistory(saved.messages)) return saved.messages;
    localStorage.removeItem(HISTORY_KEY);
  } catch { /* Browser storage may be unavailable. The current conversation still works. */ }
  return [];
}

/** Gesprächs-Overlay. Es startet beim Öffnen von selbst und kennt die Sprach-Engines nur über ihre Schnittstelle. */
export default function FamilyConversation({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<VoicePhase>('connecting');
  const [level, setLevel] = useState(0);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [partial, setPartial] = useState('');
  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const [typing, setTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [running, setRunning] = useState(false);
  const [hasMic, setHasMic] = useState(true);
  const engine = useRef<VoiceEngine | null>(null);
  const closing = useRef(false);
  const startup = useRef(0);
  const pendingText = useRef('');
  const lastTyped = useRef('');
  const list = useRef<HTMLDivElement>(null);
  const history = useRef<VoiceMessage[]>([]);
  const panel = useRef<HTMLElement>(null);
  const followMessages = useRef(true);

  const events = useCallback((isCurrent: () => boolean, fallback?: () => void): VoiceEvents => ({
    phase: value => { if (isCurrent()) setPhase(value); },
    level: value => { if (isCurrent()) setLevel(value); },
    message: message => {
      if (!isCurrent() || !message.text.trim()) return;
      if (message.role === 'assistant') lastTyped.current = '';
      const bounded = { ...message, text: message.text.slice(0, 1200), at: message.at ?? new Date().toISOString() };
      if (history.current.at(-1)?.role === bounded.role && history.current.at(-1)?.text === bounded.text) return;
      history.current = [...history.current, bounded].slice(-VOICE_HISTORY_LIMIT);
      setMessages(history.current);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, expires: Date.now() + HISTORY_TTL, messages: history.current })); }
      catch { setNotice('Dieser Browser kann den Tagesverlauf nicht speichern. Beim Schließen geht der Kontext verloren.'); }
    },
    partial: value => { if (isCurrent()) setPartial(value); },
    action: action => { if (isCurrent()) { setActions(old => [...old.filter(item => item.id !== action.id), action].slice(-5)); if (action.kind === 'undo') window.dispatchEvent(new Event('housedash-change')); } },
    notice: value => { if (isCurrent()) setNotice(value); },
    microphone: value => { if (isCurrent()) { setNotice(value); setHasMic(false); } },
    ended: ({ error: failure, fallback: canFallback }) => {
      if (!isCurrent() || closing.current) return;
      setRunning(false);
      if (canFallback && fallback) { setNotice('Die Echtzeit-Stimme ist gerade nicht da. Ich nehme die lokale Stimme. Bitte eine noch unbeantwortete Frage erneut stellen.'); fallback(); return; }
      // Ohne Mikrofon (zum Beispiel am Display) bleibt Schreiben möglich.
      setPhase('idle');
      if (failure) setError(failure);
    },
  }), []);

  const startLocal = useCallback((listens: boolean) => {
    const microphoneId = readVoiceDevicePreference();
    let self: LocalEngine | null = null;
    self = new LocalEngine(events(() => engine.current === self), { microphoneId, history: history.current }, listens);
    engine.current = self; setRunning(true);
    void self.start();
    return self;
  }, [events]);

  const begin = useCallback(async () => {
    const generation = ++startup.current;
    const previous = engine.current; engine.current = null; previous?.stop();
    setRunning(false); setPhase('connecting'); setPartial(''); setHasMic(true); setMuted(false);
    setError(''); setNotice('');
    let choice: VoiceEngineChoice = 'auto';
    try {
      const state: VoiceState = await (await fetch('/api/family/voice', { cache: 'no-store', signal: AbortSignal.timeout(12_000) })).json();
      if (closing.current || generation !== startup.current) return;
      if (!state.available || !state.ready) { setPhase('idle'); setError('Der Sprachdienst ist noch nicht bereit. Bitte gleich neu verbinden.'); return; }
      if (!state.account) { setPhase('idle'); setError('Bitte ChatGPT einmal unter Mehr → OpenAI & Sprache verbinden.'); return; }
      choice = state.engine;
    } catch { if (!closing.current && generation === startup.current) { setPhase('idle'); setError('Der Sprachdienst ist gerade nicht erreichbar.'); } return; }
    if (closing.current || generation !== startup.current) return;
    const flush = (current: VoiceEngine) => { if (pendingText.current) { current.sendText(pendingText.current); pendingText.current = ''; } };
    if (choice === 'local') { flush(startLocal(true)); return; }
    const microphoneId = readVoiceDevicePreference();
    let self: RealtimeEngine | null = null;
    self = new RealtimeEngine(events(() => engine.current === self, choice === 'auto' ? () => startLocal(true) : undefined), { microphoneId, history: history.current });
    engine.current = self; setRunning(true);
    flush(self);
    void self.start();
  }, [events, startLocal]);

  useEffect(() => {
    closing.current = false;
    history.current = readHistory();
    setMessages(history.current);
    void begin();
    return () => { closing.current = true; engine.current?.stop(); engine.current = null; };
  }, [begin]);
  useEffect(() => { if (followMessages.current) list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, partial, actions]);
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('button[aria-label="Auflegen"]')?.focus();
  }, []);
  useEffect(() => {
    const root = panel.current;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onBack(); }
      if (event.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary')].filter(item => item.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    root?.addEventListener('keydown', keydown);
    return () => root?.removeEventListener('keydown', keydown);
  }, [onBack]);

  function mic() {
    const current = engine.current;
    if (!running) { void begin(); return; }
    if (current instanceof LocalEngine && phase === 'idle' && !muted) { current.setMicrophoneEnabled(true); return; }
    current?.setMicrophoneEnabled(muted); setMuted(value => !value);
  }
  /** Tippen auf die Stimme: neu verbinden oder, wenn die lokale Stimme gerade nicht zuhört, wieder zuhören. */
  function speak() {
    const current = engine.current;
    if (!running) { void begin(); return; }
    if (current instanceof LocalEngine && phase === 'idle') current.setMicrophoneEnabled(true);
  }
  async function audio() {
    setAudioBusy(true);
    try { await engine.current?.resumeAudio(); setNotice('Ton ist aktiviert.'); }
    catch (failure) { setNotice(failure instanceof Error ? failure.message : 'Bitte die Audiofreigabe im Browser prüfen.'); }
    finally { setAudioBusy(false); }
  }
  function send(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText(''); setError(''); setNotice('');
    followMessages.current = true;
    lastTyped.current = value;
    // Getippt läuft über dieselbe Engine wie Gesprochenes, damit Stimme und Tempo gleich bleiben.
    if (engine.current && running) { engine.current.sendText(value); return; }
    pendingText.current = value;
    void begin();
  }
  function clearHistory() {
    if (!clearing) { setClearing(true); return; }
    setClearing(false);
    startup.current++;
    engine.current?.stop(); engine.current = null;
    history.current = []; pendingText.current = ''; lastTyped.current = '';
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* unavailable */ }
    setMessages([]); setPartial(''); setActions([]); setRunning(false); setPhase('idle');
    setError(''); setNotice('Der Gesprächsverlauf auf diesem Gerät wurde gelöscht. Gespeicherte Termine und Family-Brain-Erinnerungen bleiben erhalten.');
  }
  async function run(action: VoiceAction) {
    setBusyAction(action.id); setError('');
    try {
      const response = await fetch('/api/family/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', id: action.id }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Das hat nicht geklappt.');
      setNotice(value.message || 'Erledigt.');
      window.dispatchEvent(new Event('housedash-change'));
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusyAction(''); setActions(old => old.filter(a => a.id !== action.id)); }
  }

  const connecting = phase === 'connecting';
  // Schreiben am Display: Die Bildschirmtastatur nimmt unten 350 px. Das Layout richtet sich nach dem Schreiben-Zustand, nicht nach der Tastatur,
  // damit beim Auf- und Zugehen der Tastatur nichts springt.
  const [reserveKeyboard, setReserveKeyboard] = useState(false);
  useEffect(() => { setReserveKeyboard(!hasOwnKeyboard()); }, []);
  // Gezeigt wird nur der laufende Austausch: was du gesagt hast und was Family Brain gerade sagt. Der Verlauf liegt unter "Mehr".
  const lastYou = [...messages].reverse().find(message => message.role === 'user');
  const lastBrain = [...messages].reverse().find(message => message.role === 'assistant');
  const answered = !!lastBrain && (!lastYou || messages.lastIndexOf(lastBrain) > messages.lastIndexOf(lastYou));
  const brainText = partial || (answered && phase !== 'hearing' && phase !== 'thinking' ? lastBrain!.text : '');
  const youText = phase === 'hearing' ? '' : lastYou && (partial || answered || phase === 'thinking') ? lastYou.text : '';
  const status = error && !running ? 'Verbindung unterbrochen' : muted && phase === 'idle' ? 'Mikrofon ist aus' : LABEL[phase];
  const pending = actions.length > 0;
  const caption = useRef<HTMLDivElement>(null);
  // Beim Sprechen wächst der Text nach unten; lange Antworten laufen mit, ohne dass sich etwas anderes bewegt.
  useEffect(() => { const el = caption.current; if (el && partial) el.scrollTop = el.scrollHeight; }, [partial]);
  return <section className={`family-conversation call${typing && reserveKeyboard ? " reserve-keyboard" : ""}`} ref={panel} aria-label="Gespräch mit Family Brain">
    <div className="call-top"><span className={`call-dot ${running ? 'on' : ''}`} aria-hidden="true" /><span>Family Brain</span><button type="button" className="call-close" onClick={onBack} aria-label="Schließen"><ConversationIcon name="close" /></button></div>
    {/* Derselbe Kreis wie auf Home. Er atmet beim Zuhören, pulsiert beim Denken und schwingt mit der Stimme beim Sprechen. */}
    <button type="button" className={`call-stage call-orb ${phase}`} style={{ '--lvl': Math.min(1, level) } as CSSProperties} onClick={speak} aria-label={phase === 'idle' ? 'Sprechen' : status || 'Family Brain spricht'} tabIndex={phase === 'idle' ? 0 : -1}>
      <i /><i /><span className="call-orb-core"><ConversationIcon name={muted ? 'muted' : 'mic'} /></span>
    </button>
    <div className="call-caption" ref={caption} role="status" aria-live="off">
      {/* Feste Plätze: Status und eigene Frage behalten ihre Höhe, auch wenn sie leer sind. So springt der Text beim Sprechen nicht. */}
      <p className={`call-status${status ? '' : ' is-empty'}`}>{status || ' '}</p>
      <p className={`call-you${youText ? '' : ' is-empty'}`}>{youText || ' '}</p>
      <p className="call-brain">{brainText}</p>
    </div>
    {pending && <div className="call-actions">{actions.map(action => <div className={`family-conversation-action ${action.kind}`} key={action.id}>
      <div><strong>{action.kind === 'undo' && <ConversationIcon name="check" />}{action.title}</strong>{action.detail && <small>{action.detail}</small>}{action.savedEvent && <details className="family-conversation-saved"><summary>Gespeicherte Notiz</summary><p>{action.savedEvent.notes || 'Keine Notiz'}</p></details>}</div>
      {action.kind === 'undo'
        ? <button type="button" disabled={!!busyAction} onClick={() => void run(action)}>{busyAction === action.id ? '…' : 'Rückgängig'}</button>
        : <span><button type="button" className="family-primary" disabled={!!busyAction} onClick={() => void run(action)}>{busyAction === action.id ? 'Einen Moment …' : 'Bestätigen'}</button><button type="button" disabled={!!busyAction} onClick={() => setActions(old => old.filter(a => a.id !== action.id))}>Verwerfen</button></span>}
    </div>)}</div>}
    {clearing && <div className="family-conversation-notice" role="alert"><p>Gesprächsverlauf auf diesem Gerät löschen? Gespeicherte Termine bleiben erhalten.</p><button type="button" onClick={clearHistory}>Löschen</button><button type="button" onClick={() => setClearing(false)}>Behalten</button></div>}
    {(error || notice) && <div className={`family-conversation-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}><p>{error || notice}</p>{!running && !connecting && <button type="button" onClick={() => void begin()}><ConversationIcon name="refresh" />Neu verbinden</button>}</div>}
    {typing && <form className="family-conversation-input" onSubmit={event => { send(event); }}><input aria-label="Nachricht an Family Brain" value={text} maxLength={1000} autoFocus onChange={event => setText(event.target.value)} placeholder="Schreib mir …" /><button type="submit" aria-label="Senden" disabled={!text.trim() || connecting}><ConversationIcon name="send" /></button><button type="button" className="call-sheet-close" aria-label="Schreiben beenden" onClick={() => setTyping(false)}><ConversationIcon name="close" /></button></form>}
    {showHistory && <div className="family-conversation-messages" role="log" aria-label="Verlauf" ref={list} onScroll={() => { const element = list.current; if (element) followMessages.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>
      {!messages.length ? <p className="family-conversation-empty">Noch kein Verlauf.</p> : messages.map((message, index) => <article key={index} className={message.role === 'user' ? 'from-you' : 'from-family'}><strong>{message.role === 'user' ? 'Du' : 'Family Brain'}</strong><p>{message.text}</p></article>)}
    </div>}
    {more && <div className="call-more" role="group" aria-label="Mehr">
      <button type="button" onClick={() => { setTyping(value => !value); setShowHistory(false); setMore(false); }} aria-pressed={typing}><ConversationIcon name="keyboard" />Schreiben</button>
      {hasMic && <button type="button" onClick={mic} disabled={connecting || !running} aria-pressed={muted}><ConversationIcon name={muted ? 'muted' : 'mic'} />{muted ? 'Mikrofon einschalten' : 'Mikrofon ausschalten'}</button>}
      <button type="button" onClick={() => void audio()} disabled={!running || connecting || audioBusy}><ConversationIcon name="sound" />{audioBusy ? 'Aktiviere …' : 'Ton aktivieren'}</button>
      <button type="button" onClick={() => { setShowHistory(value => !value); setTyping(false); setMore(false); }} aria-pressed={showHistory}><ConversationIcon name="history" />Verlauf</button>
      <button type="button" onClick={() => setClearing(true)} disabled={!messages.length}><ConversationIcon name="trash" />Verlauf löschen</button>
    </div>}
    <div className="call-bar">
      <button type="button" className="call-end" onClick={onBack} aria-label="Auflegen"><ConversationIcon name="end" /></button>
      <button type="button" className="call-more-toggle" onClick={() => setMore(value => !value)} aria-expanded={more}><ConversationIcon name="more" />Mehr</button>
    </div>
  </section>;
}
