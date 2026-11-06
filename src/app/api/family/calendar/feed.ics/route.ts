import type { NextRequest } from 'next/server';
import { getClientIP } from '@/lib/api-utils';
import { isIpAllowed, normalizeIp } from '@/lib/ip-allowlist';
import { familyCalendarICS, hasCalendarFeedAccess } from '@/lib/family-calendar-feed';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resource auth: private, revocable subscription token, even when app auth is off.
 * No session cookie: Apple's calendar client cannot use the browser session. */
export async function GET(request: NextRequest) {
  const ip = normalizeIp(getClientIP(request));
  const lan = isIpAllowed(ip, ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'])
    || ip === '::1' || /^(?:fc|fd)[0-9a-f]{2}:|^fe[89ab][0-9a-f]:/i.test(ip);
  const headers = { 'Cache-Control': 'private, no-cache', 'Referrer-Policy': 'no-referrer' };
  if (!lan || !await hasCalendarFeedAccess(request.nextUrl.searchParams.get('token')))
    return new Response('Kalender-Abonnement nicht freigegeben.', { status: 403, headers });
  try {
    const feed = await familyCalendarICS();
    if (request.headers.get('if-none-match') === feed.etag) return new Response(null, { status: 304, headers: { ...headers, ETag: feed.etag } });
    return new Response(feed.body, { headers: { ...headers, ETag: feed.etag, 'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="HouseDash.ics"', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('HouseDash-Kalender gerade nicht verfügbar. Bitte später erneut versuchen.', { status: 503, headers });
  }
}
