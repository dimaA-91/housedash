'use client';
export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="de"><body style={{ margin: 32, fontFamily: 'system-ui' }}><h1>HouseDash ist gerade nicht verfügbar.</h1><button style={{ minHeight: 48 }} onClick={reset}>Erneut versuchen</button></body></html>;
}
