import { useEffect, useMemo, useRef, useState } from 'react';
import type { RequestStatus } from '@shared/types';
import { fmtDate, fmtTime } from '@shared/util';

const weekday = (d: string) => weekdayIn(currentLang(), d);
import { useT } from '../../i18n';
import { weekdayIn, weekdayShortIn } from '@shared/i18n';
import { currentLang } from '../../lib/lang';

export interface TimelineRow {
  id: string;
  label: string;
  sub?: string;
  badge?: string;
}

export interface TimelineItem {
  key: string;
  rowId: string;
  date: string;
  startMin: number;
  endMin: number;
  label: string;
  title: string;
  status: RequestStatus;
  /** Booking of another Kompanie (shown neutral). */
  foreign?: boolean;
  /** Highlighted, e.g. the own Zug. */
  mine?: boolean;
}

const NAME_W = 190;
const BAR_H = 22;
const PAD = 4;

const STYLE: Record<RequestStatus, string> = {
  BEWILLIGT: 'bg-emerald-500 text-white',
  BEANTRAGT: 'bg-amber-400 text-amber-950',
  ABGELEHNT: 'bg-slate-300 text-slate-600 line-through',
};

/** Items of a row that overlap another open or approved item of the same row. */
function conflicts(items: TimelineItem[]) {
  const out = new Set<string>();
  const active = items.filter((i) => i.status !== 'ABGELEHNT');
  for (let a = 0; a < active.length; a++)
    for (let b = a + 1; b < active.length; b++) {
      const x = active[a];
      const y = active[b];
      if (x.rowId === y.rowId && x.date === y.date && x.startMin < y.endMin && y.startMin < x.endMin) out.add(x.key).add(y.key);
    }
  return out;
}

/** Stacks overlapping items of a row into sub-rows so none hides another. */
function stack(items: TimelineItem[]) {
  const lane = new Map<string, number>();
  const ends: Record<string, number[]> = {};
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  for (const it of sorted) {
    const k = `${it.rowId}|${it.date}`;
    const lanes = (ends[k] ??= []);
    let i = lanes.findIndex((end) => end <= it.startMin);
    if (i < 0) i = lanes.push(0) - 1;
    lanes[i] = it.endMin;
    lane.set(it.key, i);
  }
  const rowLanes = new Map<string, number>();
  for (const [k, lanes] of Object.entries(ends)) {
    const row = k.split('|')[0];
    rowLanes.set(row, Math.max(rowLanes.get(row) ?? 1, lanes.length));
  }
  return { lane, rowLanes };
}

