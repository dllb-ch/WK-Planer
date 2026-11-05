// Language choice before signing in (login, QR check-in); signed in it is set under «Mein Konto».
import { LANGS, LANG_NAME, type Lang } from '@shared/i18n';
import { useT } from '../i18n';

export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <select
      className={`rounded-lg bg-transparent py-1 text-[15px] text-zs-blue ${className}`}
      aria-label="Sprache · Langue · Lingua · Language"
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
