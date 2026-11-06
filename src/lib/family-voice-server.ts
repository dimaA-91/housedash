import 'server-only';
import http from 'node:http';
import { StringDecoder } from 'node:string_decoder';
import { VOICE_UNAVAILABLE, type VoiceState } from './family-voice-shared';
export const VOICE_SOCKET = process.env.HOUSEDASH_VOICE_SOCKET || '/run/housedash-voice/bridge.sock';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';
export { FeatureError as VoiceError } from '@/features/shared/server/errors';
export async function voiceRequest(path: '/state' | '/command' | '/tool-result', body?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const value = body ? JSON.stringify(body) : undefined;
    const request = http.request({ socketPath: VOICE_SOCKET, path, signal, method: value ? 'POST' : 'GET',
      headers: value ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(value) } : {} }, response => {
      const chunks: Buffer[] = []; let length = 0;
      response.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > 512_000) { response.destroy(); reject(new VoiceError('Antwort des Sprachdienstes zu groß.', 502)); return; }
        chunks.push(chunk);
      });
      response.on('error', () => { clearTimeout(timer); reject(new VoiceError('Die Verbindung zum Sprachdienst wurde unterbrochen.', 503)); });
      response.on('end', () => {
        clearTimeout(timer);
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (response.statusCode !== 200) reject(new VoiceError(typeof result.error === 'string' ? result.error : 'Sprachaktion fehlgeschlagen.', response.statusCode || 502));
          else resolve(result);
        } catch { reject(new VoiceError('Ungültige Antwort des Sprachdienstes.', 502)); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('timeout')), 25_000);
    request.on('error', () => { clearTimeout(timer); reject(new VoiceError('Der lokale Sprachdienst ist gerade nicht erreichbar.', 503)); });
    request.end(value);
  });
}
export interface VoiceStreamHandlers {
  /** Runs a tool on the server. The browser only ever sees the events below. */
  tool: (name: string, args: unknown) => Promise<unknown>;
  event: (event: Record<string, unknown>) => void;
}
/**
 * Provider session as an NDJSON stream. Tools run concurrently, so transcripts keep flowing while one is busy.
 * Aborting the signal ends the session on the provider side too.
 */
export async function voiceStream(path: '/chat' | '/realtime', body: Record<string, unknown>, handlers: VoiceStreamHandlers, signal: AbortSignal): Promise<void> {
  const { randomUUID } = await import('node:crypto');
  const token = randomUUID();
  const value = JSON.stringify({ ...body, token });
  const request = http.request({ socketPath: VOICE_SOCKET, path, method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(value) } });
  const response = await new Promise<http.IncomingMessage>((resolve, reject) => { request.once('response', resolve); request.once('error', () => reject(new VoiceError('Der Sprachdienst ist gerade nicht erreichbar.', 503))); request.end(value); });
  let buffer = '';
  const decoder = new StringDecoder('utf8');
  const executions = new Map<string, { signature: string; result: Promise<{ result: unknown; success: boolean }> }>();
  const runTool = async (event: { id: string; name: string; arguments: unknown }) => {
    const key = String(event.id), signature = JSON.stringify([event.name, event.arguments]);
    let execution = executions.get(key);
    if (execution && execution.signature !== signature || !execution && executions.size >= 100) {
      await voiceRequest('/tool-result', { token, id: event.id, result: { error: 'Ungültiger oder zu oft wiederholter Funktionsaufruf. Bitte im Kalender prüfen und nicht automatisch wiederholen.' }, success: false }, signal).catch(() => {}); return;
    }
    if (!execution) {
      const result = (async () => {
        try { signal.throwIfAborted(); return { result: await handlers.tool(event.name, event.arguments), success: true }; }
        catch (error) { return { result: { available: false, error: error instanceof VoiceError || error instanceof Error && error.name === 'CalendarError' ? error.message : 'Diese Datenquelle ist gerade nicht erreichbar. Keine Werte oder Erfolge erfinden.' }, success: false }; }
      })();
      execution = { signature, result }; executions.set(key, execution);
    }
    await voiceRequest('/tool-result', { token, id: event.id, ...await execution.result }, signal).catch(() => {});
  };
  try {
    for await (const bytes of response) {
      buffer += decoder.write(bytes);
      if (buffer.length > 2_000_000) throw new VoiceError('Dialogantwort ist zu groß.', 502);
      if (response.statusCode !== 200) continue;
      let lineEnd: number;
      while ((lineEnd = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, lineEnd); buffer = buffer.slice(lineEnd + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'heartbeat') continue;
        if (event.type === 'tool') { void runTool(event); continue; }
        handlers.event(event);
        if (event.type === 'result' || event.type === 'error' || event.type === 'closed') return;
      }
    }
    if (response.statusCode !== 200) { let error; try { error = JSON.parse(buffer).error; } catch { /* generic below */ } throw new VoiceError(typeof error === 'string' ? error : 'Der KI-Dialog ist gerade nicht verfügbar.', response.statusCode || 502); }
  } finally { response.destroy(); request.destroy(); }
}
export async function readVoiceState(signal?: AbortSignal): Promise<VoiceState> {
  try { return await voiceRequest('/state', undefined, signal) as VoiceState; }
  catch { return VOICE_UNAVAILABLE; }
}
/** Bounded in-memory audio transfer; raw microphone audio goes only to the local recognizer. */
export async function voiceBinaryRequest(path: '/transcribe' | '/speech', body: Buffer, contentType: string, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath: VOICE_SOCKET, path, method: 'POST', signal,
      headers: { 'Content-Type': contentType, 'Content-Length': body.length } }, response => {
      const chunks: Buffer[] = []; let length = 0;
      response.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > 5_000_000) { response.destroy(); reject(new VoiceError('Audioantwort ist zu groß.', 502)); return; }
        chunks.push(chunk);
      });
      response.on('error', () => { clearTimeout(timer); reject(new VoiceError('Audio-Verbindung unterbrochen.', 503)); });
      response.on('end', () => {
        clearTimeout(timer);
        const result = Buffer.concat(chunks);
        if (response.statusCode !== 200) {
          let message = 'Audio konnte nicht verarbeitet werden.';
          try { const error = JSON.parse(result.toString()); if (typeof error.error === 'string') message = error.error; } catch { /* bounded generic error */ }
          reject(new VoiceError(message, response.statusCode || 502));
        } else resolve(result);
      });
    });
    const timer = setTimeout(() => request.destroy(), 40_000);
    request.on('error', () => { clearTimeout(timer); reject(new VoiceError('Der lokale Sprachdienst ist gerade nicht erreichbar.', 503)); });
    request.end(body);
  });
}
