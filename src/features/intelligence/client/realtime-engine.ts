import type { VoiceAction } from '@/lib/family-voice-shared';
import { routeToSpeaker } from '@/app/family/client-audio';
import { microphoneMessage, readEvents, type VoiceEngine, type VoiceEngineOptions, type VoiceEvents } from './engine';

const IDLE_LIMIT_MS = 90_000;
const SPEECH_LEVEL = 0.012;
const THINKING_LIMIT_MS = 30_000;
/** So schnell zeigt die Anzeige "ich habe dich gehört", noch bevor die Frage als Text zurückkommt. */
const HEARD_AFTER_MS = 250;
const SILENCE_AFTER_MS = 700;
/** Kommt nach einer vermeintlichen Frage kein Text, war es nur ein Geräusch. */
const NOISE_LIMIT_MS = 6000;

/**
 * Live-Gespräch: Ton läuft per WebRTC direkt zwischen Browser und Anbieter, unterbrechen geht jederzeit.
 * Der Pi vermittelt nur den Start und führt die Werkzeuge aus, er rechnet keinen Ton.
 */
export class RealtimeEngine implements VoiceEngine {
  readonly id = 'realtime';
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private meter: ReturnType<typeof setInterval> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private waitingNotice = false;
  private request = new AbortController();
  private stopped = false;
  private answered = false;
  private thinking = false;
  private thinkingSince = 0;
  private speaking = false;
  private hearing = false;
  private guess = false;
  private lastReply = 0;
  /** Letztes echtes Lebenszeichen des Gesprächs. Raumgeräusche am Mikrofon zählen nicht, sonst endet es nie. */
  private lastActivity = Date.now();
  private connected = false;
  private hasMicrophone = false;
  private microphoneEnabled = true;
  private outbox: string[] = [];
  private spoken = '';
  private liveId = '';
  constructor(private events: VoiceEvents, private options: VoiceEngineOptions) {}

