import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { withFamilyData } from '@/lib/family-api';
import { readFamilyData, familyResponse, replaceFamilyMembers } from '@/lib/family-data';
import { parseFamilyProfile, profileRevision, readFamilyProfile } from '@/lib/family-profile';
import { readTransactionFile } from '@/lib/data-transaction';

export const dynamic = 'force-dynamic';
export const GET = withAuth(async () => withFamilyData(async () => {
  const profile = await readFamilyProfile();
  return Response.json({ ...familyResponse(await readFamilyData()), ...profile, profileRevision: profileRevision(profile) }, { headers: { 'Cache-Control': 'no-store' } });
}), 'Familienangaben konnten nicht geladen werden.');

type Input = Parameters<typeof replaceFamilyMembers>[0] & { familyName: string; profileRevision: string };
export const PUT = withAuth(async request => {
  const body = await parseJsonBody<Input>(request, { maxBytes: 32768 });
  if (body instanceof Response) return body;
  return withFamilyData(async () => {
    let profile;
    try { profile = parseFamilyProfile(body); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
    const current = await readFamilyProfile();
    if (!body.profileRevision || body.profileRevision !== profileRevision(current))
      return Response.json({ error: 'Familienangaben wurden inzwischen geändert. Bitte neu laden.' }, { status: 409 });
    const family = await replaceFamilyMembers(body, async () => [{ path: 'data/family-profile.json', before: await readTransactionFile('data/family-profile.json'), after: JSON.stringify(profile, null, 2) }]);
    return Response.json({ ...family, ...profile, profileRevision: profileRevision(profile) });
  });
}, 'Familienangaben konnten nicht gespeichert werden.');
