import 'server-only';
import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import { PHONE_UNAVAILABLE, type PhoneState } from '@/lib/family-phone-shared';

const SOCKET = process.env.HOUSEDASH_PHONE_SOCKET || '/run/housedash-phone/bridge.sock';
const CONTROL_SOCKET = process.env.HOUSEDASH_PHONE_CONTROL_SOCKET || '/run/housedash-phone/control.sock';

/** The bridge is a local Unix socket. No host network or public phone-control port. */
function bridge(path: '/state' | '/command' | '/events' | '/restart', body?: string, signal?: AbortSignal, socketPath = SOCKET): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path, method: body ? 'POST' : 'GET', signal,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
    }, response => { clearTimeout(timer); resolve(response); });
    const timer = setTimeout(() => request.destroy(new Error('Telefon-Dienst antwortet nicht.')), 15_000);
    request.on('error', error => { clearTimeout(timer); reject(error); });
    request.end(body);
  });
}

async function json(response: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  const timer = setTimeout(() => response.destroy(new Error('Telefon-Antwort zu langsam.')), 15_000);
  try {
    for await (const chunk of response) {
      length += chunk.length;
      if (length > 256_000) { response.destroy(); throw new Error('Telefon-Antwort zu groß.'); }
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}

export async function readPhoneState(signal?: AbortSignal): Promise<PhoneState> {
  try {
    const response = await bridge('/state', undefined, signal);
    if (response.statusCode !== 200) { response.resume(); return PHONE_UNAVAILABLE; }
    return await json(response) as PhoneState;
  } catch { return PHONE_UNAVAILABLE; }
}

export async function phoneCommand(body: string, signal: AbortSignal): Promise<Response> {
  try {
    const response = await bridge('/command', body, signal);
    return Response.json(await json(response), { status: response.statusCode ?? 502, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Der Telefon-Dienst ist nicht erreichbar. Bitte kurz warten und erneut versuchen.' }, { status: 503 });
  }
}

export async function restartPhoneService(signal: AbortSignal): Promise<Response> {
  try {
    const response = await bridge('/restart', '{}', signal, CONTROL_SOCKET);
    return Response.json(await json(response), { status: response.statusCode ?? 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Die lokale Start-Steuerung ist nicht erreichbar. Einrichtung am Pi erforderlich.' }, { status: 503 });
  }
}

export async function phoneStream(signal: AbortSignal, socketPath = SOCKET, label = 'Telefon-Dienst'): Promise<Response> {
  let response: IncomingMessage;
  try { response = await bridge('/events', undefined, signal, socketPath); }
  catch { return new Response(`${label} nicht erreichbar.`, { status: 503 }); }
  if (response.statusCode !== 200) { response.resume(); return new Response(`${label} nicht erreichbar.`, { status: 503 }); }
  let closed = false;
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const done = () => {
        if (closed) return;
        closed = true; cleanup(); response.destroy(); controller.close();
      };
      cleanup = () => signal.removeEventListener('abort', done);
      response.on('data', (chunk: Buffer) => {
        if (closed) return;
        controller.enqueue(new Uint8Array(chunk));
        if ((controller.desiredSize ?? 1) <= 0) response.pause();
      });
      response.on('end', done);
      response.on('error', done);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) done();
    },
    pull() { response.resume(); },
    cancel() { closed = true; cleanup(); response.destroy(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}

/** Mikrofon des Browsers (PCM, 48 kHz, mono, 16 Bit) an den Telefon-Dienst geben. Kleine Stücke, ohne Antwortkörper. */
export async function phoneAudioIn(body: Buffer, signal: AbortSignal): Promise<Response> {
  if (body.length === 0 || body.length > 16_384) return new Response(null, { status: 413 });
  return new Promise<Response>(resolve => {
    const request = http.request({ socketPath: SOCKET, path: '/audio/in', method: 'POST', signal,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length },
    }, response => { response.resume(); resolve(new Response(null, { status: response.statusCode === 204 ? 204 : 502 })); });
    request.setTimeout(5_000, () => request.destroy());
    request.on('error', () => resolve(new Response(null, { status: 503 })));
    request.end(body);
  });
}

/** Stimme des Gegenübers als Dauerstrom roher PCM-Daten an den Browser. */
export async function phoneAudioOut(signal: AbortSignal): Promise<Response> {
  const response = await new Promise<IncomingMessage | null>(resolve => {
    const request = http.request({ socketPath: SOCKET, path: '/audio/out', method: 'GET', signal }, resolve);
    request.on('error', () => resolve(null));
    request.end();
  });
  if (!response || response.statusCode !== 200) { response?.resume(); return new Response('Ton nicht verfügbar.', { status: response?.statusCode === 503 ? 409 : 503 }); }
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const done = () => { if (closed) return; closed = true; response.destroy(); try { controller.close(); } catch { /* already closed */ } };
      response.on('data', (chunk: Buffer) => { if (!closed) controller.enqueue(new Uint8Array(chunk)); });
      response.on('end', done);
      response.on('error', done);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) done();
    },
    cancel() { closed = true; response.destroy(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
