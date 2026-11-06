'use client';
import { PHONE_BUSY_PHASES } from '@/lib/family-phone-shared';
import { useFamilyPhone } from './FamilyPhoneContext';

const tones = [{ id: 'dial', label: 'Freizeichen' }, { id: 'ring', label: 'Klingeln' }, { id: 'busy', label: 'Besetzt' }] as const;

export default function FamilyPhoneAudio() {
  const { state, pending, command } = useFamilyPhone();
  const audio = state.audio;
  const inCall = !!state.call && PHONE_BUSY_PHASES.includes(state.call.phase);
  const available = state.available && audio.ready;
  const volume = audio.volumePercent;
  const volumeKnown = typeof volume === 'number';
  return <details className="family-phone-audio-check">
    <summary>Ton prüfen <span>Lautsprecher am Pi</span></summary>
    <div className="family-phone-audio-check-body">
      <p>{audio.outputLabel || 'Der im Telefon ausgewählte Lautsprecher'} · {volumeKnown ? `${volume} %` : 'Lautstärke unbekannt'}{audio.muted ? ' · Stummgeschaltet' : ''}</p>
      <div className="family-phone-tone-buttons" role="group" aria-label="Telefongeräusche am Pi abspielen">
        {tones.map(tone => <button type="button" key={tone.id} disabled={!available || pending || inCall || !!audio.testTone} onClick={() => void command('audio-tone', { tone: tone.id })}>{tone.label}</button>)}
        {audio.testTone && <button type="button" disabled={pending} onClick={() => void command('stop-audio-tone')}>Ton stoppen</button>}
      </div>
      <div className="family-phone-tone-buttons" role="group" aria-label="Lautstärke am Pi">
        <button type="button" disabled={!available || pending || !volumeKnown || volume <= 0} onClick={() => void command('audio-volume', { volume: Math.max(0, (volume ?? 0) - 10) })}>− Leiser</button>
        <button type="button" disabled={!available || pending || !volumeKnown || volume >= 100} onClick={() => void command('audio-volume', { volume: Math.min(100, (volume ?? 0) + 10) })}>+ Lauter</button>
        {audio.muted && <button type="button" disabled={!available || pending} onClick={() => void command('audio-volume', { volume: Math.min(100, volume && volume > 0 ? volume : 60) })}>Ton einschalten</button>}
      </div>
      <p className="family-hint" role="status">{audio.testTone ? `${tones.find(tone => tone.id === audio.testTone)?.label ?? 'Ton'} läuft am Pi …` : inCall ? 'Telefongeräusche sind während eines Anrufs pausiert.' : 'Kurze lokale Tonprobe ohne Anruf. Hörst du nichts? Den oben ausgewählten Lautsprecher und den Stecker prüfen.'}</p>
    </div>
  </details>;
}
