// Language of the interface: the user's choice («Mein Konto»), otherwise the one saved on this device or the browser's.
// Texts live in shared/i18n (German source, fr, it, en); components use useT().
import { createContext, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LOCALE, translate, weekdayIn, weekdayShortIn, type Key, type Lang, type Vars } from '@shared/i18n';
import { useAuth } from './auth';
import { api } from './api';
import { currentLang, setCurrentLang } from './lib/lang';

interface I18n {
  lang: Lang;
  /** The text of a key with its {placeholders}. */
  t: (key: Key, vars?: Vars) => string;
  /** Like t, with elements for the placeholders (bold words, links). */
  tn: (key: Key, nodes: Record<string, ReactNode>) => ReactNode;
  /** Changes the language; signed in, it is saved with the account. */
  setLang: (lang: Lang) => Promise<void>;
  weekday: (iso: string) => string;
  /** «Mo», «lun», «Mon». */
  weekdayShort: (iso: string) => string;
  locale: string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [local, setLocal] = useState<Lang>(currentLang);
  const lang: Lang = user?.lang ?? local;

  // Right away (not in an effect), so helpers outside React (currentT) render in the new language too.
  if (currentLang() !== lang) setCurrentLang(lang, false);

  const setLang = useCallback(
    async (l: Lang) => {
      setCurrentLang(l, true);
      setLocal(l);
      if (user) qc.setQueryData(['me'], await api.setLang(l));
    },
    [user, qc],
  );

  const value = useMemo<I18n>(
    () => ({
      lang,
      t: (key, vars) => translate(lang, key, vars),
      tn: (key, nodes) =>
        translate(lang, key)
          .split(/(\{\w+\})/)
          .map((part, i) => <Fragment key={i}>{/^\{\w+\}$/.test(part) ? (nodes[part.slice(1, -1)] ?? part) : part}</Fragment>),
      setLang,
      weekday: (iso) => weekdayIn(lang, iso),
      weekdayShort: (iso) => weekdayShortIn(lang, iso),
      locale: LOCALE[lang],
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}
