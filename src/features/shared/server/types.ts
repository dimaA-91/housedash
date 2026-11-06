import type { VoiceAction } from '@/lib/family-voice-shared';
export type Args = Record<string, unknown>;
export interface Context { owner: string; actions: VoiceAction[]; signal: AbortSignal }
export interface Capability { name: string; description: string; inputSchema: Record<string, unknown>; run: (args: Args, context: Context) => Promise<unknown> }
