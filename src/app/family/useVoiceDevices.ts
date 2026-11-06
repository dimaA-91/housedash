'use client';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'housedash.voice.client.v1';
interface DevicePreference { microphoneId: string; speakerId: string }
function readPreference(): DevicePreference {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { microphoneId: typeof value.microphoneId === 'string' ? value.microphoneId : '', speakerId: typeof value.speakerId === 'string' ? value.speakerId : '' };
  } catch { return { microphoneId: '', speakerId: '' }; }
}
export const readVoiceDevicePreference = () => readPreference().microphoneId;
export const readSpeakerPreference = () => readPreference().speakerId;
/** Chrome and Edge can route audio to a chosen output; Safari (iPad, iPhone) cannot. */
export const canChooseSpeaker = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
const SYSTEM_ALIASES = new Set(['default', 'communications']);

/** Mikrofon- und Lautsprecher-Auswahl und Freigabe dieses Browsers. Gilt für jede Sprach-Engine. */
export function useVoiceDevices() {
  const [ready, setReady] = useState(false);
  const [secure, setSecure] = useState(false);
  const [microphoneId, setMicrophoneId] = useState('');
  const [speakerId, setSpeakerId] = useState('');
  const [speakerSupported, setSpeakerSupported] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { if (navigator.mediaDevices?.enumerateDevices) setDevices(await navigator.mediaDevices.enumerateDevices()); } catch { /* permission UI explains access */ }
  }, []);
  useEffect(() => {
    setSecure(window.isSecureContext && !!navigator.mediaDevices?.getUserMedia);
    setMicrophoneId(readVoiceDevicePreference());
    setSpeakerId(readSpeakerPreference());
    setSpeakerSupported(canChooseSpeaker());
    setReady(true);
    void load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
  }, [load]);
  const store = (next: Partial<DevicePreference>) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...readPreference(), ...next })); } catch { /* current session still works */ }
  };
  const save = useCallback((value: string) => { setMicrophoneId(value); store({ microphoneId: value }); }, []);
  const saveSpeaker = useCallback((value: string) => { setSpeakerId(value); store({ speakerId: value }); }, []);
  const permission = useCallback(async () => {
    setError('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop());
      await load();
    } catch { setError('Mikrofonzugriff nicht verfügbar. HTTPS, Browserfreigabe und angeschlossenes Mikrofon prüfen.'); }
  }, [load]);
  const named = (kind: MediaDeviceKind) => devices.filter(device => device.kind === kind && device.deviceId && !SYSTEM_ALIASES.has(device.deviceId));
  return { ready, secure, microphoneId, speakerId, speakerSupported, inputs: devices.filter(device => device.kind === 'audioinput'), outputs: named('audiooutput'), error, save, saveSpeaker, permission };
}
