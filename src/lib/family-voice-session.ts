import 'server-only';
import { executeIntelligenceTool, intelligenceContext, intelligenceOwner, intelligenceTools } from './family-intelligence';
import { voiceStream, VoiceError } from './family-voice-server';
import type { VoiceAction } from './family-voice-shared';

/**
 * Gemeinsamer Weg für jede Sprach-Engine: Der Browser bekommt nur diese Ereignisse als NDJSON, die Werkzeuge laufen hier
 * auf dem Server. Eine neue Engine braucht nur einen weiteren Pfad im Sprachdienst, keine neue Werkzeuganbindung.
 */
export function voiceEventStream(request: Request, path: '/chat' | '/realtime', body: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const lifetime = new AbortController();
  const signal = AbortSignal.any([request.signal, lifetime.signal]);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => { if (open) { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { open = false; lifetime.abort(); } } };
      const actions: VoiceAction[] = [];
      const context = { owner: intelligenceOwner(request), actions, signal };
      try {
        await voiceStream(path, { ...body, tools: intelligenceTools, context: await intelligenceContext() }, {
          tool: async (name, args) => {
            send({ type: 'working', tool: name });
            const result = await executeIntelligenceTool(name, args, context);
            for (const action of actions.splice(0)) send({ type: 'action', action });
            return result;
          },
          event: send,
        }, signal);
      } catch (error) {
        if (!signal.aborted) send({ type: 'error', message: error instanceof VoiceError ? error.message : 'Der Sprachdienst antwortet gerade nicht.', status: error instanceof VoiceError ? error.status : 503 });
      } finally { lifetime.abort(); open = false; try { controller.close(); } catch { /* client left */ } }
    },
    cancel() { lifetime.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}
