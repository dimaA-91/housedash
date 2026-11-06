'use client';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'housedash.voice.client.v1';
export function readVoiceDevicePreference(): string {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return typeof value.microphoneId === 'string' ? value.microphoneId : ''; } catch { return ''; }
}

/** Mikrofon-Auswahl und Freigabe dieses Browsers. Gilt für jede Sprach-Engine. */
export function useVoiceDevices() {
  const [ready, setReady] = useState(false);
  const [secure, setSecure] = useState(false);
  const [microphoneId, setMicrophoneId] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { if (navigator.mediaDevices?.enumerateDevices) setDevices(await navigator.mediaDevices.enumerateDevices()); } catch { /* permission UI explains access */ }
  }, []);
  useEffect(() => {
    setSecure(window.isSecureContext && !!navigator.mediaDevices?.getUserMedia);
    setMicrophoneId(readVoiceDevicePreference());
    setReady(true);
    void load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
  }, [load]);
  const save = useCallback((value: string) => {
    setMicrophoneId(value);
    try { localStorage.setItem(KEY, JSON.stringify({ microphoneId: value })); } catch { /* current session still works */ }
  }, []);
  const permission = useCallback(async () => {
    setError('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop());
      await load();
    } catch { setError('Mikrofonzugriff nicht verfügbar. HTTPS, Browserfreigabe und angeschlossenes Mikrofon prüfen.'); }
  }, [load]);
  return { ready, secure, microphoneId, inputs: devices.filter(device => device.kind === 'audioinput'), error, save, permission };
}
