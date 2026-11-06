export default function ConversationIcon({ name }: { name: 'close' | 'trash' | 'send' | 'mic' | 'muted' | 'sound' | 'end' | 'refresh' | 'check' | 'more' | 'keyboard' | 'history' }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
    {name === 'trash' && <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>}
    {name === 'send' && <path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14" />}
    {(name === 'mic' || name === 'muted') && <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />{name === 'muted' && <path d="m3 3 18 18" />}</>}
    {name === 'sound' && <><path d="m11 4-6 5H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16" /></>}
    {name === 'end' && <path d="M3 15v-4c6-4 12-4 18 0v4h-5v-4M8 11v4H3" />}
    {name === 'refresh' && <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a8 8 0 0 1 14 5M18 17A8 8 0 0 1 4 12" /></>}
    {name === 'check' && <path d="m4 12 5 5L20 6" />}
    {name === 'more' && <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>}
    {name === 'keyboard' && <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>}
    {name === 'history' && <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>}
  </svg>;
}
