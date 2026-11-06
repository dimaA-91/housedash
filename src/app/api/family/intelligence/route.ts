import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { intelligenceTools, executeIntelligenceTool, intelligenceOwner, confirmIntelligenceAction } from '@/lib/family-intelligence';
import { VoiceError } from '@/lib/family-voice-server';
import type { VoiceAction } from '@/lib/family-voice-shared';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => Response.json({ tools: intelligenceTools }, { headers: { 'Cache-Control': 'no-store' } }), 'Funktionen konnten nicht geladen werden.');
export const POST = withAuth(async request => {
  const body = await parseJsonBody<Record<string, unknown>>(request, { maxBytes: 8000 }); if (body instanceof Response) return body;
  try {
    if (body.action === 'confirm' && typeof body.id === 'string') return Response.json(await confirmIntelligenceAction(request, body.id));
    if (typeof body.tool !== 'string') throw new VoiceError('Bitte eine gültige Funktion angeben.');
    const actions: VoiceAction[] = [];
    const result = await executeIntelligenceTool(body.tool, body.args || {}, { owner: intelligenceOwner(request), actions, signal: request.signal });
    return Response.json({ result, actions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { if (error instanceof VoiceError) return Response.json({ error: error.message }, { status: error.status }); throw error; }
}, 'HouseDash-Aktion konnte nicht ausgeführt werden.');
