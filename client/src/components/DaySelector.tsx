import { useEffect, useRef, useState } from 'react';
import type { Wk } from '@shared/types';
import { canSeeDay } from '@shared/permissions';
import { fmtDate, isAvorDay, isKvkDay, weekday, wkDays } from '@shared/util';
import { useUser } from '../auth';

/** Visible days of a WK, remembered per WK and view in this browser. */
export function useDaySelection(wk: Wk, view: string) {
  const me = useUser();
  // AVOR days only for those taking part.
  const all = wkDays(wk).filter((d) => canSeeDay(me, wk, d));
  const key = `days:${view}:${wk.id}`;
  const [stored, setStored] = useState<string[] | null>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null');
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  });
  const selected = stored ? all.filter((d) => stored.includes(d)) : all;
  const set = (days: string[]) => {
    setStored(days);
    try {
      localStorage.setItem(key, JSON.stringify(days));
    } catch {
      /* ignore */
    }
  };
  return { all, days: selected.length ? selected : all, set };
}

export function DaySelector({ wk, all, days, onChange }: { wk: Wk; all: string[]; days: string[]; onChange: (d: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const avor = all.filter((d) => isAvorDay(wk, d));
  const kvk = all.filter((d) => isKvkDay(wk, d));
  const main = all.filter((d) => !isAvorDay(wk, d) && !isKvkDay(wk, d));
  const toggle = (d: string) => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  const group = (title: string, list: string[]) =>
    list.length > 0 && (
      <div>
        <div className="label !mb-0.5">{title}</div>
        {list.map((d) => (
          <label key={d} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={days.includes(d)} onChange={() => toggle(d)} />
            {weekday(d).slice(0, 2)} {fmtDate(d)}
          </label>
        ))}
      </div>
    );

  return (
    <div className="relative" ref={ref}>
      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Tage {days.length < all.length ? `${days.length}/${all.length}` : '(alle)'} ▾
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-60 space-y-2 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          <div className="flex flex-wrap gap-1">
            {[
              ['Alle', all],
              ['Nur WK', main],
              ['Nur AVOR', avor],
            ].map(([label, list]) => (
              <button
                key={label as string}
                className="rounded border px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-40"
                disabled={(list as string[]).length === 0}
                onClick={() => onChange(list as string[])}
              >
                {label as string}
              </button>
            ))}
          </div>
          {group('AVOR (Kp Kdo)', avor)}
          {group('KVK', kvk)}
          {group('WK', main)}
        </div>
      )}
    </div>
  );
}
