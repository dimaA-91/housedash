import { withAuth } from '@/lib/api-utils';
import { queryStopBoard } from '@/features/transit/server/queries';
import { FeatureError } from '@/features/shared/server/errors';
export const dynamic = 'force-dynamic';
export const GET = withAuth(async request => {
  const params = new URL(request.url).searchParams;
  try { return Response.json(await queryStopBoard({ stopId: params.get('stopId'), at: params.get('at'), arrivals: params.get('arrivals') === 'true', line: params.get('line'), mode: params.get('mode') }), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { if (error instanceof FeatureError) return Response.json({ error: error.message }, { status: error.status }); throw error; }
}, 'Abfahrtstafel konnte nicht geladen werden.');
