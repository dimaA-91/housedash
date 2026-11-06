import type { VoiceAction } from '@/lib/family-voice-shared';

/** Auth stays in the browser's same-origin cookie. Never place credentials in feature arguments. */
export async function callFeature<Result>(operation: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<{ result: Result; actions: VoiceAction[] }> {
  const response = await fetch('/api/family/features', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, args }), signal, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Die Funktion ist gerade nicht verfügbar.');
  return body;
}
