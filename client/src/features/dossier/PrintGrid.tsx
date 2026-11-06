// Static block overview for print: one A4 landscape page per chunk of days.
import type { Block, BlockDetail, Location, Zug, ZugGroup } from '@shared/types';
import { BLOCK_TYPE_INFO, KDO_ID } from '@shared/types';
import { fmtDate, fmtTime, weekday } from '@shared/util';
import { currentT } from '../../lib/lang';

/** CSS px per mm (print maps 1 mm to 96/25.4 px). */
export const MM = 96 / 25.4;
/** Usable area of an A4 landscape page with 10 mm side and 12/16 mm top/bottom margins. */
export const LANDSCAPE = { w: 277 * MM, h: 182 * MM };

const AXIS = 34;
const HEAD = 36;
const MIN_COL = 78;

/** How many days fit on one page with the given number of columns per day. */
export const daysPerPage = (colsPerDay: number) => Math.max(1, Math.floor((LANDSCAPE.w - AXIS) / (colsPerDay * MIN_COL)));

export function chunk<T>(list: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

interface Props {
  days: string[];
  columns: Zug[];
  blocks: Block[];
  locations: Location[];
  dayStart: number;
  dayEnd: number;
  avorDays: string[];
  /** Height available for the grid (page minus title and legend). */
  height: number;
  /** Detail lines per block (Zug dossier). */
  details?: BlockDetail[];
  groups?: ZugGroup[];
}

export function PrintGrid(p: Props) {
  const nCol = p.columns.length;
  const colW = (LANDSCAPE.w - AXIS) / (p.days.length * nCol);
  const ppm = (p.height - HEAD) / (p.dayEnd - p.dayStart);
  const hours: number[] = [];
  for (let m = Math.ceil(p.dayStart / 60) * 60; m <= p.dayEnd; m += 60) hours.push(m);
  const locNr = (id: number | null) => p.locations.find((l) => l.id === id)?.nr;
  const groupName = (ids: number[]) => (p.groups ?? []).filter((g) => ids.includes(g.id)).map((g) => g.name).join('+');

  return (
    <div className="dos-grid relative border border-black text-black" style={{ width: LANDSCAPE.w, height: p.height, fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div className="absolute left-0 top-0 flex border-b border-black" style={{ height: HEAD, left: AXIS, right: 0 }}>
        {p.days.map((d, di) => (
          <div key={d} className={`flex flex-col ${di > 0 ? 'border-l-2 border-black' : ''}`} style={{ width: colW * nCol }}>
            <div className={`flex flex-1 items-center justify-center gap-1 text-[10px] font-bold ${p.avorDays.includes(d) ? 'bg-amber-100' : ''}`}>
              {p.avorDays.includes(d) && <span className="rounded bg-amber-500 px-1 text-[8px] text-white">{currentT('duty.AVOR')}</span>}
              {weekday(d)} {fmtDate(d)}
            </div>
            <div className="flex border-t border-black/40">
              {p.columns.map((c, ci) => (
                <div key={c.id} className={`truncate text-center text-[8.5px] ${ci > 0 ? 'border-l border-black/30' : ''} ${c.id === KDO_ID ? 'bg-slate-200 font-bold' : ''}`} style={{ width: colW }}>
                  {c.name}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* Time axis */}
      <div className="absolute left-0 border-r border-black" style={{ top: HEAD, width: AXIS, bottom: 0 }}>
        {hours.map((m) => (
          <div key={m} className="absolute w-full -translate-y-1/2 text-center text-[8.5px] tabular-nums" style={{ top: (m - p.dayStart) * ppm }}>
            {fmtTime(m)}
          </div>
        ))}
      </div>
      {/* Grid lines and blocks */}
      <div className="absolute overflow-hidden" style={{ top: HEAD, left: AXIS, right: 0, bottom: 0 }}>
        {hours.map((m) => (
          <div key={m} className="absolute w-full border-t border-black/15" style={{ top: (m - p.dayStart) * ppm }} />
        ))}
        {p.days.map((d, di) =>
          p.columns.map((c, ci) => (
            <div
              key={`${d}-${c.id}`}
              className={`absolute top-0 h-full ${ci === 0 && di > 0 ? 'border-l-2 border-black' : ci > 0 ? 'border-l border-black/20' : ''} ${c.id === KDO_ID ? 'bg-slate-100' : ''}`}
              style={{ left: (di * nCol + ci) * colW, width: colW }}
            />
          )),
        )}
        {p.blocks.map((b) => {
          const di = p.days.indexOf(b.date);
          const idx = b.zugIds.map((id) => p.columns.findIndex((c) => c.id === id)).filter((i) => i >= 0);
          if (di < 0 || !idx.length) return null;
          const first = Math.min(...idx);
          const span = Math.max(...idx) - first + 1;
          const top = (Math.max(b.startMin, p.dayStart) - p.dayStart) * ppm;
          const h = (Math.min(b.endMin, p.dayEnd) - Math.max(b.startMin, p.dayStart)) * ppm;
          if (h <= 0) return null;
          const nr = locNr(b.locationId);
          const ds = (p.details ?? []).filter((x) => x.blockId === b.id);
          const color = BLOCK_TYPE_INFO[b.type].color;
          return (
            <div
              key={b.id}
              className="absolute overflow-hidden rounded-[2px] border border-white px-[3px] text-white"
              style={{ left: (di * nCol + first) * colW + 1, top: top + 1, width: span * colW - 2, height: h - 2, backgroundColor: color }}
            >
              <div className="truncate text-[8.5px] font-bold leading-[10px]">
                {b.title}
                {nr != null && <span className="font-normal"> ({nr})</span>}
              </div>
              {h > 20 && (
                <div className="truncate text-[7.5px] leading-[9px]">
                  {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                  {b.verantwortlich && ` · ${b.verantwortlich}`}
                </div>
              )}
              {h > 34 &&
                ds.map((x) => (
                  <div key={x.id} className="truncate text-[7px] leading-[8.5px] opacity-95">
                    {fmtTime(x.startMin)} {x.groupIds.length > 0 && <b>{groupName(x.groupIds)}: </b>}
                    {x.title}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
