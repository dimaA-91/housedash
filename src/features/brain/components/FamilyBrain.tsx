'use client';
import { useCallback, useEffect, useState } from 'react';
import type { BrainOverview } from '@/features/brain/shared';

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function useBrain() {
  const [data, setData] = useState<BrainOverview | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const response = await fetch('/api/family/brain', { cache: 'no-store' }); if (response.ok) setData(await response.json()); } catch { /* letzter Stand bleibt */ }
  }, []);
  const act = useCallback(async (body: Record<string, unknown>) => {
    setError('');
    try {
      const response = await fetch('/api/family/brain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Das hat nicht geklappt.');
      setData(value);
      return true;
    } catch (failure) { setError((failure as Error).message); return false; }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30 * 60_000);
    window.addEventListener('housedash-change', load);
    return () => { clearInterval(timer); window.removeEventListener('housedash-change', load); };
  }, [load]);
  return { data, error, act };
}

/** Schmale Zeile auf Home: höchstens eine Frage und was heute oder morgen dran ist. Ohne Inhalt unsichtbar. */
export function FamilyBrainPrompt({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const { data, act } = useBrain();
  const question = data?.suggestions[0], reminders = data?.reminders ?? [];
  if (!question && !reminders.length) return null;
  return <div className="family-brain-prompt" role="status">
    {reminders.map(item => <span className="family-brain-reminder" key={item.id}>{item.text}</span>)}
    {question && <div className="family-brain-question">
      <p>{question.question}</p>
      {question.kind === 'pattern'
        ? <><button type="button" className="family-primary" onClick={() => void act({ action: 'answer', key: question.key, accept: true })}>Ja, merken</button><button type="button" onClick={() => void act({ action: 'answer', key: question.key, accept: false })}>Nicht merken</button></>
        : <><button type="button" className="family-primary" onClick={() => { if (question.eventId) onOpenEvent(question.eventId); }}>Eintragen</button><button type="button" onClick={() => void act({ action: 'answer', key: question.key, accept: false })}>Nicht nötig</button></>}
    </div>}
  </div>;
}

/** Seite unter Mehr: Alles sehen, korrigieren und endgültig löschen. */
export default function FamilyBrain() {
  const { data, error, act } = useBrain();
  const [text, setText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  return <div className="family-settings family-brain">
    {error && <p role="alert" className="family-error">{error}</p>}
    {!data ? <p role="status" className="family-hint">Wird geladen …</p> : <>
      <section className="family-tile">
        <label className="family-switch"><input type="checkbox" role="switch" checked={data.enabled} onChange={event => void act({ action: 'enabled', enabled: event.target.checked })} /><span className="family-switch-track" aria-hidden="true" /><span>Family Brain {data.enabled ? 'ein' : 'aus'}</span></label>
        <p className="family-hint">Gespeichert wird nur, was ihr bestätigt, und nur hier auf dem Pi. Zur KI gehen einzelne passende Einträge, wenn eine Frage dazu passt, nie die ganze Liste. Passwörter und Bankdaten werden abgelehnt.</p>
      </section>
      {data.enabled && data.suggestions.length > 0 && <section className="family-tile"><h3>Offene Fragen</h3>
        <ul className="family-brain-list">{data.suggestions.map(item => <li key={item.key}><span><strong>{item.question}</strong><small>{item.kind === 'pattern' ? 'Vermutung aus euren Terminen' : 'Wissenslücke'}</small></span>{item.kind === 'pattern' && <button type="button" className="family-primary" onClick={() => void act({ action: 'answer', key: item.key, accept: true })}>Ja, merken</button>}<button type="button" onClick={() => void act({ action: 'answer', key: item.key, accept: false })}>{item.kind === 'pattern' ? 'Nicht merken' : 'Nicht nötig'}</button></li>)}</ul>
      </section>}
      <section className="family-tile"><h3>Das weiß Family Brain · {data.items.length}</h3>
        {data.enabled && <form className="family-brain-add" onSubmit={async event => { event.preventDefault(); if (await act({ action: 'add', text })) setText(''); }}><input value={text} maxLength={200} placeholder="Zum Beispiel: Jonas mag keine Pilze" aria-label="Neuer Eintrag" onChange={event => setText(event.target.value)} /><button type="submit" className="family-primary" disabled={!text.trim()}>Merken</button></form>}
        {data.items.length === 0 ? <p className="family-hint">Noch nichts gespeichert. Sag zum Beispiel: „Merk dir, dass Jonas keine Pilze mag.“</p>
          : <ul className="family-brain-list">{data.items.map(item => <li key={item.id}><span><strong>{item.text}</strong><small>{[item.person, item.weekday !== null ? DAYS[item.weekday] : '', item.source === 'said' ? 'von euch gesagt' : 'aus Terminen erkannt, von euch bestätigt', new Date(item.createdAt).toLocaleDateString('de-DE')].filter(Boolean).join(' · ')}</small></span><button type="button" onClick={() => void act({ action: 'remove', id: item.id })}>Löschen</button></li>)}</ul>}
        {data.items.length > 0 && (confirmClear
          ? <div className="family-brain-clear"><button type="button" className="family-danger" onClick={async () => { await act({ action: 'clear' }); setConfirmClear(false); }}>Wirklich alles löschen?</button><button type="button" onClick={() => setConfirmClear(false)}>Abbrechen</button></div>
          : <button type="button" onClick={() => setConfirmClear(true)}>Alles löschen</button>)}
        <p className="family-hint">Gelöschtes verschwindet sofort. In bereits erstellten Sicherungen bleibt es, bis sie gelöscht werden.</p>
      </section>
    </>}
  </div>;
}
