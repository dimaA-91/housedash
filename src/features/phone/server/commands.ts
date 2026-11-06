import 'server-only';
import { readPhoneState, phoneCommand } from '@/features/phone/server/service';
import { FeatureError as VoiceError } from '@/features/shared/server/errors';
import { text } from '@/features/shared/server/arguments';
import { prepare } from '@/features/shared/server/actions';

import type { Args, Context } from '@/features/shared/server/types';

export async function runCallPrepare(args: Args, context: Context) { const slot = text(args,'slot'); if (!['mama','papa'].includes(slot)) throw new VoiceError('Unbekannter Elternkontakt.'); const state = await readPhoneState(); const parent = state.parents.find(p => p.slot === slot); if (!state.available) return { prepared: false, reason: 'service_unavailable', message: 'Der Telefondienst ist gerade nicht erreichbar. Bitte Eltern Telefon oeffnen und dort den Dienst starten.' };
    if (!state.configured || state.auth !== 'ready') return { prepared: false, reason: 'login_required', message: 'Das Elterntelefon ist noch nicht eingerichtet oder angemeldet. Bitte unter Eltern Telefon die Einrichtung abschliessen.' };
    if (!parent) return { prepared: false, reason: 'contact_not_configured', message: `${slot === 'mama' ? 'Mama' : 'Papa'} ist noch nicht als Kontakt hinterlegt. Bitte unter Eltern Telefon in Kontakte & Headset einrichten.` };
    if (!state.connected) return { prepared: false, reason: 'disconnected', message: 'Das Elterntelefon ist eingerichtet, aber gerade nicht verbunden. Bitte die Verbindung unter Eltern Telefon pruefen.' }; return prepare(context, `${parent.label} anrufen`, 'Anruf über das Elterntelefon am Pi starten', async signal => { const response = await phoneCommand(JSON.stringify({ action: 'call', slot }), signal); if (!response.ok) throw new VoiceError('Der Anruf konnte nicht gestartet werden. Bitte das Elterntelefon öffnen.'); return { message: 'Anruf gestartet.' }; }); }
