# Calendars

## Own events

Stored in `family-calendar.json` (schema 2). Events name people by id; renaming a person keeps the assignment.
Recurring events (daily, weekly, every two weeks, monthly, yearly) with exceptions; birthdays come from the family.
Tapping an event opens a read-only detail card with notes and an *edit* button.

## Apple → HouseDash (read only)

On the iPhone: *Calendar → Calendars → ⓘ next to the iCloud calendar → Public Calendar → Share Link*. Paste this
`webcal://…icloud.com/published/…` link under *Mehr → Apple Kalender*. Anyone with the link can read that calendar;
no Apple password is needed.

`src/lib/ical-calendar.ts` handles time zones, all-day events, recurrence expansion (EXDATE, overrides),
ETag/Last-Modified caching, SSRF and redirect checks and size/time limits. Only public HTTPS iCloud targets are
accepted. Sources live in `config.json` under `settings.calendar.icalSources`; the API never returns the share URLs.
Visible browsers refresh about every five minutes. The last successful download is cached in memory only, so after a
restart without internet Apple events reappear once they are fetched again; own events always work offline.

## HouseDash → iPhone (home network only)

*Mehr → Apple Kalender → Abo-Link kopieren* gives a protected feed `/api/family/calendar/feed.ics?token=…`, to add
in Apple Calendar under *Add Calendar → Add Subscription Calendar*.

- The token is random (256 bit), stored as `family_calendar_feed_token` in `secrets.json` and never changes unless you
  renew or end the subscription (in *advanced settings*, with a second confirmation).
- Only private client addresses are accepted (from the stamped header, not `X-Forwarded-For`).
- The feed contains own events and family birthdays (35 days back, 365 days ahead, at most 15,000 events), not Apple
  feeds, bins or transit. UTC times, exclusive all-day ends, stable UIDs/SEQUENCE, RFC 5545 line folding, ETag/304.
- New links use `HOUSEDASH_CALENDAR_BASE_URL` (default `http://<hostname>.local:3000`), so a changed DHCP address
  does not break them.

Restoring a backup can bring back an older token; renew the link afterwards if needed.

## Automatic icons

Event titles get an icon from 228 rules with 1,388 German terms and spellings (170 local Font Awesome SVG paths).
The title wins over the category; specific activities win over general ones. Rules: `src/lib/calendar-icon-rules.ts`,
matching: `src/lib/calendar-icon-mapping.ts`. After changing rules run `node scripts/generate-calendar-icons.mjs`,
which also regenerates the German reference list [CALENDAR-ICON-MATRIX.md](CALENDAR-ICON-MATRIX.md).

Sources: [Apple: share calendars](https://support.apple.com/guide/iphone/iph7613c4fb/ios),
[Apple: subscribe](https://support.apple.com/102301), [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html).
