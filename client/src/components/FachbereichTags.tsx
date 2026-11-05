import type { Fachbereich } from '@shared/types';
import { FACHBEREICH_SHORT, FACHBEREICHE } from '@shared/types';

export const FACHBEREICH_COLOR: Record<Fachbereich, string> = {
  BETREUUNG: 'bg-emerald-100 text-emerald-800',
  FU: 'bg-sky-100 text-sky-800',
  PIONIER: 'bg-orange-100 text-orange-800',
  KGS: 'bg-violet-100 text-violet-800',
};

export function FachbereichTags({ list }: { list: Fachbereich[] }) {
  if (!list.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((k) => (
        <span key={k} title={FACHBEREICHE[k]} className={`rounded px-1.5 py-px text-[10px] font-semibold ${FACHBEREICH_COLOR[k]}`}>
          {FACHBEREICH_SHORT[k]}
        </span>
      ))}
    </span>
  );
}
