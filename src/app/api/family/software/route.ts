import { withAuth } from '@/lib/api-utils';
import { readSoftware, softwareCommand } from '@/features/software/server/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => Response.json(await readSoftware(), { headers: { 'Cache-Control': 'no-store' } }), 'Software-Status konnte nicht geladen werden.');
export const POST = withAuth(async request => {
  if (Number(request.headers.get('content-length') || 0) > 1024) return Response.json({ error: 'Anfrage zu groß.' }, { status: 413 });
  let body: { action?: unknown; version?: unknown; enabled?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400 }); }
  if (body.action === 'check') return softwareCommand('check');
  if (body.action === 'install' && typeof body.version === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,5}$/.test(body.version)) return softwareCommand('install', body.version);
  if (body.action === 'auto' && typeof body.enabled === 'boolean') return softwareCommand('auto', undefined, body.enabled);
  return Response.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
}, 'Software-Aktion konnte nicht ausgeführt werden.');
