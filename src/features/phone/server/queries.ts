import 'server-only';
import { readPhoneState } from '@/features/phone/server/service';

export async function queryPhone() { const s = await readPhoneState(); return { available: s.available, configured: s.configured, auth: s.auth, connected: s.connected, contacts: s.parents.map(p => ({ slot: p.slot, label: p.label })), audioReady: s.audio.ready, call: s.call ? { label: s.call.label, phase: s.call.phase } : null }; }
