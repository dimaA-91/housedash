import 'server-only';
import { readConfig } from '@/lib/config';
import { toWallTime } from '@/features/shared/server/arguments';
import { featureCatalog, executeFeatureOperation } from '@/features/shared/server/registry';
import type { Context } from '@/features/shared/server/types';
export const intelligenceTools = featureCatalog.map(({ name, description, inputSchema }) => ({ type: 'function' as const, name, description, inputSchema }));
export async function executeIntelligenceTool(name: string, raw: unknown, context: Context) {
  const result = await executeFeatureOperation(name, raw, context);
  // URLs in provider/calendar content are never instructions or capability tokens for the model.
  // Alle Zeitpunkte gehen als Ortszeit an die KI, sonst liest sie UTC-Zeiten eine oder zwei Stunden daneben vor.
  const timezone = (await readConfig()).settings.timezone || 'Europe/Berlin';
  const serialized = JSON.stringify(result).replace(/(?:https?:\/\/|webcal:\/\/)[^\s"\\]+/g, '[Link]').replace(/"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))"/g, (_, iso: string) => `"${toWallTime(iso, timezone)}"`);
  if (serialized.length > 50_000) return { truncated: true, message: 'Ergebnis zu groß. Bitte einen engeren Zeitraum oder Suchbegriff verwenden.' };
  return JSON.parse(serialized) as unknown;
}
