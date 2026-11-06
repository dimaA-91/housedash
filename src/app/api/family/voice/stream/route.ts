import { withAuth } from '@/lib/api-utils';
import { phoneStream } from '@/lib/family-phone-server';
import { VOICE_SOCKET } from '@/lib/family-voice-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withAuth(request => phoneStream(request.signal, VOICE_SOCKET, 'Sprachdienst'), 'Sprachverbindung konnte nicht aufgebaut werden.');
