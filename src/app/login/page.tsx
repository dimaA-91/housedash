'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TouchKeyboard from '../family/TouchKeyboard';
import '../family/family.css';
import '../family/design.css';
export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void fetch('/api/auth/status', { cache: 'no-store' }).then(r => r.json()).then(s => {
      if ((!s.authEnabled || s.authenticated) && !s.ipRestricted) router.replace('/family');
      if (s.ipRestricted) setError('Dieses Gerät darf laut Netzwerkeinstellung nicht auf HouseDash zugreifen.');
    }).catch(() => setError('Der Pi ist gerade nicht erreichbar.'));
  }, [router]);
  return <main className="family-shell"><TouchKeyboard /><section className="family-login-card"><h1>Willkommen bei HouseDash</h1><p>Mit eurem Familienpasswort anmelden.</p>
    <form className="family-system-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, rememberMe: true }) });
        if (!response.ok) { const value = await response.json(); throw new Error(value.code === 'rate_limited' ? 'Zu viele Versuche. Bitte später erneut anmelden.' : response.status === 401 ? 'Das Passwort stimmt nicht.' : 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte erneut versuchen.'); }
        setPassword(''); router.replace('/family');
      } catch (failure) { setError(failure instanceof Error && failure.name !== 'TypeError' ? failure.message : 'Der Pi ist gerade nicht erreichbar.'); }
      finally { setBusy(false); }
    }}><label>Familienpasswort<input type="password" value={password} maxLength={256} required autoComplete="current-password" onChange={event => setPassword(event.target.value)} /></label>
      {error && <p role="alert" className="family-error">{error}</p>}<button type="submit" className="family-primary" disabled={busy}>Anmelden</button></form></section></main>;
}
