/** Calendar time helpers: event strings read on the household's wall clock (time zone aware). */
import { isoDateInTZ, parseDateInTZ, toTZWallTime } from '@/lib/timezone';

/**
 * Parse an event date string, treating date-only strings ("2026-03-22") as
 * local midnight instead of UTC midnight (the JS default for date-only strings).
 *
 * Per the ECMAScript spec, `new Date("2026-03-22")` is parsed as UTC midnight,
 * which becomes the previous day in any timezone west of UTC. Appending
 * "T00:00:00" forces local-time interpretation instead.
 */
export function parseEventDate(dateStr: string): Date {
  if (!dateStr.includes('T')) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

// Explicit zone designator: trailing Z or ±HH:MM / ±HHMM offset.
const HAS_ZONE_INFO = /Z|[+-]\d{2}:?\d{2}$/;

/**
 * Parse an event date string into the display's wall time. Timed strings
 * with an explicit zone (all shipped producers emit RFC3339 offsets or UTC
 * ISO strings) are absolute instants, so their clock reading must come from
 * the configured display timezone, not the Pi's OS timezone — this returns
 * them shifted via `toTZWallTime` so `getHours()` etc. read display-local.
 * Date-only strings and zone-less timed strings are already wall times and
 * pass through `parseEventDate` unchanged, as does everything when no
 * timezone is configured.
 *
 * The shift is memoized on (string, timezone): grid views call this for every
 * (day cell, event) pair on every render, and `toTZWallTime` costs an ICU
 * `formatToParts` extraction per call — thousands per render on a Pi for a
 * busy month grid. Only the epoch is cached; each call returns a fresh Date
 * so callers can never alias through the cache.
 */
const WALL_TIME_CACHE = new Map<string, number>();
const WALL_TIME_CACHE_MAX = 4096;

export function parseEventWallTime(dateStr: string, timezone?: string): Date {
  // Cache lookup first — a hit must skip the parse and zone-regex work the
  // cache exists to amortize. Only shifted results are stored, so a
  // zone-less string simply misses and takes the passthrough below.
  const key = timezone ? `${dateStr}|${timezone}` : null;
  if (key) {
    const cached = WALL_TIME_CACHE.get(key);
    if (cached !== undefined) return new Date(cached);
  }
  const parsed = parseEventDate(dateStr);
  if (!key || !dateStr.includes('T') || !HAS_ZONE_INFO.test(dateStr.trim())) return parsed;
  const wall = toTZWallTime(parsed, timezone!);
  if (WALL_TIME_CACHE.size >= WALL_TIME_CACHE_MAX) WALL_TIME_CACHE.clear();
  WALL_TIME_CACHE.set(key, wall.getTime());
  return wall;
}

/**
 * The real instant an event bound names. Timed strings with a zone are
 * instants already. Date-only strings (all-day bounds) and zone-less timed
 * strings are wall times, so they are read in `timezone`: an all-day event
 * starts at the household's midnight. `parseEventDate` reads them in the
 * machine's zone instead, which on a Pi left at UTC ends a Chicago all-day
 * event at 7 pm the evening before, so anything that compares event bounds
 * with a real window or a real "now" goes through here.
 */
export function parseEventInstant(dateStr: string, timezone: string | undefined): Date {
  return parseDateInTZ(dateStr, timezone);
}

/**
 * The instant the household's day `offsetDays` after the one `now` falls on
 * begins. Steps whole calendar days rather than 24-hour spans, so a bound
 * stays on midnight across a daylight-saving change.
 */
export function householdDayStart(now: Date, offsetDays: number, timezone: string | undefined): Date {
  const [y, m, d] = isoDateInTZ(now, timezone).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
  return parseEventInstant(day, timezone);
}

/**
 * Compare two CalendarEvent start strings for sorting, on the household's
 * wall clock: timed starts are shifted into `timezone` so they share a clock
 * with all-day dates, which are wall dates already. Comparing a real instant
 * with a machine-midnight all-day date put tonight's 7:30 pm event after
 * tomorrow's birthday on a UTC Pi in Chicago. On a tie (an all-day row and a
 * midnight start) the all-day row goes first, as every list view shows it.
 */
export function compareEventStarts(aStart: string, bStart: string, timezone: string | undefined): number {
  const diff = parseEventWallTime(aStart, timezone).getTime() - parseEventWallTime(bStart, timezone).getTime();
  if (diff) return diff;
  const aAllDay = !aStart.includes('T');
  const bAllDay = !bStart.includes('T');
  return aAllDay === bAllDay ? 0 : aAllDay ? -1 : 1;
}
