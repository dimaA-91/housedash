import { FeatureError } from './errors';

/** Supported operation schemas are deliberately small: bounded scalar arguments, no arbitrary payloads. */
export function validateArguments(schema: Record<string, unknown>, value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FeatureError('Ungültige Funktionsparameter.');
  const properties = schema.properties as Record<string, { type: string | string[]; enum?: unknown[] }>;
  const args = value as Record<string, unknown>;
  if (Object.keys(args).some(key => !Object.hasOwn(properties, key))) throw new FeatureError('Unbekannter Funktionsparameter.');
  for (const key of schema.required as string[]) if (!Object.hasOwn(args, key)) throw new FeatureError(`Der Parameter ${key} fehlt.`);
  for (const [key, input] of Object.entries(args)) {
    const rule = properties[key], types = Array.isArray(rule.type) ? rule.type : [rule.type];
    const type = input === null ? 'null' : typeof input;
    if (!types.includes(type) && !(type === 'number' && types.includes('integer') && Number.isInteger(input))) throw new FeatureError(`Der Parameter ${key} hat einen ungültigen Typ.`);
    if (typeof input === 'number' && !Number.isFinite(input) || typeof input === 'string' && input.length > 4000) throw new FeatureError(`Der Parameter ${key} ist ungültig oder zu lang.`);
    if (rule.enum && !rule.enum.includes(input)) throw new FeatureError(`Der Parameter ${key} enthält einen unbekannten Wert.`);
  }
}
