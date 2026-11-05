// Duty per part of a Zug – its ranks (Zugführer, Kader, Soldaten) and its Gruppen – and planning days in the Jahresplanung.
// Stored in wk.dayDuty next to the Zug's own duty under the key «zugId.part» (part: rank, or «g» + Gruppe id),
// only where it differs from the rules below. The Zug serves as its highest part does.
import type { Bestand, Duty, Wk } from './types';
import { dateRange, defaultDuty, dutyOf, wkDays } from './util';

export type Rank = keyof Bestand;
export const RANKS: Rank[] = ['zfhr', 'kader', 'sdt'];
export const RANK_LABEL: Record<Rank, string> = { zfhr: 'Zugführer (Of)', kader: 'Kader (Uof)', sdt: 'Soldaten' };

/** A rank of the Zug, or one of its Gruppen («g12»). */
export type Part = Rank | `g${number}`;
export const gruppePart = (gruppeId: number): Part => `g${gruppeId}`;
const isRank = (p: string): p is Rank => (RANKS as string[]).includes(p);

/** Züge with their Gruppen, as far as the planning needs them. */
export type ZugParts = { id: number; gruppen: { id: number }[] };
export const partsOf = (z: ZugParts): Part[] => [...RANKS, ...z.gruppen.map((g) => gruppePart(g.id))];

type Days = Pick<Wk, 'startDate' | 'endDate' | 'avorDays' | 'kvkDays' | 'dayDuty'>;

const ORDER: Duty[] = ['NONE', 'AVOR', 'KVK', 'WK'];

/** Usual rule for ranks: WK = all, KVK = Zugführer and Kader, AVOR = Zugführer, no duty = nobody. */
export function rankDefault(zugDuty: Duty, rank: Rank): Duty {
  if (zugDuty === 'WK' || zugDuty === 'NONE') return zugDuty;
  if (zugDuty === 'KVK') return rank === 'sdt' ? 'NONE' : 'KVK';
  return rank === 'zfhr' ? 'AVOR' : 'NONE';
}

/** A Gruppe serves with its Zug (its Kader in the KVK); an AVOR day is for the Zugführer only. */
export const partDefault = (zugDuty: Duty, part: Part): Duty => (isRank(part) ? rankDefault(zugDuty, part) : zugDuty === 'AVOR' ? 'NONE' : zugDuty);

export const partKey = (zugId: number, part: Part) => `${zugId}.${part}`;

/** Duty of one part (rank or Gruppe) of a Zug on a day. */
export function partDutyOf(wk: Days, date: string, zugId: number, part: Part): Duty {
  return wk.dayDuty?.[date]?.[partKey(zugId, part)] ?? partDefault(dutyOf(wk, date, zugId), part);
}

/** The Zug serves as its «highest» part does (WK before KVK before AVOR). */
export const zugDutyOf = (parts: Duty[]): Duty => parts.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'NONE' as Duty);

/** Keeps only what differs from the rules (Zug from the type of the day, parts from the Zug), for Züge and parts that exist. */
export function normalizeDayDuty(wk: Pick<Wk, 'startDate' | 'endDate' | 'avorDays' | 'kvkDays'>, dayDuty: Wk['dayDuty'], zuege: ZugParts[]): Wk['dayDuty'] {
  const parts = new Map(zuege.map((z) => [String(z.id), partsOf(z) as string[]]));
  const days = wkDays(wk);
  const out: Wk['dayDuty'] = {};
  for (const [d, perKey] of Object.entries(dayDuty)) {
    if (!days.includes(d)) continue;
    const keep: Record<string, Duty> = {};
    for (const [key, duty] of Object.entries(perKey)) {
      const [z, part] = key.split('.');
      if (!parts.has(z)) continue;
      if (part === undefined) {
        if (duty !== defaultDuty(wk, d)) keep[key] = duty;
      } else if (parts.get(z)!.includes(part)) {
        if (duty !== partDefault(perKey[z] ?? defaultDuty(wk, d), part as Part)) keep[key] = duty;
      }
    }
    if (Object.keys(keep).length) out[d] = keep;
  }
  return out;
}

