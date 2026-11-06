import { withAuth } from '@/lib/api-utils';
import { phoneCommand, readPhoneState, restartPhoneService } from '@/lib/family-phone-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withAuth(async request => Response.json(await readPhoneState(request.signal), {
  headers: { 'Cache-Control': 'no-store' },
}), 'Telefon-Status konnte nicht geladen werden.');
export const POST = withAuth(async request => {
  if (Number(request.headers.get('content-length') || 0) > 8192) return Response.json({ error: 'Telefon-Anfrage zu groß.' }, { status: 413 });
  const body = await request.text();
  if (body.length > 8192) return Response.json({ error: 'Telefon-Anfrage zu groß.' }, { status: 413 });
  let action: string;
  try {
    const value = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.action !== 'string') throw new Error();
    action = value.action;
  } catch { return Response.json({ error: 'Ungültige Telefon-Anfrage.' }, { status: 400 }); }
  return action === 'restart-service' ? restartPhoneService(request.signal) : phoneCommand(body, request.signal);
}, 'Telefon-Aktion konnte nicht abgeschlossen werden.');
