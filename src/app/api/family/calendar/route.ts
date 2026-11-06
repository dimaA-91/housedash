import { withAuth } from '@/lib/api-utils';
import { CalendarError, changeFamilyCalendar, readFamilyCalendar } from '@/lib/family-calendar';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => Response.json(await readFamilyCalendar(), { headers: { 'Cache-Control': 'no-store' } }), 'Kalender konnte nicht geladen werden.');
const mutate = withAuth(async (request) => {
  if (Number(request.headers.get('content-length') || 0) > 16384) return Response.json({ error: 'Termin zu groß.' }, { status: 413 });
  try {
    const body = await request.text();
    if (body.length > 16384) return Response.json({ error: 'Termin zu groß.' }, { status: 413 });
    return Response.json(await changeFamilyCalendar(request.method, JSON.parse(body)));
  } catch (error) {
    if (error instanceof CalendarError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: 'Ungültiges JSON.' }, { status: 400 });
    throw error;
  }
}, 'Kalender konnte nicht gespeichert werden.');
export const POST = mutate;
export const PUT = mutate;
export const DELETE = mutate;
