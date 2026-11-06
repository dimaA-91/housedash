import { withAuth } from '@/lib/api-utils';
import { searchStops } from '@/lib/family-transit';

export const dynamic = 'force-dynamic';
/** `?q=Rathaus` sucht Haltestellen (Tram und Bus). */
export const GET = withAuth(async (request) => {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return Response.json({ stops: await searchStops(query) }, { headers: { 'Cache-Control': 'no-store' } });
}, 'Haltestellen konnten nicht gesucht werden.');
