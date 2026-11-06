import { withAuth } from '@/lib/api-utils';
import { readTransit, TransitError } from '@/lib/family-transit';

export const dynamic = 'force-dynamic';
/** `?dir=back` für die Rückrichtung, sonst Hinrichtung. */
export const GET = withAuth(async (request) => {
  const params = new URL(request.url).searchParams;
  const direction = params.get('dir') === 'back' ? 'back' : 'forth';
  try { return Response.json(await readTransit(direction, { at: params.get('at') || undefined, arriveBy: params.get('arriveBy') === 'true' }), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { if (error instanceof TransitError) return Response.json({ error: error.message }, { status: 400 }); throw error; }
}, 'Abfahrten konnten nicht geladen werden.');
