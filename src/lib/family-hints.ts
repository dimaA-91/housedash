/**
 * Hinweise für die Startseite: Müll am Vorabend und Wetter ("Regen ab 15 Uhr, Jacke mitnehmen").
 * Reine Funktionen ohne Netzwerk; die Daten liefern Abfallkalender und die bestehende Wetterabfrage.
 */
import type { WasteEvent, WasteType } from './family-waste-shared';
import type { HourlyWeather } from './weather/types';

export type HintTone = 'info' | 'warn' | 'alert';
export interface Hint {
  id: string;
  kind: 'waste' | 'rain' | 'snow' | 'storm' | 'frost' | 'heat' | 'wind' | 'dwd';
  tone: HintTone;
  text: string;
  detail?: string;
  /** Tonnenart für das Symbol bei Müllhinweisen. */
  waste?: WasteType;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WASTE_LABEL: Record<Exclude<WasteType, 'other'>, string> = { rest: 'Restmülltonne', yellow: 'Gelbe Tonne', paper: 'Papiertonne', bio: 'Biotonne' };
const join = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}` : names[0] ?? '';

/** Ab 16 Uhr: Abholung morgen. Bis 9 Uhr: Abholung heute (falls die Tonne noch nicht draußen steht). */
export function wasteHints(events: WasteEvent[], now: Date): Hint[] {
  const hour = now.getHours();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pick = (day: string) => events.filter(e => e.date === day);
  const describe = (list: WasteEvent[]) => join([...new Set(list.map(e => e.type === 'other' ? e.summary : WASTE_LABEL[e.type]))]);
  const out: Hint[] = [];
  if (hour >= 16) {
    const list = pick(dayKey(tomorrow));
    if (list.length) out.push({ id: 'waste-tomorrow', kind: 'waste', tone: 'warn', text: `Morgen: ${describe(list)} rausstellen`, detail: 'Abholung morgen früh', waste: list[0].type });
  }
  if (hour < 9) {
    const list = pick(dayKey(now));
    if (list.length) out.push({ id: 'waste-today', kind: 'waste', tone: 'alert', text: `Heute wird abgeholt: ${describe(list)}`, detail: 'Jetzt rausstellen, falls noch nicht geschehen', waste: list[0].type });
  }
  return out;
}

const WET_ICONS = ['cloud-rain', 'cloud-lightning', 'cloud-hail', 'snowflake'];
/** Wetterhinweise für die nächsten Stunden (Stundenwerte in metrischen Einheiten). */
export function weatherHints(hourly: HourlyWeather[], now: Date): Hint[] {
  const from = now.getTime() - 3600_000;
  const next = (hours: number) => hourly.filter(h => { const t = Date.parse(h.time); return t >= from && t <= now.getTime() + hours * 3600_000; });
  const out: Hint[] = [];

  const awake = next(12).filter(h => { const hr = new Date(h.time).getHours(); return hr >= 6 && hr <= 22; });
  const wet = awake.find(h => (h.precipProbability ?? 0) >= 60 || WET_ICONS.includes(h.icon));
  if (wet) {
    const at = new Date(wet.time), already = at.getTime() <= now.getTime() + 30 * 60_000;
    const kind = wet.icon === 'snowflake' ? 'snow' : wet.icon === 'cloud-lightning' ? 'storm' : 'rain';
    const noun = kind === 'snow' ? 'Schnee' : kind === 'storm' ? 'Gewitter' : 'Regen';
    out.push({
      id: `wet-${at.getHours()}`, kind, tone: kind === 'storm' ? 'alert' : 'info',
      text: already ? `${noun} jetzt` : `${noun} ab ${at.getHours()} Uhr`,
      detail: kind === 'storm' ? 'Draußen aufpassen' : kind === 'snow' ? 'Warm anziehen, Mütze und Handschuhe' : 'Jacke oder Schirm mitnehmen',
    });
  }

  const ahead = next(14);
  const cold = ahead.length ? Math.min(...ahead.map(h => h.temp)) : null;
  if (cold !== null && cold <= 0) out.push({ id: 'frost', kind: 'frost', tone: 'info', text: `Frost bis ${Math.round(cold)}°`, detail: 'Warm anziehen, Autoscheiben prüfen' });
  const hot = next(10).reduce((m, h) => Math.max(m, h.temp), -Infinity);
  if (hot >= 30) out.push({ id: 'heat', kind: 'heat', tone: 'warn', text: `Heiß bis ${Math.round(hot)}°`, detail: 'Viel trinken, Sonnencreme, Kopfbedeckung' });
  const gust = next(10).reduce((m, h) => Math.max(m, h.windGust ?? 0), 0);
  if (gust >= 60) out.push({ id: 'wind', kind: 'wind', tone: gust >= 90 ? 'alert' : 'warn', text: `Sturmböen bis ${Math.round(gust)} km/h`, detail: 'Draußen nichts herumliegen lassen' });
  return out;
}
