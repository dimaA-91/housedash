import { withAuth } from '@/lib/api-utils';
import { WasteError, importFamilyWaste, readFamilyWaste } from '@/lib/family-waste';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => Response.json(await readFamilyWaste(), { headers: { 'Cache-Control': 'no-store' } }), 'Abfallkalender konnte nicht geladen werden.');
/** Body: `{ "ics": "<Dateiinhalt>" }`. */
export const PUT = withAuth(async (request) => {
  const body = await request.text();
  if (body.length > 700_000) return Response.json({ error: 'Die Datei ist zu groß.' }, { status: 413 });
  try {
    return Response.json(await importFamilyWaste((JSON.parse(body) as { ics?: unknown }).ics));
  } catch (error) {
    if (error instanceof WasteError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Ungültiges JSON.' }, { status: 400 });
    throw error;
  }
}, 'Abfallkalender konnte nicht gespeichert werden.');
