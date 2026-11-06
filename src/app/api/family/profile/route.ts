import { withAuth } from '@/lib/api-utils';
import { ProfileError, readFamilyProfile, writeFamilyProfile } from '@/lib/family-profile';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => Response.json(await readFamilyProfile(), { headers: { 'Cache-Control': 'no-store' } }), 'Familienangaben konnten nicht geladen werden.');
export const PUT = withAuth(async (request) => {
  const body = await request.text();
  if (body.length > 1024) return Response.json({ error: 'Angaben zu groß.' }, { status: 413 });
  try {
    return Response.json(await writeFamilyProfile(JSON.parse(body)));
  } catch (error) {
    if (error instanceof ProfileError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Ungültiges JSON.' }, { status: 400 });
    throw error;
  }
}, 'Familienangaben konnten nicht gespeichert werden.');
