import { withAuth } from '@/lib/api-utils';
import { phoneAudioIn, phoneAudioOut } from '@/lib/family-phone-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Stimme des Gegenübers (Dauerstrom, rohes PCM). Nur während eines Gesprächs, das auf dem Browser läuft. */
export const GET = withAuth(request => phoneAudioOut(request.signal), 'Telefon-Ton konnte nicht aufgebaut werden.');
/** Mikrofon des Browsers in kleinen Stücken (maximal 16 KB). */
export const POST = withAuth(async request => {
  if (Number(request.headers.get('content-length') || 0) > 16_384) return new Response(null, { status: 413 });
  return phoneAudioIn(Buffer.from(await request.arrayBuffer()), request.signal);
}, 'Telefon-Mikrofon konnte nicht übertragen werden.');
