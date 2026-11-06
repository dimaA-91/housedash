'use client';

/** Bunte Wettersymbole (reines SVG, keine Filter, billig zu zeichnen). Namen wie in src/lib/weather/icons.ts. */
export const weatherLabel: Record<string, string> = {
  sun: 'Sonnig', moon: 'Klar', 'cloud-sun': 'Teils bewölkt', 'cloud-moon': 'Teils bewölkt', cloud: 'Bewölkt',
  'cloud-rain': 'Regen', 'cloud-drizzle': 'Nieselregen', 'cloud-lightning': 'Gewitter', 'cloud-hail': 'Graupel',
  'cloud-fog': 'Nebel', snowflake: 'Schnee', thermometer: 'Wetter',
};

const SunShape = ({ cx, cy, r, rays }: { cx: number; cy: number; r: number; rays: number }) => <g>
  <g stroke="#ffb800" strokeWidth="3" strokeLinecap="round">{Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, a1 = r + 4, a2 = r + rays; return <line key={i} x1={cx + Math.cos(a) * a1} y1={cy + Math.sin(a) * a1} x2={cx + Math.cos(a) * a2} y2={cy + Math.sin(a) * a2} />; })}</g>
  <circle cx={cx} cy={cy} r={r} fill="#ffcc00" />
</g>;
const Moon = () => <path d="M42 10a22 22 0 1 0 12 38A18 18 0 0 1 42 10z" fill="#ffe08a" />;
const Cloud = ({ y = 0, dark = false, x = 0 }: { y?: number; dark?: boolean; x?: number }) => <path transform={`translate(${x} ${y})`} d="M20 46a11 11 0 0 1-1-22 15 15 0 0 1 29-3 12 12 0 0 1 2 25z" fill={dark ? '#8e9aaf' : '#e8eef7'} stroke={dark ? '#6f7b91' : '#c6d0df'} strokeWidth="1.5" />;
const Drops = ({ color = '#3b9bff', n = 3 }: { color?: string; n?: number }) => <g stroke={color} strokeWidth="3.5" strokeLinecap="round">{Array.from({ length: n }, (_, i) => <line key={i} x1={24 + i * 11} y1="50" x2={21 + i * 11} y2="58" />)}</g>;

export default function FamilyWeatherIcon({ name, size = 56 }: { name: string; size?: number }) {
  let body: React.ReactNode;
  switch (name) {
    case 'sun': body = <SunShape cx={32} cy={32} r={13} rays={19} />; break;
    case 'moon': body = <Moon />; break;
    case 'cloud-sun': body = <><SunShape cx={22} cy={22} r={9} rays={14} /><Cloud x={4} y={6} /></>; break;
    case 'cloud-moon': body = <><g transform="translate(-10 -4) scale(.7)"><Moon /></g><Cloud x={4} y={6} /></>; break;
    case 'cloud-rain': body = <><Cloud y={-6} dark /><Drops n={3} /></>; break;
    case 'cloud-drizzle': body = <><Cloud y={-6} /><Drops n={2} color="#7fb8f5" /></>; break;
    case 'cloud-lightning': body = <><Cloud y={-6} dark /><path d="M34 40l-8 11h7l-3 9 10-13h-7z" fill="#ffcc00" /></>; break;
    case 'cloud-hail': body = <><Cloud y={-6} dark /><g fill="#bfe3ff"><circle cx="24" cy="54" r="3" /><circle cx="34" cy="57" r="3" /><circle cx="44" cy="54" r="3" /></g></>; break;
    case 'cloud-fog': body = <><Cloud y={-8} /><g stroke="#b4bfd0" strokeWidth="3.5" strokeLinecap="round"><line x1="14" y1="50" x2="50" y2="50" /><line x1="20" y1="58" x2="56" y2="58" /></g></>; break;
    case 'snowflake': body = <g stroke="#8fd0ff" strokeWidth="3.5" strokeLinecap="round"><line x1="32" y1="8" x2="32" y2="56" /><line x1="11" y1="20" x2="53" y2="44" /><line x1="11" y1="44" x2="53" y2="20" /></g>; break;
    case 'cloud': body = <Cloud y={2} />; break;
    default: body = <Cloud y={2} />;
  }
  return <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={weatherLabel[name] ?? 'Wetter'}>{body}</svg>;
}