  async start() {
    this.events.phase('connecting');
    this.connectionTimer = setTimeout(() => this.finish({ error: 'Der Verbindungsaufbau zur Stimme dauert zu lange. Bitte das Gespräch neu starten.' }), 30_000);
    this.watchdog = setInterval(() => {
      if (this.thinking && !this.waitingNotice && !this.guess && Date.now() - this.thinkingSince > THINKING_LIMIT_MS) {
        this.waitingNotice = true;
        this.events.notice('Die Antwort lässt noch auf sich warten. Ein Auftrag kann bereits ausgeführt sein; bitte vor dem Wiederholen im Kalender oder in der Liste nachsehen.');
      }
      if (Date.now() - this.lastActivity > IDLE_LIMIT_MS) this.finish(this.thinking
        ? { error: 'Es kam keine vollständige Antwort. Bitte das Gespräch neu starten und ausgeführte Änderungen vor dem Wiederholen prüfen.' } : {});
    }, 1000);
    // Ohne Mikrofon (HTTP-Adresse, Display ohne Hardware) läuft das Gespräch weiter: schreiben und hören.
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Sprechen geht nur über die HTTPS-Adresse. Schreiben und Hören funktionieren hier.');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(this.options.microphoneId ? { deviceId: { exact: this.options.microphoneId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      this.hasMicrophone = true;
      this.stream.getAudioTracks().forEach(track => { track.enabled = this.microphoneEnabled; });
    } catch (failure) { this.events.microphone(microphoneMessage(failure)); }
    if (this.stopped) { this.release(); return; }
    try {
      const pc = this.pc = new RTCPeerConnection();
      if (this.stream) this.stream.getTracks().forEach(track => pc.addTrack(track, this.stream!));
      else pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.createDataChannel('oai-events');
      this.audio = new Audio();
      this.audio.autoplay = true;
      if (this.options.speakerId) void routeToSpeaker(this.audio, this.options.speakerId).catch(() => this.events.notice('Der gewählte Lautsprecher ist nicht verfügbar. Die Stimme läuft über den Systemstandard.'));
      pc.ontrack = event => { if (this.audio) { this.audio.srcObject = event.streams[0]; void this.audio.play().catch(() => this.events.notice('Der Browser blockiert die Wiedergabe. Tippe auf „Ton aktivieren“.')); } this.watch(event.streams[0]); };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') this.finish({ error: 'Die Verbindung zur Stimme ist abgebrochen.', fallback: !this.answered });
        if (pc.connectionState === 'disconnected') {
          this.connected = false;
          this.events.notice('Die Audioverbindung ist unterbrochen. Ich warte auf die Wiederverbindung.');
          if (!this.disconnectTimer) this.disconnectTimer = setTimeout(() => this.finish({ error: 'Die Audioverbindung konnte nicht wiederhergestellt werden. Bitte das Gespräch neu starten.' }), 10_000);
        }
        if (pc.connectionState === 'connected') {
          if (this.connectionTimer) clearTimeout(this.connectionTimer);
          if (this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null; this.events.notice(''); }
          this.connected = true; this.flush(); this.settle();
        }
      };
      await pc.setLocalDescription(await pc.createOffer());
      await Promise.race([new Promise<void>(resolve => { if (pc.iceGatheringState === 'complete') resolve(); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') resolve(); }); }), new Promise(resolve => setTimeout(resolve, 1000))]);
      const response = await fetch('/api/family/voice/realtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription?.sdp, history: this.options.history ?? [] }), signal: this.request.signal });
      if (!response.ok) { const value = await response.json().catch(() => ({})); throw new Error(typeof value.error === 'string' ? value.error : 'Die Echtzeit-Stimme ist gerade nicht verfügbar.'); }
      await readEvents(response, event => this.handle(event));
      this.finish({ fallback: !this.answered, error: 'Die Verbindung zum Sprachdienst wurde beendet. Bitte das Gespräch neu starten.' });
    } catch (failure) {
      if (!this.stopped) this.finish({ error: failure instanceof Error ? failure.message : 'Die Echtzeit-Stimme ist gerade nicht verfügbar.', fallback: !this.answered });
    }
  }

  private async handle(event: Record<string, unknown>) {
    if (this.stopped) return;
    if (event.type === 'sdp' && this.pc) {
      this.liveId = String(event.session ?? '');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: String(event.sdp) });
      this.answered = true;
      this.flush();
      this.lastActivity = Date.now();
      this.settle();
    } else if (event.type === 'transcript') {
      this.lastActivity = Date.now();
      const role = event.role === 'user' ? 'user' : 'assistant';
      if (role === 'assistant') { this.spoken = ''; this.events.partial(''); this.thinking = false; }
      this.guess = false;
      if (role === 'user' && !this.hasMicrophone) return; // Getipptes steht schon im Verlauf.
      this.events.message({ role, text: String(event.text) });
      // Die Stimme fängt oft an, bevor die Frage als Text ankommt. Dann gibt es nichts mehr abzuwarten.
      if (role === 'user' && !this.speaking && !this.spoken && Date.now() - this.lastReply > 1500) this.startThinking();
      this.settle();
    } else if (event.type === 'partial') {
      this.lastActivity = Date.now();
      if (this.waitingNotice) { this.events.notice(''); this.waitingNotice = false; }
      this.thinking = false;
      // Text mitlaufen lassen, sonst steht er erst da, wenn der Satz schon gesprochen ist.
      this.spoken += String(event.text);
      this.events.partial(this.spoken.trimStart());
      this.settle();
    } else if (event.type === 'working') { this.lastActivity = Date.now(); this.guess = false; this.startThinking(); this.settle(); }
    else if (event.type === 'action') this.events.action(event.action as VoiceAction);
    else if (event.type === 'error') this.finish({ error: String(event.message), fallback: !this.answered });
    else if (event.type === 'notice') { this.thinking = false; this.events.notice(String(event.message)); this.settle(); }
    else if (event.type === 'closed') this.finish({ fallback: !this.answered, error: event.reason === 'replaced' ? 'Das Gespräch wurde auf einem anderen Gerät gestartet.' : 'Das Gespräch wurde vom Sprachdienst beendet. Du kannst es neu starten.' });
  }

  private startThinking() { this.thinking = true; this.thinkingSince = Date.now(); this.waitingNotice = false; }

  private flush() {
    if (!this.connected || !this.answered || !this.liveId || this.stopped) return;
    for (const text of this.outbox.splice(0)) void this.post(text);
  }

  /** Die Anzeige folgt immer dem aktuellen Zustand, nie dem letzten Ereignis. So kann sie nicht hängen bleiben. */
  private settle() {
    if (this.stopped) return;
    if (!this.connected) { this.events.phase('connecting'); return; }
    this.events.phase(this.speaking ? 'speaking' : this.hearing ? 'hearing' : this.thinking ? 'thinking' : this.hasMicrophone && this.microphoneEnabled ? 'listening' : 'idle');
  }

  setMicrophoneEnabled(enabled: boolean) {
    this.microphoneEnabled = enabled;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = enabled; });
    this.hearing = false;
    if (this.guess) { this.guess = false; this.thinking = false; }
    this.events.level(0); this.settle();
  }

  async resumeAudio() {
    if (!this.audio?.srcObject) throw new Error('Die Audioverbindung wird noch aufgebaut.');
    await Promise.all([this.audio.play(), this.context?.resume()]);
  }

  sendText(text: string) {
    this.lastActivity = Date.now();
    this.guess = false;
    this.startThinking();
    this.events.message({ role: 'user', text });
    this.settle();
    this.outbox.push(text);
    this.flush();
  }

  private async post(text: string) {
    try {
      const response = await fetch('/api/family/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'live-text', text, session: this.liveId }), signal: this.request.signal });
      if (!response.ok) throw new Error();
    } catch {
      if (this.stopped) return;
      this.thinking = false; this.events.notice('Das kam gerade nicht an. Versuch es noch einmal.'); this.settle(); }
  }

  /** Mikrofon- und Antwortpegel treiben Animation, Phase und das Ende bei langer Stille. Kein Ton verlässt diese Messung. */
  private watch(remote: MediaStream) {
    const context = this.context = new AudioContext();
    const meter = (stream: MediaStream) => { const analyser = context.createAnalyser(); analyser.fftSize = 1024; context.createMediaStreamSource(stream).connect(analyser); const data = new Float32Array(analyser.fftSize); return () => { analyser.getFloatTimeDomainData(data); let energy = 0; for (const sample of data) energy += sample * sample; return Math.sqrt(energy / data.length); }; };
    const mic = this.stream ? meter(this.stream) : () => 0, answer = meter(remote);
    let floor = 0.004, voiceStart = 0, lastVoice = 0;
    this.meter = setInterval(() => {
      const voice = this.microphoneEnabled ? mic() : 0, reply = answer(), now = Date.now();
      // Die Linie zeigt nur echte Stimme: Schwelle über dem Grundrauschen des Raums.
      const threshold = Math.max(SPEECH_LEVEL, floor * 3);
      if (voice > threshold) { lastVoice = now; voiceStart ||= now; }
      else { floor = floor * 0.97 + voice * 0.03; if (now - lastVoice > SILENCE_AFTER_MS) voiceStart = 0; }
      if (!this.hearing && voiceStart && now - voiceStart > HEARD_AFTER_MS) { this.hearing = true; this.lastActivity = now; this.settle(); }
      else if (this.hearing && now - lastVoice > SILENCE_AFTER_MS) {
        // Du bist fertig: sofort "ich denke nach" zeigen, die Frage als Text kommt gleich hinterher.
        this.hearing = false;
        if (!this.thinking) { this.guess = true; this.startThinking(); }
        this.settle();
      }
      if (this.guess && now - this.thinkingSince > NOISE_LIMIT_MS) { this.guess = false; this.thinking = false; this.settle(); }
      this.events.level(Math.min(1, (this.speaking ? reply : voice) * 7));
      if (reply > SPEECH_LEVEL) { this.lastReply = now; this.lastActivity = now; }
      if (reply > SPEECH_LEVEL && !this.speaking) { this.speaking = true; this.thinking = false; this.settle(); }
      else if (this.speaking && now - this.lastReply > 700) { this.speaking = false; this.settle(); }
    }, 80);
  }

  stop() { this.finish({}); }

  private finish(reason: { error?: string; fallback?: boolean }) {
    if (this.stopped) return;
    this.stopped = true;
    this.release();
    this.events.phase('idle');
    this.events.ended(reason);
  }

  private release() {
    this.request.abort();
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.meter) clearInterval(this.meter);
    this.stream?.getTracks().forEach(track => track.stop());
    this.pc?.close();
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
    void this.context?.close().catch(() => {});
    this.pc = null; this.stream = null; this.audio = null; this.context = null; this.meter = null;
  }
}
