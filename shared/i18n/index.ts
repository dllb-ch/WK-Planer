// Translations of the user interface, server messages and printouts: German (source), French, Italian, English.
// The client uses it through useT() (client/src/i18n.tsx), the server through langOf(req) (server/src/http.ts).
import { de, type Catalog, type Key } from './de';
import { fr } from './fr';
import { it } from './it';
import { en } from './en';

export type { Key };
export const LANGS = ['de', 'fr', 'it', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAME: Record<Lang, string> = { de: 'Deutsch', fr: 'Français', it: 'Italiano', en: 'English' };
/** Locale for Intl (dates, numbers); Swiss variants. */
export const LOCALE: Record<Lang, string> = { de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en-GB' };

const CATALOGS: Record<Lang, Catalog> = { de, fr, it, en };

export const isLang = (x: unknown): x is Lang => typeof x === 'string' && (LANGS as readonly string[]).includes(x);
export const isKey = (x: string): x is Key => Object.prototype.hasOwnProperty.call(de, x);

export type Vars = Record<string, string | number>;

/** The text of `key` in `lang`, with {placeholders} filled in. */
export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const s = CATALOGS[lang][key] ?? de[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Translates a message that may be a key (server errors); anything else is returned as it is. */
export const translateMessage = (lang: Lang, msg: string, vars?: Vars) => (isKey(msg) ? translate(lang, msg, vars) : msg);

/** The first supported language of a list such as navigator.languages or Accept-Language; German otherwise. */
export function pickLang(candidates: readonly string[] | string | undefined | null): Lang {
  const list = typeof candidates === 'string' ? candidates.split(',').map((x) => x.split(';')[0]) : (candidates ?? []);
  for (const c of list) {
    const l = c.trim().slice(0, 2).toLowerCase();
    if (isLang(l)) return l;
  }
  return 'de';
}

/** Short weekday, e.g. «Mo», «lun.», «lun», «Mon». */
export const weekdayShortIn = (lang: Lang, iso: string) =>
  new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z')).replace(/\.$/, '');

/** Weekday of an ISO date (YYYY-MM-DD), e.g. «Montag», «lundi». */
export const weekdayIn = (lang: Lang, iso: string) =>
  new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
