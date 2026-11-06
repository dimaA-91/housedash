import { withAuth } from '@/lib/api-utils';
import { calendarFeedAccess, changeCalendarFeedAccess } from '@/lib/family-calendar-feed';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
export const GET = withAuth(async () => Response.json(await calendarFeedAccess(), { headers }), 'Kalenderfreigabe konnte nicht geladen werden.');
export const POST = withAuth(async request => {
  if (Number(request.headers.get('content-length') || 0) > 512) return Response.json({ error: 'Ungültige Freigabe-Aktion.' }, { status: 413, headers });
  const text = await request.text();
  if (text.length > 512) return Response.json({ error: 'Ungültige Freigabe-Aktion.' }, { status: 400, headers });
  let action: unknown;
  try { action = JSON.parse(text).action; } catch { /* validated below */ }
  if (!['enable', 'rotate', 'disable'].includes(action as string)) return Response.json({ error: 'Ungültige Freigabe-Aktion.' }, { status: 400, headers });
  return Response.json(await changeCalendarFeedAccess(action), { headers });
}, 'Kalenderfreigabe konnte nicht gespeichert werden.');
