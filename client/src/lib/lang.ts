// The language of the interface outside React (API requests send it as X-Lang). Set by the I18nProvider.
import { pickLang, isLang, type Lang } from '@shared/i18n';

const STORE = 'zs-lang';

/** Saved choice on this device, else the browser's language. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE);
    if (isLang(saved)) return saved;
  } catch {
    /* private mode */
  }
  return pickLang(typeof navigator !== 'undefined' ? navigator.languages : []);
}

let current: Lang = initialLang();
export const currentLang = () => current;

export function setCurrentLang(lang: Lang, remember: boolean) {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  if (!remember) return;
  try {
    localStorage.setItem(STORE, lang);
  } catch {
    /* private mode */
  }
}
