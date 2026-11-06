import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { featureCatalog, executeFeatureOperation } from '@/features/shared/server/registry';
import { intelligenceOwner } from '@/features/shared/server/actions';
import { FeatureError } from '@/features/shared/server/errors';
import type { VoiceAction } from '@/lib/family-voice-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Discoverable, authenticated API for UI clients; uses the same operations as AI tools. */
export const GET = withAuth(async () => Response.json({ operations: featureCatalog }, { headers: { 'Cache-Control': 'no-store' } }), 'Funktionen konnten nicht geladen werden.');
export const POST = withAuth(async request => {
  const body = await parseJsonBody<{ operation?: unknown; args?: unknown }>(request, { maxBytes: 24000 });
  if (body instanceof Response) return body;
  try {
    if (typeof body.operation !== 'string') throw new FeatureError('Bitte eine Funktion auswählen.');
    const actions: VoiceAction[] = [];
    const result = await executeFeatureOperation(body.operation, body.args ?? {}, { owner: intelligenceOwner(request), actions, signal: request.signal });
    return Response.json({ result, actions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof FeatureError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}, 'Die Funktion konnte nicht ausgeführt werden.');
