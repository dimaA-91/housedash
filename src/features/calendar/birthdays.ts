import type { FamilyEvent } from '@/features/calendar/server/service';
import type { FamilyMember } from '@/types/family';
const pad = (n: number) => String(n).padStart(2, '0');
export const isBirthdayCategory = (event: { category: string }) => event.category === 'Geburtstag';

export function birthdayEvents(members: FamilyMember[], thisYear = new Date().getFullYear()): FamilyEvent[] {
  const out: FamilyEvent[] = [];
  for (const m of members) {
    const parts = m.birthday?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) continue;
    const born = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    for (let year = thisYear - 1; year <= thisYear + 2; year++) {
      const age = year - born;
      if (age < 0) continue;
      // 29. Februar feiert in Jahren ohne Schalttag am 28.
      const leap = new Date(year, 1, 29).getMonth() === 1;
      const d = month === 2 && day === 29 && !leap ? 28 : day;
      const start = new Date(`${year}-${pad(month)}-${pad(d)}T00:00`), end = new Date(start);
      end.setDate(end.getDate() + 1);
      out.push({ id: `birthday:${m.id}:${year}`, title: age === 0 ? `Geburtstag ${m.name}` : `Geburtstag ${m.name} (${age})`, start: start.toISOString(), end: end.toISOString(), allDay: true, member: m.name, color: m.color, category: 'Geburtstag', notes: '', version: 0 });
    }
  }
  return out;
}

export function recurringBirthdayEvents(events: FamilyEvent[], thisYear = new Date().getFullYear()): FamilyEvent[] {
  const out: FamilyEvent[] = [];
  for (const e of events) {
    if (!isBirthdayCategory(e)) continue;
    const born = new Date(e.start);
    if (!Number.isFinite(born.getTime())) continue;
    const month = born.getMonth(), day = born.getDate();
    for (let year = thisYear - 1; year <= thisYear + 2; year++) {
      const age = year - born.getFullYear();
      if (age < 0) continue;
      const leap = new Date(year, 1, 29).getMonth() === 1;
      const d = month === 1 && day === 29 && !leap ? 28 : day;
      const start = new Date(year, month, d), end = new Date(year, month, d + 1);
      out.push({ ...e, id: `bday:${e.id}:${year}`, title: age > 0 ? `Geburtstag ${e.title} (${age})` : `Geburtstag ${e.title}`, start: start.toISOString(), end: end.toISOString(), allDay: true, member: 'Geburtstag', memberId: null });
    }
  }
  return out;
}
