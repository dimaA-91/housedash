import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { VoiceError } from '@/lib/family-voice-server';
import { voiceEventStream } from '@/lib/family-voice-session';
import { validVoiceHistory } from '@/lib/family-voice-shared';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Startet ein Live-Gespräch: Der Browser schickt sein WebRTC-Angebot und liest die Ereignisse, bis er die Anfrage abbricht. */
export const POST = withAuth(async request => {
  const body = await parseJsonBody<{ sdp: unknown; history?: unknown }>(request, { maxBytes: 320000 });
  if (body instanceof Response) return body;
  if (typeof body.sdp !== 'string' || body.sdp.length > 20000) throw new VoiceError('Ungültige Audio-Verbindung.');
  const history = body.history ?? [];
  if (!validVoiceHistory(history)) throw new VoiceError('Ungültiger Gesprächsverlauf.');
  return voiceEventStream(request, '/realtime', { sdp: body.sdp, history });
}, 'Das Live-Gespräch konnte nicht gestartet werden.');
