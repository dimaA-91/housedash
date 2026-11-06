'use client';
import { useEffect, useState } from 'react';
import { prepareClientAudio } from './client-audio';

/** Animiert nur Transform und Deckkraft und pausiert, solange die Seite nicht sichtbar ist. */
export default function FamilyIntelligence({ onClick }: { onClick: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const change = () => setVisible(document.visibilityState === 'visible');
    change(); document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return <button type="button" className={`family-intelligence${visible ? '' : ' paused'}`} onClick={() => { try { prepareClientAudio(); } catch { /* Text remains available. */ } onClick(); }} aria-label="HouseDash Intelligence öffnen und sprechen" title="Sprechen oder Kalenderauftrag eingeben">
    <span className="family-intelligence-orb" aria-hidden="true"><i /><i /><i /><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6" /></svg></span>
    <span className="family-intelligence-label">Intelligence<small>Antippen & sprechen</small></span>
  </button>;
}
