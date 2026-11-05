// Pure layout and analysis helpers for the Arbeitsprogramm grid.
import type { Block, Location, Zug } from '@shared/types';

export interface Layout {
  days: string[];
  /** Columns per day: the Kdo column (if shown) and the Züge. */
  zuege: Zug[];
  avorDays: string[];
  kvkDays?: string[];
  /** Does the column's Zug serve on that day? (Default: yes.) */
  serves?: (date: string, zugId: number) => boolean;
  /** Duty of the column's Zug (shown where it differs from the type of the day, e.g. KVK on a WK day). */
  duty?: (date: string, zugId: number) => string;
  dayStart: number;
  dayEnd: number;
  snap: number;
  colW: number; // px per Zug column
  ppm: number; // px per minute
  axisW: number; // width of each time axis
  headerH: number;
}

export const nCols = (l: Layout) => l.days.length * l.zuege.length;
export const gridW = (l: Layout) => nCols(l) * l.colW;
export const gridH = (l: Layout) => (l.dayEnd - l.dayStart) * l.ppm;

/** Global column index of (day, zugIdx). */
export const colOf = (l: Layout, dayIdx: number, zugIdx: number) => dayIdx * l.zuege.length + zugIdx;

export const snapTo = (min: number, snap: number) => Math.round(min / snap) * snap;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface BlockGeom {
  dayIdx: number;
  zugIdx: number; // first Zug
  span: number;
}

export function blockGeom(l: Layout, b: Pick<Block, 'date' | 'zugIds'>): BlockGeom | null {
  const dayIdx = l.days.indexOf(b.date);
  const idx = b.zugIds.map((id) => l.zuege.findIndex((z) => z.id === id)).filter((i) => i >= 0);
  if (dayIdx < 0 || idx.length === 0) return null;
  return { dayIdx, zugIdx: Math.min(...idx), span: idx.length };
}

export function rectOf(l: Layout, b: Pick<Block, 'date' | 'zugIds' | 'startMin' | 'endMin'>) {
  const g = blockGeom(l, b);
  if (!g) return null;
  return {
    left: colOf(l, g.dayIdx, g.zugIdx) * l.colW,
    top: (b.startMin - l.dayStart) * l.ppm,
    width: g.span * l.colW,
    height: (b.endMin - b.startMin) * l.ppm,
  };
}

export const zugIdsFor = (l: Layout, zugIdx: number, span: number) => l.zuege.slice(zugIdx, zugIdx + span).map((z) => z.id);

// ---- Analysis ----

export interface Hint {
  kind: 'overlap' | 'verschiebung';
  blockIds: number[];
  text: string;
  date: string;
}

/** Overlaps within a Zug and missing Verschiebungen between different locations. */
export function analyse(blocks: Block[], zuege: Zug[], locations: Location[]): { hints: Hint[]; conflictIds: Set<number> } {
  const hints: Hint[] = [];
  const conflictIds = new Set<number>();
  const locName = (id: number | null) => locations.find((l) => l.id === id)?.name ?? '';
  const seenPairs = new Set<string>();

  for (const zug of zuege) {
    const byDate = new Map<string, Block[]>();
    for (const b of blocks) {
      if (!b.zugIds.includes(zug.id)) continue;
      byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);
    }
    for (const [date, list] of byDate) {
      list.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length && list[j].startMin < list[i].endMin; j++) {
          const key = [list[i].id, list[j].id].sort().join('-');
          conflictIds.add(list[i].id).add(list[j].id);
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          hints.push({
            kind: 'overlap',
            blockIds: [list[i].id, list[j].id],
            date,
            text: `${zug.name}: «${list[i].title}» überschneidet sich mit «${list[j].title}»`,
          });
        }
        const next = list[i + 1];
        const cur = list[i];
        if (
          next &&
          cur.type !== 'VERSCHIEBUNG' &&
          next.type !== 'VERSCHIEBUNG' &&
          cur.locationId != null &&
          next.locationId != null &&
          cur.locationId !== next.locationId &&
          next.startMin - cur.endMin < 15
        ) {
          hints.push({
            kind: 'verschiebung',
            blockIds: [cur.id, next.id],
            date,
            text: `${zug.name}: keine Verschiebung von ${locName(cur.locationId)} nach ${locName(next.locationId)} eingeplant`,
          });
        }
      }
    }
  }
  return { hints, conflictIds };
}
