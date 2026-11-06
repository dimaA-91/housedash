import { withAuth } from '@/lib/api-utils';
import { LayoutError, readFamilyLayout, writeFamilyLayout } from '@/lib/family-layout';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => Response.json(await readFamilyLayout(), { headers: { 'Cache-Control': 'no-store' } }), 'Anordnung konnte nicht geladen werden.');
export const PUT = withAuth(async (request) => {
  const body = await request.text();
  if (body.length > 2048) return Response.json({ error: 'Anordnung zu groß.' }, { status: 413 });
  try {
    return Response.json(await writeFamilyLayout(JSON.parse(body)));
  } catch (error) {
    if (error instanceof LayoutError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Ungültiges JSON.' }, { status: 400 });
    throw error;
  }
}, 'Anordnung konnte nicht gespeichert werden.');
