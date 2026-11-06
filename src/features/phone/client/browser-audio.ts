import { routeToSpeaker } from '@/app/family/client-audio';
import { readSpeakerPreference, readVoiceDevicePreference } from '@/app/family/useVoiceDevices';
/**
 * Telefon-Ton im Browser: Mikrofon und Lautsprecher des Geräts, mit dem man telefoniert (Handy, iPad).
 * Der Pi hält nur die Telegram-Verbindung. Roher Ton läuft als PCM (48 kHz, mono, 16 Bit):
 *  - Mikrofon: kleine Stücke per POST an /api/family/phone/audio
 *  - Stimme des Gegenübers: Dauerstrom per GET von /api/family/phone/audio
 * Kein Anruf wird aufgezeichnet oder gespeichert.
 */
const RATE = 48000;
const CHUNK_SAMPLES = 1920; // 40 ms
const JITTER = 0.09; // Sekunden Vorlauf, damit kleine Verzögerungen im Netz nicht knacken
const MAX_LATENCY = 0.6; // älterer Ton wird verworfen, damit das Gespräch nie hinterherläuft
const ENDPOINT = '/api/family/phone/audio';

/** Das Display am Pi (127.0.0.1) nutzt weiter den Ton am Pi. Jedes andere Gerät telefoniert über seinen eigenen Browser. */
export function isPiDisplay() {
  if (typeof location === 'undefined') return false;
  // Zum Ausprobieren am Pi selbst: localStorage "housedash-phone-audio" = "browser" erzwingt den Ton im Browser.
  try { if (localStorage.getItem('housedash-phone-audio') === 'browser') return false; } catch { /* Speicher gesperrt */ }
  return ['127.0.0.1', 'localhost', '::1'].includes(location.hostname);
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const length = Math.max(1, Math.round(input.length * to / from));
  const out = new Float32Array(length);
  const ratio = from / to;
  for (let i = 0; i < length; i++) {
    const position = i * ratio, index = Math.floor(position), next = Math.min(input.length - 1, index + 1), mix = position - index;
    out[i] = input[Math.min(input.length - 1, index)] * (1 - mix) + input[next] * mix;
  }
  return out;
}

export class BrowserCallAudio {
  /** Mit Mikrofon, wenn der Browser es erlaubt hat. Muss aus einem Tipp heraus aufgerufen werden (Berechtigung, Audio-Start). */
  static async prepare(): Promise<BrowserCallAudio> {
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let context: AudioContext;
    try { context = new Context({ sampleRate: RATE, latencyHint: 'interactive' }); } catch { context = new Context(); }
    await context.resume().catch(() => {});
    // Same devices as the AI voice: chosen once under Mehr, then Audio (stored per browser).
    const speakerId = readSpeakerPreference(), microphoneId = readVoiceDevicePreference();
    if (speakerId) await routeToSpeaker(context, speakerId).catch(() => { /* the system default keeps playing */ });
    let microphone: MediaStream | null = null;
    // getUserMedia gibt es nur über HTTPS (oder 127.0.0.1). Ohne Mikrofon läuft das Gespräch als "Nur zuhören".
    if (navigator.mediaDevices?.getUserMedia) {
      const constraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
      try {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: { ...constraints, ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}) } });
      } catch {
        // The chosen microphone may be unplugged: try the system default before giving up.
        try { microphone = microphoneId ? await navigator.mediaDevices.getUserMedia({ audio: constraints }) : null; } catch { microphone = null; }
      }
    }
    return new BrowserCallAudio(context, microphone);
  }

  private abort = new AbortController();
  private nodes: AudioNode[] = [];
  private queue = Promise.resolve();
  private backlog = 0;
  private pending = new Int16Array(0);
  private nextTime = 0;
  private started = false;
  private muted = false;

  private constructor(private readonly context: AudioContext, private readonly microphone: MediaStream | null) {}

  get hasMicrophone() { return this.microphone !== null; }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.microphone?.getAudioTracks().forEach(track => { track.enabled = !muted; });
  }

  start() {
    if (this.started) return;
    this.started = true;
    void this.context.resume().catch(() => {});
    this.startMicrophone();
    void this.playIncoming();
  }

  stop() {
    this.abort.abort();
    for (const node of this.nodes) { try { node.disconnect(); } catch { /* already disconnected */ } }
    this.nodes = [];
    this.microphone?.getTracks().forEach(track => track.stop());
    void this.context.close().catch(() => {});
  }

  private startMicrophone() {
    if (!this.microphone) return;
    const source = this.context.createMediaStreamSource(this.microphone);
    // ScriptProcessor ist veraltet, läuft aber auf jedem Safari und Chrome und braucht keine zweite Datei.
    const processor = this.context.createScriptProcessor(2048, 1, 1);
    const silent = this.context.createGain();
    silent.gain.value = 0;
    processor.onaudioprocess = event => {
      if (this.muted) return;
      const input = event.inputBuffer.getChannelData(0);
      const samples = resample(new Float32Array(input), this.context.sampleRate, RATE);
      const merged = new Int16Array(this.pending.length + samples.length);
      merged.set(this.pending);
      for (let i = 0; i < samples.length; i++) merged[this.pending.length + i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
      let offset = 0;
      while (merged.length - offset >= CHUNK_SAMPLES) { this.send(merged.slice(offset, offset + CHUNK_SAMPLES)); offset += CHUNK_SAMPLES; }
      this.pending = merged.slice(offset);
    };
    source.connect(processor);
    processor.connect(silent);
    silent.connect(this.context.destination);
    this.nodes.push(source, processor, silent);
  }

  /** Stücke gehen nacheinander raus, damit die Reihenfolge stimmt. Staut es sich, werden die ältesten verworfen. */
  private send(samples: Int16Array) {
    if (this.backlog >= 8) return;
    this.backlog += 1;
    const body = samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength) as ArrayBuffer;
    this.queue = this.queue.then(() => fetch(ENDPOINT, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' }, signal: this.abort.signal, keepalive: false })
      .then(() => undefined, () => undefined))
      .finally(() => { this.backlog -= 1; });
  }

  private async playIncoming() {
    while (!this.abort.signal.aborted) {
      try {
        const response = await fetch(ENDPOINT, { signal: this.abort.signal, cache: 'no-store' });
        if (!response.ok || !response.body) throw new Error('kein Ton');
        const reader = response.body.getReader();
        let leftover = new Uint8Array(0);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.length) continue;
          const bytes = new Uint8Array(leftover.length + value.length);
          bytes.set(leftover); bytes.set(value, leftover.length);
          const usable = bytes.length - (bytes.length % 2);
          leftover = bytes.slice(usable);
          if (usable) this.play(new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usable)));
        }
      } catch {
        if (this.abort.signal.aborted) return;
      }
      // Verbindung zum Pi kurz weg oder noch nicht bereit: gleich noch einmal.
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  }

  private play(pcm: Int16Array) {
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 32768;
    const samples = resample(floats, RATE, this.context.sampleRate);
    const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const now = this.context.currentTime;
    if (this.nextTime < now + 0.02) this.nextTime = now + JITTER;
    if (this.nextTime - now > MAX_LATENCY) return;
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.connect(this.context.destination);
    node.start(this.nextTime);
    this.nextTime += buffer.duration;
  }
}
