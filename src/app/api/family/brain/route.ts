import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { addBrainItem, answerBrainSuggestion, brainOverview, BrainError, clearBrain, removeBrainItem, setBrainEnabled } from '@/lib/family-brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export const GET = withAuth(async () => Response.json(await brainOverview(), { headers }), 'Family Brain konnte nicht geladen werden.');
export const POST = withAuth(async request => {
  const body = await parseJsonBody<Record<string, unknown>>(request, { maxBytes: 2000 });
  if (body instanceof Response) return body;
  try {
    if (body.action === 'add') await addBrainItem({ text: body.text, person: body.person, weekday: body.weekday });
    else if (body.action === 'remove' && typeof body.id === 'string') await removeBrainItem(body.id);
    else if (body.action === 'answer' && typeof body.key === 'string') await answerBrainSuggestion(body.key, body.accept === true);
    else if (body.action === 'enabled') await setBrainEnabled(body.enabled === true);
    else if (body.action === 'clear') await clearBrain();
    else throw new BrainError('Unbekannte Aktion.');
    return Response.json(await brainOverview(), { headers });
  } catch (error) {
    if (error instanceof BrainError) return Response.json({ error: error.message }, { status: 400, headers });
    throw error;
  }
}, 'Family Brain konnte nicht gespeichert werden.');
