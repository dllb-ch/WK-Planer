import { useState } from 'react';
import { fmtDate } from '@shared/util';
import { Button } from './ui';

/** Several dates (e.g. KVK or AVOR days) as chips with an input to add more. */
export function DatesEditor({
  value,
  onChange,
  label = 'KVK-Tag',
  tone = 'bg-amber-100 text-amber-900',
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
  tone?: string;
}) {
  const [next, setNext] = useState('');
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {value.map((d) => (
          <span key={d} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${tone}`}>
            {fmtDate(d)}
            <button className="hover:text-red-600" onClick={() => onChange(value.filter((x) => x !== d))} aria-label={`${fmtDate(d)} entfernen`}>
              ✕
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-slate-400">Noch keine</span>}
      </div>
      <div className="flex gap-1">
        <input type="date" className="input !px-1" value={next} onChange={(e) => setNext(e.target.value)} aria-label={label} />
        <Button
          className="!px-2"
          disabled={!next || value.includes(next)}
          onClick={() => {
            onChange([...value, next].sort());
            setNext('');
          }}
          aria-label={`${label} hinzufügen`}
        >
          +
        </Button>
      </div>
    </div>
  );
}
