// Right-click menu: fixed at the pointer, kept inside the window; closes on click outside, Escape, scroll or resize.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem =
  | { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | 'separator';

export interface MenuState {
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  const [active, setActive] = useState(-1);
  const items = menu.items;
  const usable = items.map((it, i) => (it !== 'separator' && !it.disabled ? i : -1)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)) });
    el.focus();
  }, [menu.x, menu.y]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  const run = (it: Exclude<MenuItem, 'separator'>) => {
    if (it.disabled) return;
    onClose();
    it.onClick();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = usable.indexOf(active);
      const next = e.key === 'ArrowDown' ? usable[(i + 1) % usable.length] : usable[(i - 1 + usable.length) % usable.length];
      setActive(next ?? -1);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      run(items[active] as Exclude<MenuItem, 'separator'>);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
      className="material-menu anim-pop no-print fixed z-[60] min-w-[15rem] rounded-xl p-[5px] text-[15px] outline-none"
      style={pos}
    >
      {menu.title && <div className="truncate px-2.5 pb-1 pt-1 text-xs font-semibold text-slate-500">{menu.title}</div>}
      {items.map((it, i) =>
        it === 'separator' ? (
          <div key={`s${i}`} className="hairline-t mx-2.5 my-1" />
        ) : (
          <button
            key={it.label}
            role="menuitem"
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => run(it)}
            // Highlighted row in the tint, as in macOS menus.
            className={`group flex w-full items-center gap-2 rounded-[7px] px-2.5 py-[5px] text-left disabled:cursor-not-allowed disabled:opacity-40 ${
              active === i ? 'bg-zs-blue text-white' : it.danger ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            <span className="w-4 text-center" aria-hidden>
              {it.icon}
            </span>
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className={`text-xs ${active === i ? 'text-white/70' : 'text-slate-400'}`}>{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
