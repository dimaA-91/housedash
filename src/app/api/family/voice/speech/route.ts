import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { voiceBinaryRequest, VoiceError } from '@/lib/family-voice-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = withAuth(async request => {
  const body = await parseJsonBody<{ text: unknown }>(request, { maxBytes: 4096 });
  if (body instanceof Response) return body;
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 600) return Response.json({ error: 'Ungültige Sprachantwort.' }, { status: 400 });
  try {
    const result = await voiceBinaryRequest('/speech', Buffer.from(JSON.stringify({ text: body.text })), 'application/json', request.signal);
    return new Response(new Uint8Array(result), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof VoiceError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}, 'Sprachantwort konnte nicht erzeugt werden.');
