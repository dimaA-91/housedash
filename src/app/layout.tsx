import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'HouseDash',
  description: 'Deine lokale Familienzentrale',
  // Als Web-App zum Home-Bildschirm (iPhone, iPad): Vollbild ohne Safari-Leiste. Next schreibt je nach Version nur
  // "mobile-web-app-capable", iOS liest aber weiterhin "apple-mobile-web-app-capable", deshalb steht beides drin.
  appleWebApp: { capable: true, title: 'HouseDash', statusBarStyle: 'default' },
  other: { 'apple-mobile-web-app-capable': 'yes' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="de"><body>{children}</body></html>;
}
