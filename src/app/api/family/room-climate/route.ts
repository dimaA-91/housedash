import { withAuth } from '@/lib/api-utils';
import { readRoomClimate } from '@/lib/room-climate-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => Response.json(await readRoomClimate(), {
  headers: { 'Cache-Control': 'no-store' },
}), 'Raumklima konnte nicht gelesen werden.');
