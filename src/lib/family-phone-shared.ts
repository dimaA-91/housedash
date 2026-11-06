export type ParentSlot = 'mama' | 'papa';
export type PhonePhase = 'incoming' | 'dialing' | 'ringing' | 'connecting' | 'active' | 'ended' | 'error';
export interface PhoneParent { slot: ParentSlot; label: string; userId: string; username: string; name: string }
export interface PhoneCall {
  id: string; userId: string; label: string; slot: ParentSlot;
  direction: 'incoming' | 'outgoing'; phase: PhonePhase;
  startedAt: string; connectedAt: string | null; muted: boolean; listenOnly?: boolean; message: string | null;
  /** Wo der Ton läuft: am Pi (Headset) oder im Browser des Geräts, mit dem telefoniert wird. */ audioHost?: 'pi' | 'browser';
}
export interface PhoneState {
  available: boolean; revision: number; generation: string;
  auth: 'setup' | 'logged-out' | 'connecting' | 'qr' | 'password' | 'ready';
  configured: boolean; connected: boolean; account: { name: string; username: string } | null;
  qrUrl: string | null; qrExpiresAt: string | null; parents: PhoneParent[];
  audio: {
    microphones: { id: string; name: string }[]; speakers: { id: string; name: string }[];
    microphone: string | null; speaker: string | null; ready: boolean; message: string | null;
    volumePercent?: number | null; muted?: boolean | null; outputLabel?: string | null;
    testTone?: 'dial' | 'ring' | 'busy' | null;
  };
  call: PhoneCall | null; error: string | null;
}
export const PHONE_UNAVAILABLE: PhoneState = {
  available: false, revision: 0, generation: '', auth: 'setup', configured: false, connected: false, account: null,
  qrUrl: null, qrExpiresAt: null, parents: [],
  audio: { microphones: [], speakers: [], microphone: null, speaker: null, ready: false, message: null },
  call: null, error: 'Der Telefon-Dienst ist momentan nicht erreichbar.',
};
export const PHONE_BUSY_PHASES: readonly PhonePhase[] = ['incoming', 'dialing', 'ringing', 'connecting', 'active'];
export const PHONE_PHASE_LABEL: Record<PhonePhase, string> = {
  incoming: 'Eingehender Anruf', dialing: 'Anruf wird gestartet …', ringing: 'Es klingelt …',
  connecting: 'Verbindung wird hergestellt …', active: 'Im Gespräch', ended: 'Anruf beendet', error: 'Anruf nicht möglich',
};
