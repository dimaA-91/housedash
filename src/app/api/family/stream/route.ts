import { withAuth } from '@/lib/api-utils';
import { familyChanges, readFamilyCalendar } from '@/lib/family-calendar';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async (request) => {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (revision: number) => { if (!closed) controller.enqueue(encoder.encode(`data: ${revision}\n\n`)); };
      familyChanges.on('change', send);
      const appleChanged = () => { if (!closed) controller.enqueue(encoder.encode('event: apple-calendar\ndata: changed\n\n')); };
      familyChanges.on('apple-calendar', appleChanged);
      const timer = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(': heartbeat\n\n')); }, 25000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        familyChanges.off('change', send);
        familyChanges.off('apple-calendar', appleChanged);
        request.signal.removeEventListener('abort', abort);
      };
      const abort = () => { cleanup(); controller.close(); };
      request.signal.addEventListener('abort', abort, { once: true });
      if (request.signal.aborted) abort();
      else void readFamilyCalendar().then(data => send(data.revision)).catch(() => { cleanup(); controller.error(new Error('Kalender nicht verfügbar')); });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}, 'Live-Verbindung konnte nicht aufgebaut werden.');
