import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Block, Location } from '@shared/types';
import { BLOCK_TYPE_INFO, KDO_ID } from '@shared/types';
import { fmtDate, fmtTime } from '@shared/util';
import { useT } from '../../i18n';
import { blockGeom, clamp, colOf, gridH, gridW, nCols, rectOf, snapTo, zugIdsFor, type Layout } from './geometry';

export interface Draft {
  date: string;
  zugIds: number[];
  startMin: number;
  endMin: number;
}

type Mode = 'move' | 'top' | 'bottom' | 'left' | 'right' | 'create';

interface Drag {
  mode: Mode;
  id: number | null;
  orig: Draft;
  startX: number;
  startY: number;
  grabCol: number; // column offset between pointer and block start
  grabMin: number; // minute offset between pointer and block start
  anchorCol: number;
  anchorMin: number;
  preview: Draft;
  moved: boolean;
  /** Alt/Option held at the start of a move: drop a copy instead of moving. */
  clone: boolean;
}

interface Props {
  layout: Layout;
  blocks: Block[];
  locations: Location[];
  selectedId: number | null;
  conflictIds: Set<number>;
  highlightZugId: number | null;
  dimOthers: boolean;
  canEdit: (b: Block) => boolean;
  canCreateIn: (zugIdx: number) => boolean;
  canChangeZug: boolean;
  onSelect: (id: number | null) => void;
  onCommit: (id: number, d: Draft) => void;
  onOpen: (id: number) => void;
  onCreate: (d: Draft) => void;
  /** Extra content inside a block, e.g. the detail plan in the Zugansicht. */
  renderInner?: (b: Block, height: number) => ReactNode;
  /** Non-interactive blocks drawn behind the others (Grobprogramm slots behind the group sequences). */
  backgroundBlocks?: Block[];
  selectedBackgroundId?: number | null;
  /** Pointer down on empty grid space, before a new block is drawn. */
  onEmptyPointer?: (date: string, min: number) => void;
  /** Enables Alt/Option-drag to copy a block. */
  onClone?: (id: number, d: Draft) => void;
  /** Right click on a block (pointer position for the menu). */
  onBlockMenu?: (id: number, x: number, y: number) => void;
  /** Right click on empty grid space: day, column and time under the pointer. */
  onEmptyMenu?: (at: { date: string; zugId: number; min: number }, x: number, y: number) => void;
}

const sameDraft = (a: Draft, b: Draft) =>
  a.date === b.date && a.startMin === b.startMin && a.endMin === b.endMin && a.zugIds.join() === b.zugIds.join();

