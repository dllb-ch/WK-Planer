// Language choice: a select before signing in (login, QR check-in), a globe menu in the top bar when signed in
// (saved with the account, like the choice under «Mein Konto»).
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LANGS, LANG_NAME, type Lang } from '@shared/i18n';
import { useT } from '../i18n';
import { errMsg, useToast } from './ui';

const LABEL = 'Sprache · Langue · Lingua · Language';

export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <select
      className={`rounded-lg bg-transparent py-1 text-[15px] text-zs-blue ${className}`}
      aria-label={LABEL}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
    >
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {LANG_NAME[l]}
        </option>
      ))}
    </select>
  );
}

/** Top bar: globe with the current language; the menu lists all four, each in its own language. */
export function LangMenu() {
  const { lang, setLang } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const choose = async (l: Lang) => {
    setOpen(false);
    if (l === lang) return;
    try {
      await setLang(l);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="relative">
      <button
        className="flex h-8 items-center gap-1 rounded-full px-2 text-zs-blue hover:bg-slate-200/60"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={LABEL}
        title={LABEL}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </svg>
        <span className="text-xs font-semibold uppercase">{lang}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" aria-label={LABEL} className="material-menu anim-pop absolute right-0 top-full z-50 mt-1 w-44 rounded-xl p-[5px] text-sm">
            {LANGS.map((l) => (
              <button
                key={l}
                role="menuitemradio"
                aria-checked={l === lang}
                lang={l}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-slate-900 hover:bg-slate-200/60 ${l === lang ? 'font-semibold' : ''}`}
                onClick={() => choose(l)}
              >
                <span className="w-3 shrink-0 text-zs-blue" aria-hidden>
                  {l === lang ? '✓' : ''}
                </span>
                {LANG_NAME[l]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
