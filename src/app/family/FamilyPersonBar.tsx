'use client';
import type { FamilyMember } from '@/types/family';

/** Readable initial on the member's colour: dark text on light colours, white on dark ones. */
export function inkFor(color: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return '#fff';
  const [r, g, b] = [0, 2, 4].map(at => parseInt(hex.slice(at, at + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#1b1f24' : '#fff';
}

/**
 * One circle per person. Tapping one shows only that person's appointments (plus everything that belongs to the whole
 * family, such as bin collection); tapping it again shows everyone. The same bar sits in the header of Home and Calendar.
 */
export default function FamilyPersonBar({ members, selected, onSelect }: { members: FamilyMember[]; selected: string | null; onSelect: (id: string | null) => void }) {
  if (members.length < 2) return null;
  return <div className={`family-personbar${selected ? ' filtering' : ''}`} role="group" aria-label="Termine nach Person zeigen">
    {members.map(member => {
      const active = selected === member.id;
      return <button type="button" key={member.id} className="family-personchip" aria-pressed={active} aria-label={active ? `${member.name}: Filter aufheben` : `Nur ${member.name} zeigen`} title={member.name}
        style={{ '--person': member.color, '--person-ink': inkFor(member.color) } as React.CSSProperties} onClick={() => onSelect(active ? null : member.id)}>
        {member.emoji || member.name.slice(0, 1).toUpperCase()}
      </button>;
    })}
    {selected && <span className="family-personbar-label">{members.find(member => member.id === selected)?.name}</span>}
  </div>;
}
