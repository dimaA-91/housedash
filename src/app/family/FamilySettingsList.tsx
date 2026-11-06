'use client';

export type SettingsPage = 'family' | 'icons' | 'apple' | 'waste' | 'brain' | 'voice' | 'wifi' | 'transit' | 'display' | 'idle' | 'system' | 'software';

/** Einstellungen wie auf dem iPad: Gruppen mit farbigem Symbol, Name und kurzer Beschreibung. */
const GROUPS: { title: string; items: { id: SettingsPage; label: string; hint: string; color: string; icon: React.ReactNode }[] }[] = [
  { title: 'Familie & Kalender', items: [
    { id: 'family', label: 'Familie', hint: 'Namen, Geburtstage, Farben', color: '#f472b6', icon: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.2c2.6-.4 5 1 5.6 4.8" /></> },
    { id: 'icons', label: 'Kalendersymbole', hint: 'Begriffe und Vorschau', color: '#2f5fd0', icon: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /></> },
    { id: 'apple', label: 'Apple Kalender', hint: 'Abonnement · nur lesen', color: '#d8232f', icon: <><path d="M12 7c1-2.5 3-3 4-3-.2 1.6-1 3-4 3Z" /><path d="M16.5 9.5c-1.6-.9-3-.3-4.5.3-1.5-.6-2.9-1.2-4.5-.3C5 10.9 5 15 7 18c1 1.5 2.2 2.4 3.5 1.8.9-.4 2.1-.4 3 0 1.3.6 2.5-.3 3.5-1.8 1-1.4 1.5-2.8 1.6-4-1.8-.7-2.5-2.9-2.1-4.5Z" /></> },
    { id: 'waste', label: 'Müllabfuhr', hint: 'Abfallkalender importieren', color: '#6a6f78', icon: <><path d="M5 7h14M10 4h4M7 7l1 13h8l1-13" /><path d="M10.5 11v6M13.5 11v6" /></> },
  ] },
  { title: 'Intelligenz', items: [
    { id: 'brain', label: 'Family Brain', hint: 'Was sich HouseDash merkt', color: '#a855f7', icon: <><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.5A3 3 0 0 0 8 17a3 3 0 0 0 4 2V5a2 2 0 0 0-3-1ZM15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.5A3 3 0 0 1 16 17a3 3 0 0 1-4 2" /></> },
    { id: 'voice', label: 'OpenAI & Sprache', hint: 'Anmeldung, Stimme, Mikrofon', color: '#10a37f', icon: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></> },
  ] },
  { title: 'Verbindungen', items: [
    { id: 'wifi', label: 'WLAN', hint: 'Netz wählen und verbinden', color: '#0a84ff', icon: <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 15.8a5 5 0 0 1 6.8 0" /><circle cx="12" cy="19" r="1.2" /></> },
    { id: 'transit', label: 'Straßenbahn', hint: 'Haltestellen und Linie', color: '#f59e0b', icon: <><rect x="5" y="6" width="14" height="11" rx="3" /><path d="M5 12h14M9 3h6M12 3v3M8 20l1.5-3M16 20l-1.5-3" /></> },
  ] },
  { title: 'Anzeige & System', items: [
    { id: 'display', label: 'Anzeige', hint: 'Dunkles Design, Vollbild, Home', color: '#334155', icon: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></> },
    { id: 'idle', label: 'Ruhe-Ansicht', hint: 'Abdunkeln und Bilder', color: '#4f46e5', icon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /> },
    { id: 'system', label: 'System & Sicherung', hint: 'Wetterort, Passwort, Backups', color: '#64748b', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></> },
    { id: 'software', label: 'Software', hint: 'Version und Updates', color: '#2f5fd0', icon: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 19h14" /></> },
  ] },
];

export const SETTINGS_TITLES: Record<SettingsPage, string> = Object.fromEntries(GROUPS.flatMap(g => g.items.map(i => [i.id, i.label]))) as Record<SettingsPage, string>;

export default function FamilySettingsList({ current, onPick }: { current: SettingsPage | null; onPick: (page: SettingsPage) => void }) {
  return <nav className="family-settings-list" aria-label="Einstellungen">
    {GROUPS.map(group => <section key={group.title}>
      <h3>{group.title}</h3>
      <ul>{group.items.map(item => <li key={item.id}>
        <button type="button" aria-current={current === item.id ? 'page' : undefined} onClick={() => onPick(item.id)}>
          <span className="family-settings-icon" style={{ background: item.color }} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
          </span>
          <span className="family-settings-label"><strong>{item.label}</strong><small>{item.hint}</small></span>
          <svg className="family-settings-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </li>)}</ul>
    </section>)}
  </nav>;
}
