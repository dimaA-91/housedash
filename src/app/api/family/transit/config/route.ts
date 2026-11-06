import { withAuth } from '@/lib/api-utils';
import { TransitError, readTransitConfig, writeTransitConfig } from '@/lib/family-transit';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => Response.json(await readTransitConfig(), { headers: { 'Cache-Control': 'no-store' } }), 'Haltestellen konnten nicht geladen werden.');
export const PUT = withAuth(async (request) => {
  const body = await request.text();
  if (body.length > 2048) return Response.json({ error: 'Angaben zu groß.' }, { status: 413 });
  try {
    return Response.json(await writeTransitConfig(JSON.parse(body)));
  } catch (error) {
    if (error instanceof TransitError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Ungültiges JSON.' }, { status: 400 });
    throw error;
  }
}, 'Haltestellen konnten nicht gespeichert werden.');