/** A selected cell of the month view: a whole Zug (part null), one of its ranks or one of its Gruppen. */
export interface Cell {
  date: string;
  zugId: number;
  part: Part | null;
}

/**
 * Sets the duty of the selected cells. Days that do not belong to the WK yet become AVOR or KVK days of it,
 * or extend its period (WK). Returns the new days of the WK (to PATCH), unchanged keys left out.
 */
export function applyDuty(wk: Days, cells: Cell[], duty: Duty, zuege: ZugParts[]) {
  const next = {
    startDate: wk.startDate,
    endDate: wk.endDate,
    avorDays: [...wk.avorDays],
    kvkDays: [...wk.kvkDays],
    dayDuty: JSON.parse(JSON.stringify(wk.dayDuty ?? {})) as Wk['dayDuty'],
  };
  const dates = [...new Set(cells.map((c) => c.date))].sort();
  for (const d of dates) {
    if (wkDays(next).includes(d) || duty === 'NONE') continue;
    if (duty === 'AVOR') next.avorDays.push(d);
    else if (duty === 'KVK') next.kvkDays.push(d);
    else if (d < next.startDate) next.startDate = d;
    else next.endDate = d;
  }
  next.avorDays.sort();
  next.kvkDays.sort();
  const days = wkDays(next);
  // A new day: the other Züge do not serve unless selected.
  for (const d of dates.filter((x) => !wkDays(wk).includes(x) && days.includes(x))) {
    const per = (next.dayDuty[d] ??= {});
    for (const z of zuege) {
      const own = cells.filter((c) => c.date === d && c.zugId === z.id);
      if (!own.length) per[String(z.id)] = 'NONE';
      // Only some parts selected: the other parts of that Zug do not serve on the new day either.
      else if (!own.some((c) => c.part === null)) for (const p of partsOf(z)) if (!own.some((c) => c.part === p)) per[partKey(z.id, p)] = 'NONE';
    }
  }
  // Days in the gap when the period was extended: nobody serves there unless planned.
  for (const d of dateRange(next.startDate, next.endDate)) {
    if (wkDays(wk).includes(d) || dates.includes(d)) continue;
    const per = (next.dayDuty[d] ??= {});
    for (const z of zuege) per[String(z.id)] = 'NONE';
  }
  for (const c of cells) {
    const zug = zuege.find((z) => z.id === c.zugId);
    if (!days.includes(c.date) || !zug) continue;
    const per = (next.dayDuty[c.date] ??= {});
    const z = String(c.zugId);
    const parts = partsOf(zug);
    if (c.part === null) {
      per[z] = duty;
      for (const p of parts) delete per[partKey(c.zugId, p)];
    } else {
      // Fix the other parts at what they are now, then derive the Zug from its parts.
      const current = new Map(parts.map((p) => [p, partDutyOf(next, c.date, c.zugId, p)]));
      current.set(c.part, duty);
      per[z] = zugDutyOf([...current.values()]);
      for (const [p, v] of current) per[partKey(c.zugId, p)] = v;
    }
  }
  // A KVK day without anyone left in the KVK is no KVK day any more (an AVOR day stays: the Kdo serves).
  for (const d of [...next.kvkDays]) {
    if (zuege.length && zuege.every((z) => dutyOf(next, d, z.id) === 'NONE')) next.kvkDays = next.kvkDays.filter((x) => x !== d);
  }
  return { ...next, dayDuty: normalizeDayDuty(next, next.dayDuty, zuege) };
}

/** The WK a day of a Kp belongs to: the one with that day, else the nearest that may still change. */
export function wkForDay<T extends Days & { kpId: number; archived: boolean; status: string }>(wks: T[], kpId: number, date: string): T | undefined {
  const own = wks.filter((w) => w.kpId === kpId && !w.archived && w.status !== 'FREIGEGEBEN');
  const hit = own.find((w) => wkDays(w).includes(date));
  if (hit) return hit;
  const dist = (w: T) => Math.min(...wkDays(w).map((d) => Math.abs(Date.parse(d) - Date.parse(date))));
  return own.sort((a, b) => dist(a) - dist(b))[0];
}
