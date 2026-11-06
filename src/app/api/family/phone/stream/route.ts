import { withAuth } from '@/lib/api-utils';
import { phoneStream } from '@/lib/family-phone-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withAuth(request => phoneStream(request.signal), 'Telefon-Verbindung konnte nicht aufgebaut werden.');