export function PlannerGrid(p: Props) {
  const { layout: l } = p;
  const { t, weekday } = useT();
  const serves = (d: string, zugId: number) => l.serves?.(d, zugId) ?? true;
  /** Duty of a Zug where it differs from the type of the day (e.g. KVK on a WK day). */
  const badge = (d: string, zugId: number) => {
    if (zugId === KDO_ID || !l.duty) return null;
    const duty = l.duty(d, zugId);
    const dayType = l.avorDays.includes(d) ? 'NONE' : l.kvkDays?.includes(d) ? 'KVK' : 'WK';
    return duty !== 'NONE' && duty !== dayType ? duty : null;
  };
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const nZ = l.zuege.length;

  /** Pointer position → (global column, minute) in grid coordinates. */
  const pointerAt = (e: { clientX: number; clientY: number }) => {
    const r = gridRef.current!.getBoundingClientRect();
    const col = clamp(Math.floor((e.clientX - r.left) / l.colW), 0, nCols(l) - 1);
    const min = l.dayStart + (e.clientY - r.top) / l.ppm;
    return { col, min };
  };

  function computePreview(d: Drag, e: PointerEvent): Draft {
    const { col, min } = pointerAt(e);
    const o = d.orig;
    const dur = o.endMin - o.startMin;
    const g = blockGeom(l, o) ?? { dayIdx: 0, zugIdx: 0, span: 1 };
    switch (d.mode) {
      case 'move': {
        const target = clamp(col - d.grabCol, 0, nCols(l) - 1);
        const dayIdx = Math.floor(target / nZ);
        const start = clamp(snapTo(min - d.grabMin, l.snap), l.dayStart, l.dayEnd - dur);
        // Without the right to change the Zug, only day and time change.
        const zugIds = p.canChangeZug ? zugIdsFor(l, clamp(target % nZ, 0, nZ - g.span), g.span) : o.zugIds;
        return { date: l.days[dayIdx], zugIds, startMin: start, endMin: start + dur };
      }
      case 'top':
        return { ...o, startMin: clamp(snapTo(min, l.snap), l.dayStart, o.endMin - l.snap) };
      case 'bottom':
        return { ...o, endMin: clamp(snapTo(min, l.snap), o.startMin + l.snap, l.dayEnd) };
      case 'left': {
        const last = g.zugIdx + g.span - 1;
        const first = clamp(col - g.dayIdx * nZ, 0, last);
        return { ...o, zugIds: zugIdsFor(l, first, last - first + 1) };
      }
      case 'right': {
        const last = clamp(col - g.dayIdx * nZ, g.zugIdx, nZ - 1);
        return { ...o, zugIds: zugIdsFor(l, g.zugIdx, last - g.zugIdx + 1) };
      }
      case 'create': {
        const dayIdx = Math.floor(d.anchorCol / nZ);
        const a = d.anchorCol % nZ;
        const c = p.canChangeZug ? clamp(col - dayIdx * nZ, 0, nZ - 1) : a;
        const m1 = snapTo(Math.min(d.anchorMin, min), l.snap);
        const m2 = Math.max(snapTo(Math.max(d.anchorMin, min), l.snap), m1 + l.snap);
        return {
          date: l.days[dayIdx],
          zugIds: zugIdsFor(l, Math.min(a, c), Math.abs(c - a) + 1),
          startMin: clamp(m1, l.dayStart, l.dayEnd - l.snap),
          endMin: clamp(m2, l.dayStart + l.snap, l.dayEnd),
        };
      }
    }
  }

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved = d.moved || Math.abs(e.clientX - d.startX) > 3 || Math.abs(e.clientY - d.startY) > 3;
      if (!moved) return;
      setDrag({ ...d, moved, preview: computePreview(d, e) });
    };
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !d.moved) return;
      if (d.mode === 'create') p.onCreate(d.preview);
      else if (d.id != null && !sameDraft(d.orig, d.preview)) (d.clone ? p.onClone! : p.onCommit)(d.id, d.preview);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [drag !== null]);

  const startBlockDrag = (e: RPointerEvent, b: Block, mode: Mode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    p.onSelect(b.id);
    if (!p.canEdit(b)) return;
    e.preventDefault();
    const { col, min } = pointerAt(e);
    const g = blockGeom(l, b)!;
    const orig = { date: b.date, zugIds: b.zugIds, startMin: b.startMin, endMin: b.endMin };
    setDrag({
      mode,
      id: b.id,
      orig,
      startX: e.clientX,
      startY: e.clientY,
      grabCol: col - colOf(l, g.dayIdx, g.zugIdx),
      grabMin: min - b.startMin,
      anchorCol: col,
      anchorMin: min,
      preview: orig,
      moved: false,
      clone: mode === 'move' && e.altKey && !!p.onClone,
    });
  };

  const startCreate = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    p.onSelect(null);
    const { col, min } = pointerAt(e);
    p.onEmptyPointer?.(l.days[Math.floor(col / nZ)], min);
    if (!p.canCreateIn(col % nZ) || !serves(l.days[Math.floor(col / nZ)], l.zuege[col % nZ].id)) return;
    e.preventDefault();
    const draft = { date: l.days[Math.floor(col / nZ)], zugIds: [l.zuege[col % nZ].id], startMin: min, endMin: min };
    setDrag({ mode: 'create', id: null, orig: draft, startX: e.clientX, startY: e.clientY, grabCol: 0, grabMin: 0, anchorCol: col, anchorMin: min, preview: draft, moved: false, clone: false });
  };

  const onEmptyDoubleClick = (e: React.MouseEvent) => {
    const { col, min } = pointerAt(e);
    if (!p.canCreateIn(col % nZ) || !serves(l.days[Math.floor(col / nZ)], l.zuege[col % nZ].id)) return;
    const start = clamp(snapTo(min - 30, l.snap), l.dayStart, l.dayEnd - 60);
    p.onCreate({ date: l.days[Math.floor(col / nZ)], zugIds: [l.zuege[col % nZ].id], startMin: start, endMin: Math.min(start + 60, l.dayEnd) });
  };

  const hours: number[] = [];
  for (let m = Math.ceil(l.dayStart / 60) * 60; m <= l.dayEnd; m += 60) hours.push(m);
  const halfHours = hours.map((h) => h + 30).filter((m) => m < l.dayEnd);
  const locNr = (id: number | null) => p.locations.find((x) => x.id === id)?.nr;

  const timeAxis = (side: 'left' | 'right') => (
    <div
      className={`relative shrink-0 bg-white ${side === 'left' ? 'sticky left-0 z-10 border-r' : 'border-l'} border-slate-300`}
      style={{ width: l.axisW, height: gridH(l) }}
    >
      {hours.map((m) => (
        <div
          key={m}
          className="absolute w-full -translate-y-1/2 px-1 text-center text-[11px] tabular-nums text-slate-500"
          style={{ top: (m - l.dayStart) * l.ppm }}
        >
          {fmtTime(m).replace(':', '')}
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative select-none" style={{ width: l.axisW * 2 + gridW(l) }}>
      {/* Header: days and Züge */}
      <div className="sticky top-0 z-20 flex border-b border-slate-300 bg-white" style={{ height: l.headerH }}>
        <div className="sticky left-0 z-10 flex shrink-0 items-end justify-center border-r border-slate-300 bg-white pb-1 text-[11px] text-slate-500" style={{ width: l.axisW }}>
          {t('grid.time')}
        </div>
        {l.days.map((d, di) => (
          <div key={d} className={`flex shrink-0 flex-col ${di > 0 ? 'border-l-2 border-slate-400' : ''}`} style={{ width: nZ * l.colW }}>
            <div
              className={`flex flex-1 items-center justify-center gap-1.5 truncate px-1 text-xs font-semibold ${
                l.avorDays.includes(d) ? 'bg-amber-100 text-amber-900' : l.kvkDays?.includes(d) ? 'bg-sky-100 text-sky-900' : 'text-slate-800'
              }`}
            >
              {l.avorDays.includes(d) && <span className="rounded bg-amber-500 px-1 text-[10px] text-white">{t('duty.AVOR')}</span>}
              {l.kvkDays?.includes(d) && <span className="rounded bg-sky-600 px-1 text-[10px] text-white">{t('duty.KVK')}</span>}
              {weekday(d)} <span className="font-normal opacity-70">{fmtDate(d).slice(0, 6)}</span>
            </div>
            <div className="flex border-t border-slate-200">
              {l.zuege.map((z) => (
                <div
                  key={z.id}
                  className={`truncate border-l border-slate-200 px-0.5 py-0.5 text-center text-[11px] first:border-l-0 ${
                    z.id === p.highlightZugId
                      ? 'bg-orange-100 font-semibold text-orange-900'
                      : z.id === KDO_ID
                        ? 'bg-slate-200 font-semibold text-slate-700'
                        : 'text-slate-600'
                  }`}
                  style={{ width: l.colW }}
                  title={z.name}
                >
                  {z.name}
                  {badge(d, z.id) && (
                    <span className={`ml-0.5 rounded px-0.5 text-[9px] font-semibold text-white ${badge(d, z.id) === 'KVK' ? 'bg-sky-600' : badge(d, z.id) === 'AVOR' ? 'bg-amber-500' : 'bg-slate-500'}`}>
                      {t(`duty.${badge(d, z.id)!}`)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex shrink-0 items-end justify-center border-l border-slate-300 pb-1 text-[11px] text-slate-500" style={{ width: l.axisW }}>
          {t('grid.time')}
        </div>
      </div>

      <div className="flex">
        {timeAxis('left')}
        <div
          ref={gridRef}
          className="relative shrink-0 bg-white"
          style={{ width: gridW(l), height: gridH(l) }}
          onPointerDown={startCreate}
          onDoubleClick={onEmptyDoubleClick}
          onContextMenu={(e) => {
            if (!p.onEmptyMenu) return;
            e.preventDefault();
            const { col, min } = pointerAt(e);
            p.onEmptyMenu({ date: l.days[Math.floor(col / nZ)], zugId: l.zuege[col % nZ].id, min: clamp(snapTo(min, l.snap), l.dayStart, l.dayEnd) }, e.clientX, e.clientY);
          }}
        >
          {/* Column backgrounds */}
          {l.days.map((d, di) =>
            l.zuege.map((z, zi) => (
              <div
                key={`${d}-${z.id}`}
                title={serves(d, z.id) ? undefined : t('grid.noService', { zug: z.name })}
                className={`absolute top-0 h-full ${zi === 0 && di > 0 ? 'border-l-2 border-slate-400' : 'border-l border-slate-200'} ${
                  !serves(d, z.id)
                    ? 'col-off'
                    : badge(d, z.id) === 'KVK'
                      ? 'bg-sky-50/70'
                    : z.id === p.highlightZugId
                    ? 'bg-orange-50'
                    : z.id === KDO_ID
                      ? 'bg-slate-100'
                      : l.avorDays.includes(d)
                        ? 'bg-amber-50/60'
                        : di % 2
                          ? 'bg-slate-50/70'
                          : ''
                }`}
                style={{ left: colOf(l, di, zi) * l.colW, width: l.colW }}
              />
            )),
          )}
          {hours.map((m) => (
            <div key={m} className="pointer-events-none absolute w-full border-t border-slate-200" style={{ top: (m - l.dayStart) * l.ppm }} />
          ))}
          {halfHours.map((m) => (
            <div key={m} className="pointer-events-none absolute w-full border-t border-dashed border-slate-100" style={{ top: (m - l.dayStart) * l.ppm }} />
          ))}

          {/* Background slots */}
          {p.backgroundBlocks?.map((b) => {
            const r = rectOf(l, b);
            if (!r) return null;
            const color = BLOCK_TYPE_INFO[b.type].color;
            return (
              <div
                key={`bg${b.id}`}
                className={`pointer-events-none absolute overflow-hidden rounded-[3px] border-l-4 px-1.5 ${p.selectedBackgroundId === b.id ? 'ring-2 ring-zs-orange' : ''}`}
                style={{ left: r.left + 1, top: r.top + 1, width: r.width - 2, height: Math.max(r.height - 2, 6), borderColor: color, backgroundColor: `${color}1f` }}
              >
                <div className="truncate pt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
                  {b.title} · {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                </div>
              </div>
            );
          })}

          {/* Blocks */}
          {p.blocks.map((b) => {
            const live = drag && drag.id === b.id && drag.moved && !drag.clone ? { ...b, ...drag.preview } : b;
            const r = rectOf(l, live);
            if (!r) return null;
            const editable = p.canEdit(b);
            const selected = p.selectedId === b.id;
            const dim = p.dimOthers && p.highlightZugId != null && !b.zugIds.includes(p.highlightZugId);
            const info = BLOCK_TYPE_INFO[b.type];
            const nr = locNr(b.locationId);
            const short = r.height < 30;
            return (
              <div
                key={b.id}
                role="button"
                tabIndex={-1}
                aria-label={`${b.title}, ${fmtTime(live.startMin)} bis ${fmtTime(live.endMin)}`}
                data-block-id={b.id}
                className={`group absolute overflow-hidden rounded-[3px] border border-white/60 px-1 text-white shadow-sm transition-[box-shadow,opacity] ${
                  b.source === 'BAT' ? 'block-bat' : ''
                } ${selected ? 'z-10 ring-2 ring-zs-orange ring-offset-1' : ''} ${
                  p.conflictIds.has(b.id) ? 'outline outline-2 outline-red-500' : ''
                } ${drag?.id === b.id && drag.moved ? 'z-20 opacity-90 shadow-lg' : ''} ${dim ? 'opacity-35' : ''} ${
                  editable ? 'cursor-move' : 'cursor-pointer'
                }`}
                style={{
                  left: r.left + 1,
                  top: r.top + 1,
                  width: r.width - 2,
                  height: Math.max(r.height - 2, 6),
                  backgroundColor: info.color,
                }}
                onPointerDown={(e) => startBlockDrag(e, b, 'move')}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.onOpen(b.id);
                }}
                onContextMenu={(e) => {
                  if (!p.onBlockMenu) return;
                  e.preventDefault();
                  e.stopPropagation();
                  p.onSelect(b.id);
                  p.onBlockMenu(b.id, e.clientX, e.clientY);
                }}
                title={`${b.title}\n${fmtTime(live.startMin)}–${fmtTime(live.endMin)}${nr ? ` · Standort ${nr}` : ''}${b.verantwortlich ? `\nVerantw.: ${b.verantwortlich}` : ''}${b.notes ? `\n${b.notes}` : ''}`}
              >
                <div className={`flex items-start gap-1 leading-tight ${short ? 'text-[10px]' : 'pt-0.5 text-[11px]'}`}>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {b.title}
                    {nr != null && <span className="font-normal opacity-90"> ({nr})</span>}
                  </span>
                  {(b.locked || b.source === 'BAT') && <span aria-label="gesperrt">🔒</span>}
                </div>
                {!short && (
                  <div className="truncate text-[10px] leading-tight opacity-90">
                    {fmtTime(live.startMin)}–{fmtTime(live.endMin)}
                    {b.verantwortlich && ` · ${b.verantwortlich}`}
                  </div>
                )}
                {p.renderInner?.(live, r.height)}
                {editable && (
                  <>
                    <div className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize" onPointerDown={(e) => startBlockDrag(e, b, 'top')} />
                    <div className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" onPointerDown={(e) => startBlockDrag(e, b, 'bottom')} />
                    {p.canChangeZug && (
                      <>
                        <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => startBlockDrag(e, b, 'left')} />
                        <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => startBlockDrag(e, b, 'right')} />
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Copy preview (Alt-drag) */}
          {drag?.clone && drag.moved && (() => {
            const r = rectOf(l, drag.preview)!;
            const b = p.blocks.find((x) => x.id === drag.id);
            return (
              <div
                className="pointer-events-none absolute z-20 rounded-[3px] border-2 border-dashed border-white px-1 text-[11px] text-white opacity-80 shadow-lg"
                style={{ left: r.left + 1, top: r.top + 1, width: r.width - 2, height: r.height - 2, backgroundColor: b ? BLOCK_TYPE_INFO[b.type].color : '#64748b' }}
              >
                + Kopie {fmtTime(drag.preview.startMin)}
              </div>
            );
          })()}

          {/* New block preview */}
          {drag?.mode === 'create' && drag.moved && (() => {
            const r = rectOf(l, drag.preview)!;
            return (
              <div
                className="pointer-events-none absolute z-20 rounded-[3px] border-2 border-dashed border-zs-blue bg-blue-200/50 px-1 text-[11px] text-zs-blue"
                style={{ left: r.left + 1, top: r.top + 1, width: r.width - 2, height: r.height - 2 }}
              >
                {fmtTime(drag.preview.startMin)}–{fmtTime(drag.preview.endMin)}
              </div>
            );
          })()}
        </div>
        {timeAxis('right')}
      </div>
    </div>
  );
}
