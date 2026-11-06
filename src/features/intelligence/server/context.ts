import 'server-only';
import { readFamilyData } from '@/features/household/server/service';
import { readFamilyProfile } from '@/features/household/server/profile';
import { readTransitConfig } from '@/features/transit/server/service';
import { readTodoData } from '@/features/tasks/server/service';
import { readFamilyWaste } from '@/features/waste/server/service';
import { readPhoneState } from '@/features/phone/server/service';
import { readConfig } from '@/lib/config';
import { brainContext } from '@/features/brain/server/service';

/** Kurzer Hintergrund für jedes Gespräch: So erkennt die KI Namen trotz Hörfehlern und spart Werkzeugaufrufe. Keine Termine, keine Zugangsdaten. */
export async function intelligenceContext() {
  const [config, family, profile, todos, transit, phone, brain, waste] = await Promise.all([readConfig(), readFamilyData(), readFamilyProfile(), readTodoData(), readTransitConfig(), readPhoneState().catch(() => null), brainContext().catch(() => [] as string[]), readFamilyWaste()]);
  const timezone = config.settings.timezone || 'Europe/Berlin';
  const place = config.settings.locationName || '';
  return [
    `Jetzt: ${new Date().toLocaleString('de-DE', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' })}. Alle Zeiten in Werkzeugen sind Ortszeit.`,
    place ? `Wohnort für Wetter: ${place}.` : 'Kein Wetterort eingestellt.',
    'Kalenderzugriff: housedash_calendar liest eigene Termine, Serien, Geburtstage, Apple-Abos und Müllabfuhr gemeinsam. Für vollständige Übersicht query/member null, bei truncated kleinere Zeiträume abfragen. Aktuelle Termine immer nachlesen.',
    waste.importedAt ? `Müllkalender vorhanden, letzter importierter Abholtag: ${waste.events.at(-1)?.date || 'unbekannt'}. Zum Müll rausbringen housedash_waste abfragen; die Vorabend-Empfehlung ist von der Abholung zu unterscheiden.` : 'Noch kein Müllkalender importiert. Eigene Müll-Erinnerungen können trotzdem im Kalender oder in Aufgaben stehen.',
    `Familie ${profile.familyName}: ${family.members.map(m => m.name).join(', ') || 'noch niemand eingetragen'}.`,
    `Aufgabenlisten: ${todos.lists.map(l => l.name).join(', ') || 'keine'}.`,
    `Straßenbahn Linie ${transit.line || 'beliebig'}: Hinrichtung ${transit.from.name} nach ${transit.to.name}.`,
    phone ? `Eltern-Telefon: ${phone.parents.map(p => p.label).join(', ') || 'kein Kontakt eingerichtet'}.` : '',
    ...brain,
  ].filter(Boolean).join('\n');
}
