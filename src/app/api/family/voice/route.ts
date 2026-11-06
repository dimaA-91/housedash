import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { readVoiceState, voiceRequest, VoiceError } from '@/lib/family-voice-server';
import { voiceEventStream } from '@/lib/family-voice-session';
import type { VoiceMessage } from '@/lib/family-voice-shared';
import { validVoiceHistory } from '@/lib/family-voice-shared';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const ACTIONS = ['login', 'cancel-login', 'logout', 'refresh', 'model', 'voice-settings', 'preload', 'live-text', 'interpret'];
export const GET = withAuth(async request => Response.json(await readVoiceState(request.signal), { headers: { 'Cache-Control': 'no-store' } }), 'Sprachstatus konnte nicht geladen werden.');
export const POST = withAuth(async request => {
  const body = await parseJsonBody<Record<string, unknown>>(request, { maxBytes: 320000 });
  if (body instanceof Response) return body;
  try {
    const action = body.action;
    if (typeof action !== 'string' || !ACTIONS.includes(action)) throw new VoiceError('Unbekannte Sprachaktion.');
    if (action === 'interpret') {
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000) throw new VoiceError('Bitte einen Auftrag mit höchstens 2000 Zeichen eingeben.');
      const timezone = (await readConfig()).settings.timezone || 'Europe/Berlin';
      const history: VoiceMessage[] = [];
      if (body.history !== undefined) {
        if (!validVoiceHistory(body.history)) throw new VoiceError('Ungültiger Gesprächsverlauf.');
        for (const item of body.history) history.push({ role: item.role, text: item.text, ...(item.at ? { at: item.at } : {}) });
      }
      return voiceEventStream(request, '/chat', { text: body.text, history, dialog: typeof body.dialog === 'string' ? body.dialog.slice(0, 80) : '', now: new Date().toLocaleString('de-DE', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }), timezone });
    }
    const fields = action === 'model' ? { model: body.model } : action === 'voice-settings' ? { engine: body.engine, voice: body.voice } : action === 'live-text' ? { text: body.text, session: body.session } : {};
    return Response.json(await voiceRequest('/command', { action, ...fields }, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof VoiceError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}, 'Der Sprachauftrag konnte nicht verarbeitet werden.');
