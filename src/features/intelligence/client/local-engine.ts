import type { VoiceAction, VoiceMessage } from '@/lib/family-voice-shared';
import { VOICE_HISTORY_LIMIT } from '@/lib/family-voice-shared';
import { playClientSpeech, prepareClientAudio, startClientRecording, stopClientSpeech, type ClientRecording } from '@/app/family/client-audio';
import { microphoneMessage, readEvents, type VoiceEngine, type VoiceEngineOptions, type VoiceEvents } from './engine';

const SILENCE_END_MS = 800;
const NO_SPEECH_MS = 7000;
const MAX_RECORDING_MS = 20_000;

/** Was Piper sonst buchstabiert oder falsch betont, wird für das Vorlesen ausgeschrieben. */
export function speakable(text: string) {
  return text
    .replace(/\b(\d{1,2}):00\s*Uhr/g, '$1 Uhr')
    .replace(/\b(\d{1,2}):(\d{2})\s*Uhr/g, (_, h, m) => `${h} Uhr ${Number(m)}`)
    .replace(/(\d)\s*°C?/g, '$1 Grad').replace(/\s*%/g, ' Prozent').replace(/km\/h/g, 'Kilometer pro Stunde')
    .replace(/\bz\.\s?B\./g, 'zum Beispiel').replace(/\bMin\.?\b/g, 'Minuten').replace(/[*_#`]/g, '');
}
/** crypto.randomUUID gibt es nur über HTTPS; getippt wird aber auch über die normale HTTP-Adresse. */
const dialogId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
/** Fertige Sätze abtrennen, damit der erste schon erklingt, während der Rest entsteht. */
function splitSentences(text: string) {
  const parts: string[] = [];
  const pattern = /[^.!?]+[.!?]+(?=\s|$)/g;
  let match: RegExpExecArray | null, last = 0;
  while ((match = pattern.exec(text))) { parts.push(match[0].trim()); last = pattern.lastIndex; }
  return { parts, rest: text.slice(last) };
}

/**
 * Rückfallebene ohne Echtzeit-Dienst: Erkennung mit Vosk und Stimme mit Piper auf dem Pi, die KI antwortet als Text.
 * Bleibt im Gespräch: Nach jeder Antwort hört sie kurz wieder zu, damit man nicht erneut tippen muss.
 */
export class LocalEngine implements VoiceEngine {
  readonly id = 'local';
  private recorder: ClientRecording | null = null;
  private request: AbortController | null = null;
  private stopped = false;
  private history: VoiceMessage[] = [];
  private dialog = dialogId();
  private busy = false;
  private generation = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  constructor(private events: VoiceEvents, private options: VoiceEngineOptions, private listens = true) { this.history = options.history ?? []; }

  private post(path: string, init: RequestInit, timeoutMs: number) {
    this.request = new AbortController();
    return fetch(path, { ...init, signal: AbortSignal.any([this.request.signal, AbortSignal.timeout(timeoutMs)]) });
  }
  private synthesize(text: string) {
    return fetch('/api/family/voice/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: speakable(text).slice(0, 600) }), signal: AbortSignal.timeout(45_000) }).then(response => { if (!response.ok) throw new Error('Die Sprachausgabe ist gerade nicht verfügbar.'); return response.arrayBuffer(); });
  }

  async start() {
    prepareClientAudio();
    void fetch('/api/family/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preload' }) }).catch(() => {});
    if (this.listens) await this.listen();
    else this.events.phase('idle');
  }

  /** Antippen während die Stimme spricht oder denkt: sofort wieder zuhören. */
  async listen() {
    if (this.stopped || this.recorder) return;
    const generation = ++this.generation;
    this.busy = false;
    stopClientSpeech(); this.request?.abort();
    this.events.phase('listening');
    let floor = 0.03, voiced = 0, heard = false, lastVoice = Date.now();
    const started = Date.now();
    try {
      const recorder = await startClientRecording(this.options.microphoneId, level => {
        if (generation !== this.generation) return;
        this.events.level(level);
        const threshold = Math.max(0.07, floor * 2.5);
        if (level > threshold) { voiced++; lastVoice = Date.now(); if (voiced >= 3 && !heard) { heard = true; this.events.phase('hearing'); } }
        else { voiced = 0; floor = floor * 0.95 + level * 0.05; }
        const now = Date.now();
        if (heard && now - lastVoice > SILENCE_END_MS) void this.finishRecording(generation);
        else if (!heard && now - started > NO_SPEECH_MS) this.cancelRecording(generation);
        else if (now - started > MAX_RECORDING_MS) void this.finishRecording(generation);
      });
      if (this.stopped || generation !== this.generation || !this.listens) { recorder.cancel(); return; }
      this.recorder = recorder;
    } catch (failure) { if (!this.stopped && generation === this.generation) { this.listens = false; this.events.microphone(microphoneMessage(failure)); this.events.phase('idle'); } }
  }

  private cancelRecording(generation: number) {
    if (generation !== this.generation || !this.recorder) return;
    this.recorder.cancel(); this.recorder = null; this.generation++;
    this.events.level(0); this.events.phase('idle');
  }

  private async finishRecording(generation: number) {
    const recorder = this.recorder;
    if (generation !== this.generation || !recorder) return;
    this.recorder = null;
    this.busy = true;
    this.events.level(0); this.events.phase('thinking');
    try {
      const audio = await recorder.finish();
      if (this.stopped || generation !== this.generation) return;
      const response = await this.post('/api/family/voice/audio', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio }, 50_000);
      const value = await response.json();
      if (this.stopped || generation !== this.generation) return;
      if (!response.ok) { this.busy = false; this.events.notice(value.error || 'Das habe ich nicht verstanden.'); this.events.phase('idle'); return; }
      if (!this.stopped && generation === this.generation) await this.ask(String(value.text));
    } catch { if (!this.stopped && generation === this.generation) { this.busy = false; this.events.notice('Die Spracherkennung antwortet gerade nicht.'); this.events.phase('idle'); } }
  }

  /** Frage stellen, egal ob gesprochen oder getippt. Sätze werden vorgelesen, sobald sie fertig sind. */
  async ask(text: string) {
    if (this.stopped) return;
    const generation = ++this.generation;
    this.busy = true;
    this.recorder?.cancel(); this.recorder = null;
    stopClientSpeech(); this.request?.abort();
    this.events.message({ role: 'user', text });
    this.events.phase('thinking');
    const queue: Promise<ArrayBuffer | null>[] = [];
    let spoken = 0, playing: Promise<void> = Promise.resolve();
    const enqueue = (audio: Promise<ArrayBuffer | null>) => {
      queue.push(audio);
      playing = playing.then(async () => {
        const bytes = await audio;
        if (!bytes || this.stopped || generation !== this.generation) return;
        this.events.phase('speaking');
        await playClientSpeech(bytes.slice(0));
        if (generation === this.generation && !this.stopped) this.events.phase('thinking');
      }).catch(() => { if (!this.stopped && generation === this.generation) this.events.notice('Der Ton konnte nicht abgespielt werden. Die Antwort bleibt als Text sichtbar. Bitte die Audiofreigabe und Lautstärke dieses Browsers prüfen.'); });
    };
    const speak = (sentence: string) => { enqueue(this.synthesize(sentence).catch(() => { if (!this.stopped && generation === this.generation) this.events.notice('Die Sprachausgabe ist ausgefallen. Die Antwort bleibt als Text sichtbar.'); return null; })); };
    let answer = '';
    try {
      const response = await this.post('/api/family/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'interpret', text, dialog: this.dialog, history: this.history.slice(-VOICE_HISTORY_LIMIT) }) }, 80_000);
      if (!response.ok) { const value = await response.json().catch(() => ({})); throw new Error(typeof value.error === 'string' ? value.error : 'Der Sprachdienst antwortet gerade nicht.'); }
      await readEvents(response, event => {
        if (generation !== this.generation) return;
        if (event.type === 'delta') {
          const { parts } = splitSentences(String(event.text));
          while (spoken < parts.length) speak(parts[spoken++]);
          this.events.partial(String(event.text));
        } else if (event.type === 'action') this.events.action(event.action as VoiceAction);
        else if (event.type === 'result') { const intent = event.intent as { message?: string }; answer = String(intent?.message ?? ''); }
        else if (event.type === 'error') throw new Error(String(event.message));
      });
      if (generation !== this.generation) return;
      if (!answer.trim()) throw new Error('Es kam keine vollständige Antwort. Bitte vor dem Wiederholen prüfen, ob dein Auftrag ausgeführt wurde.');
      const { parts, rest } = splitSentences(answer);
      while (spoken < parts.length) speak(parts[spoken++]);
      if (rest.trim()) speak(rest.trim());
      this.history = [...this.history, { role: 'user' as const, text: text.slice(0, 1200) }, { role: 'assistant' as const, text: answer.slice(0, 1200) }].slice(-VOICE_HISTORY_LIMIT);
      this.events.partial('');
      this.events.message({ role: 'assistant', text: answer });
      await playing;
      if (this.stopped || generation !== this.generation) return;
      this.busy = false;
      this.events.phase('idle');
      if (this.listens) await this.listen();
    } catch (failure) {
      if (this.stopped || generation !== this.generation || (failure instanceof DOMException && failure.name === 'AbortError')) return;
      this.events.partial('');
      this.busy = false;
      this.events.notice(failure instanceof Error && failure.name !== 'TypeError' && failure.name !== 'TimeoutError' ? failure.message : 'Der Sprachdienst antwortet gerade nicht.');
      this.events.phase('idle');
    }
  }

  sendText(text: string) { void this.ask(text); }

  setMicrophoneEnabled(enabled: boolean) {
    this.listens = enabled;
    if (!enabled && this.recorder) {
      this.recorder.cancel(); this.recorder = null; this.generation++;
      this.events.level(0); this.events.phase('idle');
    }
    if (enabled && !this.busy) void this.listen();
  }

  async resumeAudio() {
    const context = prepareClientAudio();
    await context.resume();
    if (context.state !== 'running') throw new Error('Bitte Audio in diesem Browser freigeben.');
  }

  stop() { this.finish({}); }

  private finish(reason: { error?: string; fallback?: boolean }) {
    if (this.stopped) return;
    this.stopped = true; this.generation++;
    this.timers.forEach(clearTimeout);
    this.recorder?.cancel(); this.recorder = null;
    this.request?.abort(); stopClientSpeech();
    this.events.level(0); this.events.phase('idle');
    this.events.ended(reason);
  }
}
