'use client';
import { useEffect, useRef } from 'react';

export type Tab = 'home' | 'calendar' | 'tasks' | 'phone' | 'more';

const icons: Record<Tab, React.ReactNode> = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  tasks: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M8 12.5l3 3 5-6" /></>,
  phone: <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z" />,
  more: <><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></>,
};
const labels: Record<Tab, string> = { home: 'Home', calendar: 'Kalender', tasks: 'Aufgaben', phone: 'Telefon', more: 'Mehr' };

/** Seitenleiste links (Wanddisplay) bzw. Leiste unten (Handy). Unten steht der Verbindungsstatus. */
export default function FamilyTabs({ tab, onChange, connected, onHomeLongPress }: { tab: Tab; onChange: (tab: Tab) => void; connected: boolean; onHomeLongPress?: () => void }) {
  // Langes Drücken (0,6 s) auf „Home“ öffnet die Auswahl der Home-Anordnung. Der Tipp danach soll nicht zusätzlich Home öffnen.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const stop = () => { if (press.current) { window.clearTimeout(press.current.timer); press.current = null; } };
  useEffect(() => stop, []);
  const homeProps = onHomeLongPress ? {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false; stop();
      press.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => { press.current = null; fired.current = true; onHomeLongPress(); }, 600) };
    },
    onPointerMove: (e: React.PointerEvent) => { if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 14) stop(); },
    onPointerUp: stop, onPointerCancel: stop, onPointerLeave: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  } : {};
  return <nav className="family-tabs" aria-label="Bereiche">
    {(Object.keys(labels) as Tab[]).map(key => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => { if (key === 'home' && fired.current) { fired.current = false; return; } onChange(key); }} {...(key === 'home' ? homeProps : {})}>
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[key]}</svg>
      <span>{labels[key]}</span>
    </button>)}
    <div className="family-tabs-status" title={connected ? 'Live verbunden' : 'Verbindung wird aufgebaut'}>Live<br /><i className={connected ? 'online' : 'offline'} /></div>
  </nav>;
}
