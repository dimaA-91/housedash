'use client';
import { useEffect, useRef, useState } from 'react';

type Field = HTMLInputElement | HTMLTextAreaElement;
const isText = (el: EventTarget | null): el is Field => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ['text', 'search', 'password', 'email', 'tel', 'url'].includes(el.type));
/** Handys und Tablets haben eine eigene Tastatur, die Bildschirmtastatur ist für das Wanddisplay ohne Tastatur. */
/**
 * Handys und Tablets haben eine eigene Tastatur, unsere erscheint dort nie. Das gilt auch für ein iPad, das sich als Mac meldet,
 * und für jedes Fenster unter 900 px Breite (das ist das Handy-Layout). Das Display am Pi ist breiter und hat keine eigene Tastatur.
 */
export const hasOwnKeyboard = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) || window.innerWidth < 900;

/**
 * Bildschirmtastatur: öffnet sich, sobald ein Textfeld angetippt wird, und bleibt beim Tippen offen.
 * Sie schließt mit "Fertig", beim Antippen außerhalb von Feld und Tastatur, wenn das Feld verschwindet
 * oder wenn jemand an einer echten Tastatur tippt.
 */
export default function TouchKeyboard() {
  const target = useRef<Field | null>(null);
  const board = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [shift, setShift] = useState(false);
  // Am Display (ohne eigene Tastatur) liegen Dialoge immer im oberen Teil, über dem Platz der Tastatur. So springt ein Dialog nicht, wenn die Tastatur aufgeht.
  useEffect(() => {
    const mark = () => { if (hasOwnKeyboard()) delete document.documentElement.dataset.screenKeyboard; else document.documentElement.dataset.screenKeyboard = '1'; };
    mark(); window.addEventListener('resize', mark);
    return () => { window.removeEventListener('resize', mark); delete document.documentElement.dataset.screenKeyboard; };
  }, []);
  useEffect(() => {
    const focusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!isText(el)) return;
      target.current = el;
      if (hasOwnKeyboard()) return;
      // Beim Start eines Textes zuerst ein Großbuchstabe, wie auf dem Handy (nicht bei Passwort, Adressen und Zahlen).
      setShift(el.value === '' && (el instanceof HTMLTextAreaElement || ['text', 'search'].includes(el.type)));
      setVisible(true);
      // Im Vollbild-Gespräch gibt es nichts zu scrollen, und die Seite dahinter soll stehen bleiben.
      if (!el.closest('.family-intelligence-overlay')) window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
    };
    // Erst nach dem Tipp schließen: Beim Aufsetzen des Fingers würde sich das Layout verschieben und der Tipp ins Leere gehen.
    const outsideTap = (event: MouseEvent) => {
      const el = event.target as Element | null;
      if (el?.closest?.('.touch-keyboard') || isText(el)) return;
      // Öffnet dieser Tipp einen Dialog, dessen Titelfeld sofort den Fokus bekommt (autoFocus), muss die Tastatur offen bleiben.
      if (isText(document.activeElement) && target.current === document.activeElement) return;
      setVisible(false);
    };
    const keyDown = (event: KeyboardEvent) => { if (event.isTrusted) setVisible(false); };
    document.addEventListener('focusin', focusIn);
    document.addEventListener('click', outsideTap);
    document.addEventListener('keydown', keyDown);
    return () => { document.removeEventListener('focusin', focusIn); document.removeEventListener('click', outsideTap); document.removeEventListener('keydown', keyDown); };
  }, []);
  // Verschwindet das Feld (zum Beispiel beim Schließen eines Formulars), geht auch die Tastatur weg.
  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => { if (!target.current?.isConnected) setVisible(false); }, 500);
    return () => window.clearInterval(timer);
  }, [visible]);
  const repeat = useRef<{ wait?: number; tick?: number }>({});
  function insert(key: string) {
    const el = target.current;
    if (!el?.isConnected) { setVisible(false); return; }
    if (key === '↵') {
      if (el instanceof HTMLTextAreaElement) key = '\n';
      else { el.form?.requestSubmit(); return; }
    }
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
    const from = key === '⌫' && start === end ? Math.max(0, start - 1) : start;
    const letter = /\p{L}/u.test(key) && key !== 'ß';
    const text = key === '⌫' ? '' : letter && shiftRef.current ? key.toUpperCase() : key;
    const value = el.value.slice(0, from) + text + el.value.slice(end);
    if (el.maxLength >= 0 && value.length > el.maxLength) return;
    const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    try { el.setSelectionRange(from + text.length, from + text.length); } catch { /* email inputs have no selection API */ }
    if (shiftRef.current && key !== '⌫') setShift(false);
  }
  const shiftRef = useRef(false);
  shiftRef.current = shift;
  function stopRepeat() { window.clearTimeout(repeat.current.wait); window.clearInterval(repeat.current.tick); }
  useEffect(() => stopRepeat, []);
  // Löschen wiederholt sich, solange man die Taste hält (nach kurzer Pause, dann schneller).
  const holdProps = {
    onPointerDown: (e: React.PointerEvent) => { if (e.button !== 0) return; insert('⌫'); stopRepeat(); repeat.current.wait = window.setTimeout(() => { repeat.current.tick = window.setInterval(() => insert('⌫'), 55); }, 420); },
    onPointerUp: stopRepeat, onPointerLeave: stopRepeat, onPointerCancel: stopRepeat,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insert('⌫'); } },
  };
  function done() { target.current?.blur(); setVisible(false); }
  if (!visible) return null;
  const key = (k: string, extra?: { className?: string; label?: string }) => <button type="button" key={k} className={extra?.className} onClick={() => insert(k)}>{extra?.label ?? (shift && /\p{L}/u.test(k) && k !== 'ß' ? k.toUpperCase() : k)}</button>;
  const letters = (row: string) => [...row].map(k => key(k));
  // Tasten nehmen dem Feld nie den Fokus, damit die Tastatur beim Tippen offen bleibt.
  // Anordnung wie auf einer deutschen Tastatur: Löschen oben rechts, Eingabe rechts neben ä, Umschalten links unten.
  return <aside ref={board} className="touch-keyboard" aria-label="Deutsche Bildschirmtastatur" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}>
    <div>{letters('1234567890ß')}<button type="button" className="wide" aria-label="Löschen" {...holdProps}>⌫</button></div>
    <div>{letters('qwertzuiopü')}<span className="gap" aria-hidden="true" /></div>
    <div>{letters('asdfghjklöä')}<button type="button" className="wide enter" aria-label="Eingabe" onClick={() => insert('↵')}>↵</button></div>
    <div><button type="button" className="wide" aria-pressed={shift} aria-label="Großschreibung" onClick={() => setShift(!shift)}>⇧</button>{letters('yxcvbnm')}{key(',')}{key('.')}{key('-')}{key('?')}</div>
    <div>{key('@')}{key('!')}{key(':')}<button type="button" className="space" onClick={() => insert(' ')}>Leertaste</button>{key('/')}{key('_')}<button type="button" className="family-primary wide" onClick={done}>Fertig</button></div>
  </aside>;
}
