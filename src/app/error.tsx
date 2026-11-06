'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main style={{ padding: 32 }}><h1>HouseDash konnte diese Seite nicht laden.</h1><p>Bitte versuche es erneut. Deine gespeicherten Daten bleiben erhalten.</p><button style={{ minHeight: 48 }} onClick={reset}>Erneut versuchen</button></main>;
}
