import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSecret, updateSecretsAtomic } from './secrets';
import { readFamilyCalendar, type FamilyEvent } from './family-calendar';
import { readFamilyData, familyRevision } from './family-data';
import { readConfig } from './config';
import { withDataTransaction } from './data-transaction';
import { startsOn, dayOf } from './family-recurrence';
import { birthdayEvents, recurringBirthdayEvents, isBirthdayCategory } from './family-birthdays';
import { isoDateInTZ } from './timezone';

const KEY = 'family_calendar_feed_token';
export async function calendarFeedAccess() {
  const token = await getSecret(KEY);
  const configured = process.env.HOUSEDASH_CALENDAR_BASE_URL;
  let baseUrl: string | null = null;
  if (configured) {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Ungültige lokale Kalenderadresse.');
    baseUrl = url.origin;
  }
  return { enabled: !!token, token, baseUrl };
}
export async function changeCalendarFeedAccess(action: unknown) {
  if (!['enable', 'rotate', 'disable'].includes(action as string)) throw new Error('Ungültige Freigabe-Aktion.');
  await updateSecretsAtomic(current => {
    if (action === 'enable' && current[KEY]) return current;
    const next = { ...current };
    if (action === 'disable') delete next[KEY];
    else next[KEY] = randomBytes(32).toString('base64url');
    return next;
  });
  return calendarFeedAccess();
}
export async function hasCalendarFeedAccess(token: string | null) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expected = await getSecret(KEY);
  return !!expected && expected.length === token.length && timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const utc = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
function fold(line: string) {
  let out = '', bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 75) { out += '\r\n '; bytes = 1; }
    out += character; bytes += size;
  }
  return out;
}
let cached: { key: string; body: string; etag: string } | undefined;

/** Only local source events and local birthdays. No subscribed Apple events. */
export async function familyCalendarICS() {
  const { data, family, config } = await withDataTransaction(async () => ({
    data: await readFamilyCalendar(), family: await readFamilyData(), config: await readConfig(),
  }));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const timezone = config.settings.timezone || 'Europe/Berlin';
  const key = `${data.generation}:${data.revision}:${familyRevision(family)}:${dayOf(today)}:${timezone}`;
  if (cached?.key === key) return cached;
  const events = data.events.filter(event => !event.repeat && !isBirthdayCategory(event));
  events.push(...birthdayEvents(family.members, today.getFullYear()), ...recurringBirthdayEvents(data.events, today.getFullYear()));
  if (events.length > 15000) throw new Error('Zu viele Termine für das Kalender-Abonnement.');
  // Expand using the same local recurrence rules as HouseDash. This preserves
  // DST, skipped days, month-end clamping and February 29, unlike a naive RRULE.
  for (const event of data.events.filter(item => item.repeat && !isBirthdayCategory(item))) {
    const first = new Date(event.start), last = new Date(event.end);
    const span = Math.round((Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 86400000);
    for (let offset = -35; offset <= 365; offset++) {
      const day = new Date(today); day.setDate(day.getDate() + offset);
      if (!startsOn(first, event.repeat!, event.skip, day)) continue;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), first.getHours(), first.getMinutes());
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + span, last.getHours(), last.getMinutes());
      if (end <= start) continue;
      events.push({ ...event, id: `rep:${event.id}:${dayOf(day)}`, start: start.toISOString(), end: end.toISOString() });
      if (events.length > 15000) throw new Error('Zu viele Termine für das Kalender-Abonnement.');
    }
  }
  const stamp = utc(new Date().toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HouseDash//Familienkalender//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:HouseDash', `X-WR-TIMEZONE:${escape(timezone)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M'];
  const append = (event: FamilyEvent) => {
    const date = (value: string) => isoDateInTZ(new Date(value), timezone).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${createHash('sha256').update(event.id).digest('hex')}@housedash.local`, `DTSTAMP:${stamp}`,
      `SEQUENCE:${event.version}`, `SUMMARY:${escape(event.title)}`,
      event.allDay ? `DTSTART;VALUE=DATE:${date(event.start)}` : `DTSTART:${utc(event.start)}`,
      event.allDay ? `DTEND;VALUE=DATE:${date(event.end)}` : `DTEND:${utc(event.end)}`,
      `CATEGORIES:${escape(event.category)}`, `DESCRIPTION:${escape([event.member, event.notes].filter(Boolean).join('\n\n'))}`, 'END:VEVENT');
  };
  events.forEach(append);
  lines.push('END:VCALENDAR');
  const body = lines.map(fold).join('\r\n') + '\r\n';
  cached = { key, body, etag: `"${createHash('sha256').update(body).digest('hex')}"` };
  return cached;
}
