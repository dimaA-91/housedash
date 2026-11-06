import 'server-only';
import { readFamilyCalendar, changeFamilyCalendar, type FamilyEvent } from '@/features/calendar/server/service';
import { withDataTransaction } from '@/lib/data-transaction';
import { readConfig } from '@/lib/config';
import { isoDateInTZ, parseDateInTZ } from '@/lib/timezone';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';
import { text, optional, wall, toWallTime } from '@/features/shared/server/arguments';
import { done, prepare } from '@/features/shared/server/actions';
import { DEFAULT_COLOR, repeatFrom, eventTimes, spokenDate, ownEvent, savedEventRecord } from '@/features/calendar/server/arguments';
import { findMember } from '@/features/household/server/members';

import type { Args, Context } from '@/features/shared/server/types';

export async function runEventCreate(args: Args, context: Context) {
    const timezone = (await readConfig()).settings.timezone || 'Europe/Berlin', allDay = args.allDay === true, name = optional(args, 'member');
    const member = name ? await findMember(name) : null, title = text(args, 'title'), times = eventTimes(wall(text(args, 'start', 40))!, wall(optional(args, 'end')), allDay, timezone), repeat = repeatFrom(args);
    const created = await withDataTransaction(async () => {
      context.signal.throwIfAborted();
      const before = new Set((await readFamilyCalendar()).events.map(e => e.id));
      const calendar = await changeFamilyCalendar('POST', { title, ...times, allDay, member: member?.name ?? '', memberId: member?.id ?? null, color: member?.color ?? DEFAULT_COLOR, category: optional(args, 'category') ?? 'Familie', notes: optional(args, 'notes', 4000) ?? '', ...(repeat ? { repeat } : {}) });
      const event = calendar.events.find(e => !before.has(e.id));
      if (!event) throw new VoiceError('Der gespeicherte Termin konnte nicht eindeutig gelesen werden. Bitte im Kalender nachsehen und nicht erneut anlegen.', 502);
      return event;
    });
    return done(context, `„${created.title}“ eingetragen`, [spokenDate(created.start, created.allDay, timezone), created.member].filter(Boolean).join(' · '), async () => {
      const current = (await readFamilyCalendar()).events.find(e => e.id === created.id);
      if (!current) throw new VoiceError('Der Termin ist schon nicht mehr da.', 409);
      if (current.version !== created.version) throw new VoiceError('Der Termin wurde inzwischen geändert. Bitte im Kalender prüfen, statt die neuere Fassung zu entfernen.', 409);
      await changeFamilyCalendar('DELETE', { id: created.id, version: created.version });
      return { message: 'Termin wieder entfernt.' };
    }, savedEventRecord(created));
  }

export async function runEventUpdate(args: Args, context: Context) {
    const timezone = (await readConfig()).settings.timezone || 'Europe/Berlin', { event, occurrence } = await ownEvent(text(args, 'id'));
    if ((event.repeat || occurrence) && args.wholeSeries !== true) return { saved: false, needsDecision: 'Das ist eine Terminreihe, und ändern geht nur für die ganze Reihe. Frag einmal kurz, ob die ganze Reihe gemeint ist. Einen einzelnen Tag kannst du mit housedash_event_delete auslassen.' };
    const allDay = typeof args.allDay === 'boolean' ? args.allDay : event.allDay, startText = wall(optional(args, 'start')), endText = wall(optional(args, 'end'));
    const duration = +new Date(event.end) - +new Date(event.start);
    let times = { start: event.start, end: event.end };
    if (startText || endText || allDay !== event.allDay) {
      const start = startText ?? (allDay ? isoDateInTZ(new Date(event.start), timezone) : toWallTime(event.start, timezone));
      let end = endText;
      if (!end && allDay && event.allDay) {
        const days = Math.max(1, Math.round((Date.parse(isoDateInTZ(new Date(event.end), timezone)) - Date.parse(isoDateInTZ(new Date(event.start), timezone))) / 86400000));
        const last = new Date(`${start.slice(0, 10)}T12:00:00Z`); last.setUTCDate(last.getUTCDate() + days - 1);
        end = last.toISOString().slice(0, 10);
      }
      if (!end && !allDay) end = new Date(+parseDateInTZ(start, timezone) + (event.allDay ? 3600000 : duration)).toISOString();
      times = eventTimes(start, end, allDay, timezone);
    }
    const name = optional(args, 'member'), member = name ? await findMember(name) : null;
    const before: FamilyEvent = { ...event };
    const updated = await withDataTransaction(async () => {
      context.signal.throwIfAborted();
      const calendar = await changeFamilyCalendar('PUT', { ...event, ...times, allDay, title: optional(args, 'title') ?? event.title, category: optional(args, 'category') ?? event.category, notes: optional(args, 'notes', 4000) ?? event.notes, ...(member ? { member: member.name, memberId: member.id, color: member.color } : {}) });
      const saved = calendar.events.find(e => e.id === event.id);
      if (!saved) throw new VoiceError('Der gespeicherte Termin konnte nicht gelesen werden. Bitte im Kalender nachsehen.', 502);
      return saved;
    });
    return done(context, `„${updated.title}“ geändert`, spokenDate(updated.start, updated.allDay, timezone), async () => {
      await changeFamilyCalendar('PUT', { ...before, version: updated.version });
      return { message: 'Änderung zurückgenommen.' };
    }, savedEventRecord(updated));
  }

export async function runEventDelete(args: Args, context: Context) {
    const { event, occurrence } = await ownEvent(text(args, 'id'));
    if (occurrence && args.wholeSeries !== true) return prepare(context, `„${event.title}“ am ${occurrence.split('-').reverse().join('.')} auslassen`, 'Nur dieser eine Tag der Reihe', async () => {
      await changeFamilyCalendar('PUT', { ...event, skip: [...new Set([...(event.skip ?? []), occurrence])] });
      return { message: 'Dieser Tag fällt aus.' };
    });
    return prepare(context, `„${event.title}“${event.repeat ? ' mit der ganzen Reihe' : ''} löschen`, new Date(event.start).toLocaleDateString('de-DE'), async () => {
      await changeFamilyCalendar('DELETE', event);
      return { message: 'Termin gelöscht.' };
    });
  }
