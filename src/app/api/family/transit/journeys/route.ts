import { withAuth } from '@/lib/api-utils';
import { queryJourney } from '@/features/transit/server/queries';
import { FeatureError } from '@/features/shared/server/errors';
export const dynamic = 'force-dynamic';
export const GET = withAuth(async request => {
  const params = new URL(request.url).searchParams;
  try { return Response.json(await queryJourney({ fromId: params.get('fromId'), toId: params.get('toId'), at: params.get('at'), arriveBy: params.get('arriveBy') === 'true' }), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { if (error instanceof FeatureError) return Response.json({ error: error.message }, { status: error.status }); throw error; }
}, 'Verbindungen konnten nicht geladen werden.');
