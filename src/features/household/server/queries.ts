import 'server-only';
import { readFamilyData } from '@/features/household/server/service';
import { readFamilyProfile } from '@/features/household/server/profile';

export async function queryFamily() { const data = await readFamilyData(); return { familyName: (await readFamilyProfile()).familyName, members: data.members.map(({ id, name, color, birthday }) => ({ id, name, color, birthday })), groups: data.groups || [] }; }
