import { withAuth } from '@/lib/api-utils';
import { AppleCalendarError, changeAppleCalendars, readAppleCalendars } from '@/lib/family-apple-calendar';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export const GET = withAuth(async request => {
  try {
    const url = new URL(request.url);
    return Response.json(await readAppleCalendars(url.searchParams.get('from'), url.searchParams.get('to')), { headers });
  } catch (error) {
    if (error instanceof AppleCalendarError) return Response.json({ error: error.message }, { status: error.status, headers });
    throw error;
  }
}, 'Apple Kalender konnte nicht geladen werden.');
const mutate = withAuth(async request => {
  if (Number(request.headers.get('content-length') || 0) > 8192) return Response.json({ error: 'Kalendereingabe zu groß.' }, { status: 413, headers });
  try {
    const body = await request.text();
    if (body.length > 8192) return Response.json({ error: 'Kalendereingabe zu groß.' }, { status: 413, headers });
    return Response.json(await changeAppleCalendars(request.method, JSON.parse(body)), { headers });
  } catch (error) {
    if (error instanceof AppleCalendarError) return Response.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof SyntaxError) return Response.json({ error: 'Ungültige Kalendereingabe.' }, { status: 400, headers });
    throw error;
  }
}, 'Apple Kalender konnte nicht gespeichert werden.');
export const POST = mutate;
export const DELETE = mutate;
