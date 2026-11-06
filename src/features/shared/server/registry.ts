import 'server-only';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';
import { BrainError } from '@/features/brain/server/service';
import type { Args, Context } from '@/features/shared/server/types';
import { brainTools } from '@/features/brain/server/tools';
import { householdTools } from '@/features/household/server/tools';
import { calendarTools } from '@/features/calendar/server/tools';
import { tasksTools } from '@/features/tasks/server/tools';
import { transitTools } from '@/features/transit/server/tools';
import { weatherTools } from '@/features/weather/server/tools';
import { wasteTools } from '@/features/waste/server/tools';
import { phoneTools } from '@/features/phone/server/tools';
import { networkTools } from '@/features/network/server/tools';
import { intelligenceTools as systemTools } from '@/features/intelligence/server/tools';
import { validateArguments } from './validation';
const groups = { brain: brainTools, household: householdTools, calendar: calendarTools, tasks: tasksTools, transit: transitTools, weather: weatherTools, waste: wasteTools, phone: phoneTools, network: networkTools, intelligence: systemTools };
const capabilities = Object.entries(groups).flatMap(([feature, operations]) => operations.map(operation => ({ ...operation, feature })));

export const featureCatalog = capabilities.map(({ feature, name, description, inputSchema }) => ({ feature, name, description, inputSchema }));
const byName = new Map(capabilities.map(capability => [capability.name, capability]));
if (byName.size !== capabilities.length) throw new Error('Duplicate HouseDash operation');

/** Shared execution boundary for authenticated HTTP and the AI tool bridge. */
export async function executeFeatureOperation(name: string, raw: unknown, context: Context) {
  const operation = byName.get(name);
  if (!operation) throw new VoiceError('Diese Funktion ist nicht verfügbar.', 404);
  validateArguments(operation.inputSchema, raw);
  context.signal.throwIfAborted();
  try { return await operation.run(raw as Args, context); }
  catch (error) { if (error instanceof BrainError) throw new VoiceError(error.message); throw error; }
}