/** Resources (rows) over time (days × hours); bars are the requests. */
export function ResourceTimeline({
  rows,
  items,
  days,
  dayStart,
  dayEnd,
  onItemClick,
  highlightDays = [],
}: {
  rows: TimelineRow[];
  items: TimelineItem[];
  days: string[];
  dayStart: number;
  dayEnd: number;
  onItemClick?: (key: string) => void;
  highlightDays?: string[];
}) {
  const { t } = useT();
  // Fit all days into the available width; the zoom slider overrides.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = Math.max(0.15, (width - NAME_W - 4) / Math.max(1, days.length) / (dayEnd - dayStart));
  const ppm = zoom ?? fit;
  const dayW = (dayEnd - dayStart) * ppm;
  const clash = useMemo(() => conflicts(items), [items]);
  const { lane, rowLanes } = useMemo(() => stack(items.filter((i) => days.includes(i.date))), [items, days]);
  const hours: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m < dayEnd; m += 60) hours.push(m);
  const labelEvery = dayW / hours.length < 28 ? 3 : dayW / hours.length < 45 ? 2 : 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span className="h-3 w-5 rounded-sm bg-emerald-500" /> bewilligt
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-5 rounded-sm bg-amber-400" /> beantragt
        </span>
        <span className="flex items-center gap-1">
          <span className="block-bat h-3 w-5 rounded-sm bg-slate-400" /> andere Kompanie
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-5 rounded-sm border-2 border-red-600" /> Doppelbelegung
        </span>
        <span className="flex-1" />
        <label className="flex items-center gap-1 max-md:hidden">
          {t('res.zoom')}
          <input type="range" min={10} max={120} value={Math.round(ppm * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} className="w-24" aria-label={t('res.zoom')} />
        </label>
      </div>
      <div ref={box} className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <div style={{ width: NAME_W + days.length * dayW }}>
          {/* Header */}
          <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white">
            <div className="sticky left-0 z-10 shrink-0 border-r border-slate-200 bg-white" style={{ width: NAME_W }} />
            {days.map((d) => (
              <div key={d} className={`shrink-0 border-r border-slate-300 ${highlightDays.includes(d) ? 'bg-amber-50' : ''}`} style={{ width: dayW }}>
                <div className="truncate px-1 pt-1 text-center text-xs font-semibold">
                  {weekdayShortIn(currentLang(), d)} {fmtDate(d).slice(0, 6)}
                </div>
                <div className="relative h-4">
                  {hours.map((m, i) =>
                    i % labelEvery === 0 && m > dayStart && (dayEnd - m) * ppm > 14 ? (
                      <span key={m} className="absolute -translate-x-1/2 text-[9px] tabular-nums text-slate-400" style={{ left: (m - dayStart) * ppm }}>
                        {String(m / 60).padStart(2, '0')}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Rows */}
          {rows.map((row) => (
            <div key={row.id} className="flex border-b border-slate-100 last:border-b-0" style={{ height: (rowLanes.get(row.id) ?? 1) * BAR_H + PAD * 2 }}>
              <div className="sticky left-0 z-[5] flex shrink-0 items-center gap-1.5 truncate border-r border-slate-200 bg-white px-2 text-sm" style={{ width: NAME_W }} title={row.sub}>
                <span className="truncate">{row.label}</span>
                {row.badge && <span className="shrink-0 rounded bg-indigo-100 px-1 text-[9px] font-medium text-indigo-800">{row.badge}</span>}
              </div>
              <div className="relative" style={{ width: days.length * dayW }}>
                {days.map((d, i) => (
                  <div
                    key={d}
                    className={`absolute top-0 h-full border-r border-slate-200 ${highlightDays.includes(d) ? 'bg-amber-50/60' : i % 2 ? 'bg-slate-50/60' : ''}`}
                    style={{ left: i * dayW, width: dayW }}
                  />
                ))}
                {items
                  .filter((it) => it.rowId === row.id)
                  .map((it) => {
                    const di = days.indexOf(it.date);
                    if (di < 0) return null;
                    const s = Math.max(it.startMin, dayStart);
                    const e = Math.min(it.endMin, dayEnd);
                    if (e <= s) return null;
                    return (
                      <button
                        key={it.key}
                        type="button"
                        title={`${it.title}\n${weekday(it.date)} ${fmtDate(it.date)}, ${fmtTime(it.startMin)}–${fmtTime(it.endMin)}`}
                        onClick={() => onItemClick?.(it.key)}
                        className={`absolute overflow-hidden truncate rounded px-1 text-left text-[10px] font-medium leading-[22px] shadow-sm ${
                          it.foreign ? 'block-bat bg-slate-400 text-white' : STYLE[it.status]
                        } ${clash.has(it.key) ? 'ring-2 ring-red-600' : ''} ${it.mine === false ? 'opacity-50' : ''}`}
                        style={{ left: di * dayW + (s - dayStart) * ppm + 1, top: PAD + (lane.get(it.key) ?? 0) * BAR_H, width: Math.max((e - s) * ppm - 2, 4), height: BAR_H - 2 }}
                      >
                        {it.label}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="p-4 text-sm text-slate-400">{t('res.noResources')}</p>}
        </div>
      </div>
    </div>
  );
}
