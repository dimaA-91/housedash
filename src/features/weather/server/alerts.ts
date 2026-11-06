/**
 * Amtliche Wetterwarnungen des Deutschen Wetterdienstes über Bright Sky (freie DWD-Daten, kein Konto, kein Schlüssel).
 * Es werden nur Koordinaten des Haushalts abgefragt. Das Ergebnis wird 15 Minuten gemerkt; bei einem Ausfall bleibt der letzte Stand.
 */
export interface DwdAlert { id: string; headline: string; severity: 'moderate' | 'severe' | 'extreme'; onset: string; expires: string; instruction: string }

interface BrightSkyAlert { id?: number; alert_id?: string; severity?: string; onset?: string; expires?: string; headline_de?: string; event_de?: string; instruction_de?: string | null }
const cache = new Map<string, { at: number; alerts: DwdAlert[] }>();
const TTL = 15 * 60_000;

export async function readWeatherAlerts(lat: string, lon: string): Promise<DwdAlert[]> {
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return [];
  const key = `${la.toFixed(2)}|${lo.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.alerts;
  try {
    const res = await fetch(`https://api.brightsky.dev/alerts?lat=${la.toFixed(3)}&lon=${lo.toFixed(3)}`, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'HouseDash-HomeDisplay/1.0' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`Bright Sky ${res.status}`);
    const body = await res.json() as { alerts?: BrightSkyAlert[] };
    const now = Date.now();
    const alerts = (body.alerts ?? []).flatMap((a): DwdAlert[] => {
      const severity = a.severity === 'moderate' || a.severity === 'severe' || a.severity === 'extreme' ? a.severity : null;
      const onset = a.onset ? Date.parse(a.onset) : NaN, expires = a.expires ? Date.parse(a.expires) : NaN;
      // Nur Warnungen ab Stufe "markant" (moderate), die jetzt gelten oder in den nächsten 12 Stunden beginnen.
      if (!severity || !Number.isFinite(onset) || !Number.isFinite(expires) || expires < now || onset > now + 12 * 3600_000) return [];
      return [{ id: String(a.alert_id ?? a.id ?? `${a.event_de}-${a.onset}`), headline: (a.headline_de || a.event_de || 'Wetterwarnung').slice(0, 200), severity, onset: a.onset!, expires: a.expires!, instruction: (a.instruction_de ?? '').slice(0, 400) }];
    });
    cache.set(key, { at: Date.now(), alerts });
    return alerts;
  } catch (error) {
    if (hit) return hit.alerts;
    throw error;
  }
}
