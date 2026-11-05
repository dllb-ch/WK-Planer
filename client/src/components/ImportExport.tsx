import { useEffect, useRef, useState } from 'react';
import { errMsg, useToast } from './ui';

/** Menu with Excel/JSON export and import (file picker). */
export function ImportExportMenu({
  onExport,
  onImport,
  label = 'Import / Export',
}: {
  onExport: (format: 'xlsx' | 'json') => Promise<void> | void;
  /** Without it only export is offered. */
  onImport?: (file: File) => Promise<string | void>;
  label?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const run = async (fn: () => Promise<string | void> | void) => {
    setOpen(false);
    try {
      const msg = await fn();
      if (msg) toast(msg);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const item = 'block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50';
  return (
    <div className="relative" ref={ref}>
      <button
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <button className={item} onClick={() => run(() => onExport('xlsx'))}>
            Export als Excel (.xlsx)
          </button>
          <button className={item} onClick={() => run(() => onExport('json'))}>
            Export als JSON
          </button>
          {onImport && (
            <label className={`${item} cursor-pointer border-t border-slate-100`}>
              Import aus Excel oder JSON …
              <input
                type="file"
                accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) run(() => onImport(f));
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
