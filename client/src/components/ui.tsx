import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { WkStatus } from '@shared/types';
import { STATUS_LABEL } from '@shared/types';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
// As in SwiftUI: prominent (filled tint), bordered (tinted fill), destructive and plain.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-zs-blue text-white font-semibold hover:brightness-110 disabled:opacity-40',
  secondary: 'bg-zs-blue/10 text-zs-blue hover:bg-zs-blue/15 disabled:bg-slate-200/50 disabled:text-slate-400',
  danger: 'bg-red-500/10 text-red-600 hover:bg-red-500/15 disabled:opacity-40',
  ghost: 'text-zs-blue hover:bg-slate-200/60 disabled:text-slate-400',
};

export function Button({ variant = 'secondary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition active:opacity-60 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    // A section of a grouped list: caption above, content in a rounded cell.
    <section className={className}>
      {(title || actions) && (
        <header className="mx-4 mb-1.5 flex min-h-[1.5rem] items-end justify-between gap-2">
          <h2 className="text-[13px] font-normal uppercase tracking-[0.02em] text-slate-500">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="rounded-lg bg-white p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

const STATUS_STYLE: Record<WkStatus, string> = {
  ENTWURF: 'bg-slate-200 text-slate-700',
  EINGEREICHT: 'bg-amber-100 text-amber-800',
  FREIGEGEBEN: 'bg-emerald-100 text-emerald-800',
  ZURUECKGEWIESEN: 'bg-red-100 text-red-800',
};
export const StatusBadge = ({ status }: { status: WkStatus }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
);

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    // A sheet: frosted title bar, close button as in iOS, actions at the bottom.
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-12 max-sm:p-0 max-sm:pt-3"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`anim-sheet w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-hidden rounded-xl bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.06),0_10px_40px_rgb(0_0_0/0.25)] max-sm:flex max-sm:min-h-full max-sm:flex-col max-sm:rounded-b-none`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="material hairline-b sticky top-0 z-10 grid grid-cols-[2rem,1fr,2rem] items-center gap-2 px-3 py-2.5">
          <span />
          <h2 className="truncate text-center text-[15px] font-semibold">{title}</h2>
          <button
            className="grid h-7 w-7 place-items-center rounded-full bg-slate-200/80 text-[13px] font-bold text-slate-500 hover:bg-slate-300/80"
            onClick={onClose}
            aria-label="Schliessen"
          >
            ✕
          </button>
        </header>
        <div className="space-y-3 p-4 max-sm:flex-1">{children}</div>
        {footer && (
          <footer className="material hairline-t sticky bottom-0 flex flex-wrap justify-end gap-2 px-4 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ---- Toasts ----

type Toast = { id: number; text: string; kind: 'error' | 'info' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {/* HUD: frosted capsule at the bottom centre. */}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="material-menu anim-pop flex max-w-md items-center gap-2 rounded-full py-2.5 pl-3.5 pr-5 text-[15px] font-medium text-slate-900">
            <span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-xs font-bold text-white ${t.kind === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} aria-hidden>
              {t.kind === 'error' ? '!' : '✓'}
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

/** Textarea that grows with its content. */
export function TextArea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={`input resize-y ${p.className ?? ''}`} />;
}
