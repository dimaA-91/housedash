'use client';
import { useCallback, useState } from 'react';
import { playTestTone } from './client-audio';
import FamilyPhoneAudio from './FamilyPhoneAudio';
import { useFamilyPhone } from './FamilyPhoneContext';
import { useVoiceDevices } from './useVoiceDevices';

/**
 * Audio: the one place for microphone, speaker and volume. The AI voice and the phone use the same devices.
 * At the Pi display the devices come from the Pi itself (PulseAudio: HDMI, USB headset, jack); on every other
 * device the browser's own devices are offered and remembered per browser.
 */
export default function FamilyAudioSettings() {
  const devices = useVoiceDevices();
  const { state, pending, command, piDisplay } = useFamilyPhone();
  const [testing, setTesting] = useState(false);
  const [problem, setProblem] = useState('');
  const pi = piDisplay && (state.audio.speakers.length > 0 || state.audio.microphones.length > 0) ? state.audio : null;

  const test = useCallback(async () => {
    setTesting(true); setProblem('');
    try { await playTestTone(pi ? '' : devices.speakerId); }
    catch { setProblem('Dieser Lautsprecher ist nicht verfügbar. Bitte einen anderen wählen oder „Systemstandard“ nehmen.'); }
    finally { setTesting(false); }
  }, [devices.speakerId, pi]);

  const message = problem || devices.error;
  return <section className="family-system family-audio">
    <p className="family-page-intro">Mikrofon, Lautsprecher und Lautstärke, gemeinsam für die KI-Stimme und das Telefon</p>
    {message && <p role="alert" className="family-error">{message}</p>}
    {pi
      ? <section className="family-tile"><h3>Audio am Pi</h3>
        <p className="family-hint">Hier erscheinen die Geräte, die der Pi erkennt: HDMI, USB-Headset, Kopfhörerbuchse und Bluetooth. Die Auswahl gilt für die KI und für Telefonate.</p>
        <div className="family-system-form">
          <label>Mikrofon<select value={pi.microphone ?? ''} disabled={pending} onChange={event => void command('audio', { microphone: event.target.value || null, speaker: pi.speaker })}><option value="">Automatisch</option>{pi.microphones.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>
          <label>Lautsprecher<select value={pi.speaker ?? ''} disabled={pending} onChange={event => { setProblem(''); void command('audio', { microphone: pi.microphone, speaker: event.target.value || null }); }}><option value="">Automatisch</option>{pi.speakers.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>
          <label className="family-switch"><input type="checkbox" role="switch" checked={pi.echoCancel !== false} disabled={pending} onChange={event => void command('audio', { microphone: pi.microphone, speaker: pi.speaker, echoCancel: event.target.checked })} /><span className="family-switch-track" aria-hidden="true" /><span>Echo und Rauschen bei Telefonaten unterdrücken</span></label>
          <p className="family-hint">Verhindert, dass dein Gegenüber sich selbst aus dem Lautsprecher hört. Es gilt für Telefonate am Pi und kostet etwa ein Fünftel eines Prozessorkerns, nur während des Gesprächs.</p>
          {pi.message && <p className="family-phone-notice">{pi.message}</p>}
          <button type="button" disabled={testing} onClick={() => void test()}>{testing ? 'Ton läuft …' : 'Lautsprecher testen'}</button>
          <FamilyPhoneAudio />
          <button type="button" disabled={pending} onClick={() => void command('refresh-audio')}>Geräte neu erkennen</button>
        </div>
      </section>
      : <section className="family-tile"><h3>Audio auf diesem Gerät</h3>
        <p>{devices.inputs.length ? `${devices.inputs.length} Mikrofon${devices.inputs.length === 1 ? '' : 'e'} erkannt.` : 'Noch kein freigegebenes Mikrofon erkannt.'} {devices.speakerSupported ? (devices.outputs.length ? `${devices.outputs.length} Lautsprecher zur Auswahl.` : 'Noch kein Lautsprecher zur Auswahl.') : 'Den Lautsprecher bestimmt dieses Gerät selbst.'}</p>
        {!devices.secure && devices.ready && <p className="family-hint">Für Mikrofonzugriff am Handy bitte <a href={`https://${typeof location === 'undefined' ? 'housedash.local' : location.hostname}/family`}>die lokale HTTPS-Adresse</a> verwenden. Einmalig das <a href={`http://${typeof location === 'undefined' ? 'housedash.local' : location.hostname}/housedash-root.crt`}>HouseDash-Zertifikat</a> auf dem eigenen Gerät installieren und vertrauen.</p>}
        <div className="family-system-form">
          <button type="button" disabled={!devices.secure} onClick={() => void devices.permission()}>Mikrofonzugriff freigeben</button>
          <label>Mikrofon<select value={devices.microphoneId} onChange={event => devices.save(event.target.value)}><option value="">Systemstandard</option>{devices.inputs.filter(device => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Mikrofon ${index + 1}`}</option>)}</select></label>
          {devices.speakerSupported
            ? <>
              <label>Lautsprecher<select value={devices.speakerId} onChange={event => { setProblem(''); devices.saveSpeaker(event.target.value); }}><option value="">Systemstandard</option>{devices.outputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Lautsprecher ${index + 1}`}</option>)}</select></label>
              <button type="button" disabled={testing} onClick={() => void test()}>{testing ? 'Ton läuft …' : 'Lautsprecher testen'}</button>
              {!devices.outputs.length && <p className="family-hint">Die Namen der Lautsprecher erscheinen erst, wenn der Mikrofonzugriff freigegeben ist.</p>}
            </>
            : <p className="family-hint">Dieses Gerät lässt die Wahl des Lautsprechers nicht zu (zum Beispiel iPhone und iPad). Dort bestimmt das Kontrollzentrum, wohin der Ton geht.</p>}
          <p className="family-hint">Die Auswahl gilt nur für diesen Browser, für die KI-Stimme und für Telefonate von hier. Der Pi nutzt seine eigenen Geräte.</p>
        </div>
      </section>}
  </section>;
}
