// Grouped lists as in iOS forms (SwiftUI `Form` / `Section`): caption above, rounded cell, rows with hairlines.
import { forwardRef, useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

/** Section of a form; the number badge turns green with a check mark once `done`. */
export function Group({
  n,
  title,
  done,
  aside,
  foot,
  children,
  className = '',
}: {
  n?: number;
  title: ReactNode;
  done?: boolean;
  aside?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-[30px] ${className}`}>
      <h2 className="group-head">
        {n !== undefined && (
          <span
            className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full text-[11px] font-semibold transition-colors ${done ? 'bg-emerald-500 text-white' : 'bg-slate-300/70 text-slate-600'}`}
            aria-label={done ? 'erledigt' : undefined}
          >
            {done ? '✓' : n}
          </span>
        )}
        <span>{title}</span>
        {aside && <span className="ml-auto normal-case tracking-normal">{aside}</span>}
      </h2>
      <div className="group-list">{children}</div>
      {foot && <div className="group-foot">{foot}</div>}
    </section>
  );
}

/** Label left, control right (one line). */
export function Row({ label, children, htmlFor }: { label: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 pl-4 pr-2.5">
      <label htmlFor={htmlFor} className="w-[104px] flex-none sm:w-[132px]">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

/** Small label above, control below (multi-line text). */
export function StackRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5">
      <span className="text-[13px] text-slate-500">{label}</span>
      {children}
    </div>
  );
}

/** Text field without frame, for rows. */
export const CellInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function CellInput(p, ref) {
  return <input ref={ref} {...p} className={`cell-input ${p.className ?? ''}`} />;
});

/** Text area without frame that grows with its content. */
export function CellTextArea({ minRows = 2, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [p.value]);
  return <textarea ref={ref} rows={minRows} {...p} className={`cell-input resize-none overflow-hidden !py-0.5 leading-snug ${p.className ?? ''}`} />;
}

/** Row to pick one of several options (title, description, check mark in the tint). */
export function ChoiceRow({ title, detail, checked, onClick }: { title: ReactNode; detail?: ReactNode; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick} className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-500/5">
      <span className="min-w-0 flex-1">
        <span className="block">{title}</span>
        {detail && <span className="block text-[13px] text-slate-500">{detail}</span>}
      </span>
      <span className={`text-lg text-zs-blue ${checked ? '' : 'invisible'}`} aria-hidden>
        ✓
      </span>
    </button>
  );
}

/** «+ Add …» row in the tint. */
export function AddRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left text-zs-blue hover:bg-slate-500/5">
      <span className="text-xl leading-none" aria-hidden>
        +
      </span>
      {children}
    </button>
  );
}

/** Small round icon button (trash, arrows) in rows. */
export function IconButton({ label, destructive, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; destructive?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...p}
      className={`grid h-8 w-8 flex-none place-items-center rounded-lg text-slate-400 hover:bg-slate-500/10 disabled:pointer-events-none disabled:opacity-35 ${destructive ? 'hover:text-red-500' : 'hover:text-slate-600'} ${p.className ?? ''}`}
    />
  );
}

/** − value + as in iOS steppers. */
export function Stepper({ value, step = 5, min = 0, unit, onChange, label }: { value: number; step?: number; min?: number; unit?: string; onChange: (v: number) => void; label: string }) {
  return (
    <span className="inline-flex h-[30px] items-center rounded-lg bg-slate-500/10">
      <button type="button" className="h-[30px] w-[30px] rounded-lg text-lg leading-none hover:bg-slate-500/10" onClick={() => onChange(Math.max(min, value - step))} aria-label={`${label} verringern`}>
        −
      </button>
      <input
        type="number"
        className="w-[3.4ch] border-0 bg-transparent p-0 text-right text-[15px] tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        aria-label={label}
      />
      {unit && <span className="pl-[3px] pr-0.5 text-sm text-slate-500">{unit}</span>}
      <button type="button" className="h-[30px] w-[30px] rounded-lg text-lg leading-none hover:bg-slate-500/10" onClick={() => onChange(value + step)} aria-label={`${label} erhöhen`}>
        +
      </button>
    </span>
  );
}

/** Progress ring (Activity style). */
export function Ring({ value }: { value: number }) {
  const c = 2 * Math.PI * 7.5;
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] flex-none -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r="7.5" fill="none" strokeWidth="3.5" className="stroke-slate-300/80" />
      <circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
        className="stroke-emerald-500 transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}
