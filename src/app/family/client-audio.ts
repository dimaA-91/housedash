'use client';
let context: AudioContext | null = null;
let speech: AudioBufferSourceNode | null = null;
let speakerId = '';
/** Every microphone stream this browser opens is listed here, so the header can show when one is on. */
const openStreams = new Set<MediaStream>();
export function trackMicrophone(stream: MediaStream) {
  openStreams.add(stream);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('housedash-mic'));
}
export function microphoneOpen() {
  for (const stream of [...openStreams]) if (!stream.active) openStreams.delete(stream);
  return openStreams.size > 0;
}
type Sinkable = { setSinkId?: (id: string) => Promise<void> };
/** Route an audio element or context to an output device. '' is the system default. Rejects if the device is gone. */
export async function routeToSpeaker(target: unknown, id: string) {
  const sinkable = target as Sinkable;
  if (typeof sinkable.setSinkId === 'function') await sinkable.setSinkId(id);
}
/** Output device for the local voice. Applied to the shared context now and whenever it is created. */
export function setClientSpeaker(id: string) {
  speakerId = id;
  if (context) void routeToSpeaker(context, id).catch(() => { /* the system default keeps playing */ });
}
/** Short tone through the chosen output, so the speaker can be checked without starting a conversation. */
export async function playTestTone(id: string) {
  const test = new AudioContext();
  try {
    if (id) await routeToSpeaker(test, id);
    await test.resume();
    const tone = test.createOscillator(), gain = test.createGain(), start = test.currentTime;
    tone.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.25, start + 0.05); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
    tone.connect(gain); gain.connect(test.destination);
    await new Promise<void>(resolve => { tone.onended = () => resolve(); tone.start(start); tone.stop(start + 0.85); });
  } finally { void test.close().catch(() => {}); }
}
/** Called directly by a click: audio permission/activation belongs to this browser. */
export function prepareClientAudio(): AudioContext {
  if (!context) {
    context = new AudioContext();
    if (speakerId) void routeToSpeaker(context, speakerId).catch(() => { /* the system default keeps playing */ });
  }
  void context.resume().catch(() => {});
  return context;
}
export function stopClientSpeech() {
  try { speech?.stop(); } catch { /* already ended */ }
  speech = null;
}
export async function playClientSpeech(bytes: ArrayBuffer) {
  stopClientSpeech();
  const audio = prepareClientAudio();
  await Promise.race([audio.resume(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Audiofreigabe fehlt')), 3000))]);
  if (audio.state !== 'running') throw new Error('Audiofreigabe fehlt');
  const buffer = await audio.decodeAudioData(bytes);
  const source = audio.createBufferSource();
  source.buffer = buffer; source.connect(audio.destination); speech = source;
  await new Promise<void>(resolve => {
    source.onended = () => { source.disconnect(); if (speech === source) speech = null; resolve(); };
    source.start();
  });
}
function wav(chunks: Float32Array[], sourceRate: number) {
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  const count = Math.min(20 * 16000, Math.floor(total * 16000 / sourceRate));
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const ascii = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const position = i * sourceRate / 16000, left = Math.floor(position), fraction = position - left;
    const sample = (samples[left] || 0) * (1 - fraction) + (samples[Math.min(left + 1, total - 1)] || 0) * fraction;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
export interface ClientRecording { finish: () => Promise<Blob>; cancel: () => void }
export async function startClientRecording(deviceId: string, onLevel?: (level: number) => void): Promise<ClientRecording> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Mikrofonzugriff benötigt die lokale HTTPS-Adresse. Am Pi funktioniert auch localhost.');
  stopClientSpeech();
  const audio = prepareClientAudio();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  trackMicrophone(stream);
  let node: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let closed = false;
  const chunks: Float32Array[] = [];
  const cleanup = () => { closed = true; stream.getTracks().forEach(track => track.stop()); source?.disconnect(); node?.disconnect(); };
  try {
    await audio.audioWorklet.addModule('/voice/recorder-worklet.js');
    if (!stream.active) throw new Error('Das Mikrofon wurde getrennt.');
    source = audio.createMediaStreamSource(stream);
    node = new AudioWorkletNode(audio, 'family-recorder');
    node.port.onmessage = event => {
      if (!closed && event.data instanceof ArrayBuffer && chunks.length < Math.ceil(21 * audio.sampleRate / 4096)) {
        const data = new Float32Array(event.data); chunks.push(data);
        let energy = 0; for (const sample of data) energy += sample * sample;
        onLevel?.(Math.min(1, Math.sqrt(energy / data.length) * 7));
      }
    };
    source.connect(node); node.connect(audio.destination); // Worklet outputs silence, never a microphone monitor.
    return {
      cancel: () => { cleanup(); chunks.length = 0; },
      finish: async () => {
        if (closed || !node) throw new Error('Aufnahme wurde bereits beendet.');
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 250);
          const current = node!;
          const handler = (event: MessageEvent) => { if (event.data?.flushed) { clearTimeout(timer); current.port.removeEventListener('message', handler); resolve(); } };
          current.port.addEventListener('message', handler); current.port.postMessage('flush');
        });
        cleanup();
        const result = wav(chunks, audio.sampleRate); chunks.length = 0;
        return result;
      },
    };
  } catch (error) { cleanup(); throw error; }
}
