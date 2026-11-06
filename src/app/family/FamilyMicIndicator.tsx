'use client';
import { useEffect, useState } from 'react';
import { microphoneOpen } from './client-audio';
import { useFamilyPhone } from './FamilyPhoneContext';

/**
 * Shows "Mikrofon aktiv" whenever a microphone is open: one of this browser's (assistant, phone in a browser) or the
 * Pi's during a call. Nothing else listens, so when this is not shown, no microphone is on.
 */
export default function FamilyMicIndicator() {
  const [browserOpen, setBrowserOpen] = useState(false);
  const { state } = useFamilyPhone();
  useEffect(() => {
    const check = () => setBrowserOpen(microphoneOpen());
    check();
    const timer = window.setInterval(check, 1000);
    window.addEventListener('housedash-mic', check);
    return () => { window.clearInterval(timer); window.removeEventListener('housedash-mic', check); };
  }, []);
  const call = state.call;
  const piOpen = !!call && call.audioHost === 'pi' && call.phase === 'active' && !call.muted && !call.listenOnly;
  if (!browserOpen && !piOpen) return null;
  return <span className="family-mic" role="status" aria-label="Mikrofon ist an"><i aria-hidden="true" />Mikrofon aktiv{piOpen && !browserOpen ? ' · Pi' : ''}</span>;
}
