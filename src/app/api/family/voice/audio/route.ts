import { withAuth } from '@/lib/api-utils';
import { voiceBinaryRequest, VoiceError } from '@/lib/family-voice-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = withAuth(async request => {
  if (request.headers.get('content-type')?.split(';')[0] !== 'audio/wav') return Response.json({ error: 'WAV-Sprachaufnahme erforderlich.' }, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'Keine Aufnahme empfangen.' }, { status: 400 });
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 750000) { await reader.cancel(); return Response.json({ error: 'Aufnahme zu groß. Höchstens 20 Sekunden sprechen.' }, { status: 413 }); }
      chunks.push(value);
    }
    const result = await voiceBinaryRequest('/transcribe', Buffer.concat(chunks), 'audio/wav', request.signal);
    return new Response(new Uint8Array(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof VoiceError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  } finally { reader.releaseLock(); }
}, 'Sprachaufnahme konnte nicht verarbeitet werden.');
