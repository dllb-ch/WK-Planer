import { useQuery } from '@tanstack/react-query';
import { ROLE_LABEL } from '@shared/types';
import { api } from '../api';
import { useT } from '../i18n';

/** People assigned to the Züge (Zfhr, Stv, Kader); for the Kdo column (id 0) the Kp command. */
export function useZugPeople(kpId: number, zugIds: number | number[]) {
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const ids = Array.isArray(zugIds) ? zugIds : [zugIds];
  const users = (org.data?.users ?? []).filter(
    (u) => (u.zugId !== null && ids.includes(u.zugId)) || (ids.includes(0) && u.kpId === kpId && (u.role === 'KPKDT' || u.role === 'LOGOF')),
  );
  const rank = { ZFHR: 0, LOGOF: 1, KPKDT: 0, KADER: 2, BAT: 3, ADMIN: 4 } as const;
  return users.sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
}

/** Dropdown of the Zug's people; a value that is not (or no longer) in the list stays selectable. */
export function PersonSelect({
  kpId,
  zugId,
  value,
  onChange,
  label,
}: {
  kpId: number;
  zugId: number | number[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const { t } = useT();
  const lbl = label ?? t('bd.responsible');
  const people = useZugPeople(kpId, zugId);
  const known = people.some((p) => p.name === value);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={lbl}>
      <option value="">– {lbl} –</option>
      {people.map((p) => (
        <option key={p.id} value={p.name}>
          {p.name} ({p.funktion || ROLE_LABEL[p.role]})
        </option>
      ))}
      {value && !known && <option value={value}>{t('person.notInZug', { value })}</option>}
    </select>
  );
}

/** Several people of the Zug as toggle chips; reports ids and names (names are what documents print). */
export function PersonMultiSelect({
  kpId,
  zugId,
  value,
  legacy,
  onChange,
}: {
  kpId: number;
  zugId: number;
  value: number[];
  /** Free-text names from before people could be assigned. */
  legacy?: string;
  onChange: (ids: number[], names: string[]) => void;
}) {
  const { t } = useT();
  const people = useZugPeople(kpId, zugId);
  const toggle = (id: number) => {
    const ids = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    onChange(ids, people.filter((p) => ids.includes(p.id)).map((p) => p.name));
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => {
          const on = value.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p.id)}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {on ? '✓ ' : ''}
              {p.name}
              <span className={on ? 'text-blue-100' : 'text-slate-400'}> · {p.funktion || ROLE_LABEL[p.role]}</span>
            </button>
          );
        })}
        {people.length === 0 && <span className="text-xs text-slate-400">{t('person.noneInZug')}</span>}
      </div>
      {legacy && value.length === 0 && <p className="text-xs text-slate-500">{t('person.legacy', { value: legacy })}</p>}
    </div>
  );
}
