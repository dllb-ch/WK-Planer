// Table of rows with free-text cells (contacts, risks, tasks, Drehbuch …): add, remove, move.
import type { ReactNode } from 'react';
import { Button } from './ui';
import { useT } from '../i18n';

export interface RowColumn<T> {
  key: keyof T & string;
  label: string;
  /** CSS grid width, e.g. '6rem' or '2fr'. */
  width?: string;
  multiline?: boolean;
  placeholder?: string;
  /** Own cell (e.g. a select or checkbox). */
  render?: (row: T, set: (patch: Partial<T>) => void, readOnly: boolean) => ReactNode;
}

export function RowsEditor<T extends object>({
  rows,
  columns,
  onChange,
  readOnly,
  empty,
  addLabel,
}: {
  rows: T[];
  columns: RowColumn<T>[];
  onChange: (rows: T[]) => void;
  readOnly: boolean;
  empty: () => T;
  addLabel?: string;
}) {
  const { t } = useT();
  const grid = { gridTemplateColumns: `${columns.map((c) => c.width ?? '1fr').join(' ')}${readOnly ? '' : ' 2.5rem'}` };
  const set = (i: number, patch: Partial<T>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <div className="min-w-[36rem] space-y-1">
          <div className="grid gap-1.5 text-xs font-medium text-slate-500" style={grid}>
            {columns.map((c) => (
              <span key={c.key}>{c.label}</span>
            ))}
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid items-start gap-1.5" style={grid}>
              {columns.map((c) =>
                c.render ? (
                  <div key={c.key}>{c.render(r, (p) => set(i, p), readOnly)}</div>
                ) : readOnly ? (
                  <div key={c.key} className="whitespace-pre-wrap rounded border border-slate-100 px-2 py-1 text-sm">
                    {String(r[c.key] ?? '') || '–'}
                  </div>
                ) : c.multiline ? (
                  <textarea
                    key={c.key}
                    rows={2}
                    className="input text-sm"
                    placeholder={c.placeholder}
                    value={String(r[c.key] ?? '')}
                    onChange={(e) => set(i, { [c.key]: e.target.value } as Partial<T>)}
                  />
                ) : (
                  <input
                    key={c.key}
                    className="input text-sm"
                    placeholder={c.placeholder}
                    value={String(r[c.key] ?? '')}
                    onChange={(e) => set(i, { [c.key]: e.target.value } as Partial<T>)}
                  />
                ),
              )}
              {!readOnly && (
                <span className="flex flex-col items-center text-xs leading-none text-slate-400">
                  <button disabled={i === 0} onClick={() => move(i, -1)} className="hover:text-zs-blue disabled:opacity-30" aria-label={t('tpl.up')}>
                    ▲
                  </button>
                  <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="py-0.5 hover:text-red-600" aria-label={t('common.remove')}>
                    ✕
                  </button>
                  <button disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="hover:text-zs-blue disabled:opacity-30" aria-label={t('tpl.down')}>
                    ▼
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {!readOnly && (
        <Button className="text-xs" onClick={() => onChange([...rows, empty()])}>
          {addLabel ?? t('rows.add')}
        </Button>
      )}
    </div>
  );
}
