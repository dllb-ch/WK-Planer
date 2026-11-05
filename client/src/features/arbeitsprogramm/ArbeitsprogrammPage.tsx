import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Block, BlockInput, Duty, ResourceKind } from '@shared/types';
import { BLOCK_TYPE_INFO } from '@shared/types';
import {
  apEditable,
  canCreateBlock,
  canEditApStructure,
  canEditBlock,
  canLockBlocks,
  canSpanZuege,
} from '@shared/permissions';
import { defaultDuty, dutyOf, fmtDate, fmtTime, isAvorDay, isKvkDay, parseTime, servesOnDay, wkDays } from '@shared/util';
import { useT } from '../../i18n';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, errMsg, Field, Modal, useToast } from '../../components/ui';
import { DaySelector, useDaySelection } from '../../components/DaySelector';
import { columnName, withKdo } from './columns';
import { BlockDialog } from './BlockDialog';
import { Briefkopf, usePrintPage } from '../../components/Briefkopf';
import { StandardBlocksDialog } from './StandardBlocksDialog';
import { useBlockMenu } from './useBlockMenu';
import { analyse, clamp, type Layout } from './geometry';
import { PlannerGrid, type Draft } from './PlannerGrid';
import { Sidebar } from './Sidebar';
import { toInput, useBlockOps } from './useBlockOps';
import { useIsMobile } from '../../components/useMedia';
import { BlockRequests, ResourceChips, useBlockResources, type ResourceChip } from '../ressourcen/BlockResources';

const AXIS_W = 44;
const HEADER_H = 46;
const PRINT_W = 1060;
const PRINT_H = 640;

function loadZoom() {
  try {
    const z = JSON.parse(localStorage.getItem('ap-zoom') ?? '');
    if (typeof z.colW === 'number' && typeof z.ppm === 'number') return z as { colW: number; ppm: number };
  } catch {
    /* default */
  }
  return { colW: 96, ppm: 1.2 };
}

type DialogState =
  | { kind: 'block'; id: number; request?: ResourceKind }
  | { kind: 'new'; initial: BlockInput }
  | { kind: 'standardtag' }
  | { kind: 'copy' }
  | { kind: 'settings' }
  | null;

export function ArbeitsprogrammPage({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const { t, lang } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { wk, zuege, locations, blocks } = detail;
  const ops = useBlockOps(wk.id);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [zoom, setZoom] = useState(loadZoom);
  const [printing, setPrinting] = useState(false);
  const mobile = useIsMobile();
  const [view, setView] = useState<'grid' | 'list'>(me.role === 'KADER' || mobile ? 'list' : 'grid');
  const [dimOthers, setDimOthers] = useState(me.role === 'KADER');
  const [showResources, setShowResources] = useState(true);
  const resourcesOf = useBlockResources(wk);

  useEffect(() => {
    try {
      localStorage.setItem('ap-zoom', JSON.stringify(zoom));
    } catch {
      /* ignore */
    }
  }, [zoom]);

  const daySel = useDaySelection(wk, 'ap');
  const days = daySel.days;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the «Kdo» column is named in the language
  const columns = useMemo(() => withKdo(wk.kpId, zuege), [wk.kpId, zuege, lang]);
  const cols = Math.max(1, days.length * columns.length);
  const layout: Layout = {
    days,
    zuege: columns,
    avorDays: wk.avorDays,
    kvkDays: wk.kvkDays,
    serves: (d, zugId) => servesOnDay(wk, d, zugId),
    duty: (d, zugId) => dutyOf(wk, d, zugId),
    dayStart: wk.dayStart,
    dayEnd: wk.dayEnd,
    snap: wk.snapMin,
    axisW: printing ? 34 : AXIS_W,
    headerH: HEADER_H,
    colW: printing ? (PRINT_W - 68) / cols : zoom.colW,
    ppm: printing ? (PRINT_H - HEADER_H) / (wk.dayEnd - wk.dayStart) : zoom.ppm,
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- hints are texts in the language
  const { hints, conflictIds } = useMemo(() => analyse(blocks, columns, locations), [blocks, columns, locations, lang]);
  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const canEdit = useCallback((b: Block) => canEditBlock(me, wk, b), [me, wk]);
  const source = me.role === 'BAT' ? 'BAT' : 'KP';
  const canCreateIn = (zugIdx: number) =>
    canCreateBlock(me, wk, { zugIds: [columns[zugIdx]?.id], locked: me.role === 'BAT', source });
  const canCreateAny = columns.some((_, i) => canCreateIn(i));
  const ownZugId = me.zugId;

  usePrintPage(`Arbeitsprogramm ${wk.title} · Stand ${fmtDate(new Date().toISOString().slice(0, 10))}`, { landscape: true, margin: '7mm 8mm 11mm 8mm' });

  // Kp Kdt: Standort directly from rooms and terrain of the catalogue (added to the legend, linked, when chosen;
  // the block then reserves it).
  const catalogue = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId), enabled: canEditApStructure(me, wk) });
  const catalogueProps = canEditApStructure(me, wk)
    ? {
        catalogue: (catalogue.data ?? [])
          .filter((r) => r.kind === 'RAUM' || r.kind === 'GELAENDE')
          .map((r) => ({ id: r.id, name: r.name, kind: r.kind as 'RAUM' | 'GELAENDE' })),
        onAddLocation: async (name: string, resourceId: number) => {
          try {
            // A legend entry of that name without link is linked instead of adding a second one.
            const same = locations.find((l) => l.resourceId == null && l.name === name);
            const nr = Math.max(0, ...locations.map((l) => l.nr)) + 1;
            const list = locations.map((l) => ({ id: l.id, nr: l.nr, name: l.name, ...(l === same ? { resourceId } : {}) }));
            const saved = await api.saveLocations(wk.id, same ? list : [...list, { nr, name, resourceId }]);
            await qc.invalidateQueries({ queryKey: ['wk', wk.id] });
            return saved.find((l) => l.resourceId === resourceId)?.id ?? null;
          } catch (e) {
            toast(errMsg(e), 'error');
            return null;
          }
        },
      }
    : {};

  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
    setPrinting(false);
  };

  // ---- Commands ----

  const commitDraft = (id: number, d: Draft) => ops.update(id, d);

  const newBlock = (d: Draft) =>
    setDialog({
      kind: 'new',
      initial: {
        ...d,
        title: '',
        type: me.role === 'BAT' ? 'DIVERSES' : 'AUSBILDUNG',
        locationId: null,
        verantwortlich: '',
        notes: '',
        locked: me.role === 'BAT',
      },
    });

  const newBlockDefault = () => {
    const zugIds = me.role === 'ZFHR' && ownZugId ? [ownZugId] : zuege.length ? zuege.map((z) => z.id) : [columns[0].id];
    const start = clamp(8 * 60, wk.dayStart, wk.dayEnd - 60);
    newBlock({ date: days[0], zugIds, startMin: start, endMin: start + 60 });
  };

  const showStandard = canEditApStructure(me, wk) || (ownZugId !== null && canCreateBlock(me, wk, { zugIds: [ownZugId], locked: false, source: 'KP' }));
  const blockMenu = useBlockMenu({
    detail,
    ops,
    days,
    onEdit: (id) => setDialog({ kind: 'block', id }),
    onDuplicate: (initial) => setDialog({ kind: 'new', initial }),
    onNew: (at) => {
      const start = clamp(at.min, wk.dayStart, wk.dayEnd - 30);
      newBlock({ date: at.date, zugIds: [at.zugId], startMin: start, endMin: Math.min(start + 60, wk.dayEnd) });
    },
    canCreateAt: (zugId) => canCreateIn(columns.findIndex((c) => c.id === zugId)),
    extraEmptyItems: () => (showStandard ? [{ label: t('ap.insertStandard'), icon: '▦', onClick: () => setDialog({ kind: 'standardtag' }) }] : []),
  });

  const nudge = (b: Block, dMin: number, dDay: number, resize: boolean) => {
    const dayIdx = clamp(days.indexOf(b.date) + dDay, 0, days.length - 1);
    if (resize) {
      const end = clamp(b.endMin + dMin, b.startMin + wk.snapMin, wk.dayEnd);
      if (end !== b.endMin) ops.update(b.id, { endMin: end });
      return;
    }
    const dur = b.endMin - b.startMin;
    const start = clamp(b.startMin + dMin, wk.dayStart, wk.dayEnd - dur);
    if (start !== b.startMin || days[dayIdx] !== b.date) ops.update(b.id, { startMin: start, endMin: start + dur, date: days[dayIdx] });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? ops.redo() : ops.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        ops.redo();
        return;
      }
      if (e.key === 'Escape') setSelectedId(null);
      if (!selected) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        setDialog({ kind: 'block', id: selected.id });
        return;
      }
      if (!canEdit(selected)) return;
      const s = wk.snapMin;
      const map: Record<string, [number, number]> = { ArrowUp: [-s, 0], ArrowDown: [s, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (map[e.key]) {
        e.preventDefault();
        nudge(selected, map[e.key][0], e.shiftKey ? 0 : map[e.key][1], e.shiftKey);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        ops.remove(selected.id);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const dialogBlock = dialog?.kind === 'block' ? blocks.find((b) => b.id === dialog.id) : undefined;
  const editable = apEditable(wk);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex rounded-md border border-slate-300 p-0.5">
            {(['grid', 'list'] as const).map((v) => (
              <button
                key={v}
                className={`rounded px-2.5 py-1 text-xs font-medium ${view === v ? 'bg-zs-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setView(v)}
              >
                {v === 'grid' ? t('ap.grid') : t('ap.list')}
              </button>
            ))}
          </div>
          <DaySelector wk={wk} all={daySel.all} days={days} onChange={daySel.set} />
          {canCreateAny && view === 'grid' && (
            <Button variant="primary" onClick={newBlockDefault}>
              {t('ap.newBlockButton')}
            </Button>
          )}
          {view === 'grid' && (
            <>
              <Button variant="ghost" disabled={!ops.canUndo} onClick={ops.undo} title={t('ap.undo')}>
                ↶
              </Button>
              <Button variant="ghost" disabled={!ops.canRedo} onClick={ops.redo} title={t('ap.redo')}>
                ↷
              </Button>
            </>
          )}
          {(canEditApStructure(me, wk) || (ownZugId !== null && canCreateBlock(me, wk, { zugIds: [ownZugId], locked: false, source: 'KP' }))) && (
            <Button className="max-md:hidden" onClick={() => setDialog({ kind: 'standardtag' })}>
              {t('ap.standardBlocks')}
            </Button>
          )}
          {canEditApStructure(me, wk) && (
            <Button className="max-md:hidden" onClick={() => setDialog({ kind: 'copy' })}>
              {t('ap.copyFromWk')}
            </Button>
          )}
          {(canEditApStructure(me, wk) || (me.role === 'BAT' && wk.status !== 'FREIGEGEBEN')) && (
            <Button onClick={() => setDialog({ kind: 'settings' })}>{t('ap.settings')}</Button>
          )}
          <span className="flex-1" />
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showResources} onChange={(e) => setShowResources(e.target.checked)} /> {t('ap.resources')}
          </label>
          {ownZugId && zuege.some((z) => z.id === ownZugId) && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={dimOthers} onChange={(e) => setDimOthers(e.target.checked)} /> {t('ap.onlyMyZug')}
            </label>
          )}
          {view === 'grid' && (
            <div className="flex items-center gap-1 text-xs text-slate-500 max-md:hidden">
              <span>{t('ap.width')}</span>
              <input type="range" min={50} max={200} value={zoom.colW} onChange={(e) => setZoom({ ...zoom, colW: Number(e.target.value) })} className="w-20" aria-label={t('ap.columnWidth')} />
              <span>{t('ap.height')}</span>
              <input type="range" min={6} max={25} value={zoom.ppm * 10} onChange={(e) => setZoom({ ...zoom, ppm: Number(e.target.value) / 10 })} className="w-20" aria-label={t('ap.rowHeight')} />
            </div>
          )}
          <Button className="max-md:hidden" onClick={print}>
            {t('common.print')}
          </Button>
        </div>

        {!editable && me.role !== 'KADER' && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            {wk.status === 'FREIGEGEBEN'
              ? t('ap.frozen')
              : t('ap.submitted')}
          </div>
        )}

        {/* Print header */}
        <Briefkopf printOnly compact className="!mb-2" title={t('ap.printTitle', { title: wk.title })} subtitle={`${fmtDate(wk.startDate)} – ${fmtDate(wk.endDate)}`} />

        {view === 'grid' ? (
          <div className={`min-h-0 flex-1 ${printing ? '' : 'overflow-auto'} bg-slate-50 p-2`}>
            <PlannerGrid
                layout={layout}
                blocks={blocks}
                locations={locations}
                selectedId={printing ? null : selectedId}
                conflictIds={printing ? new Set() : conflictIds}
                highlightZugId={printing ? null : ownZugId}
                dimOthers={dimOthers && !printing}
                canEdit={canEdit}
                canCreateIn={canCreateIn}
                canChangeZug={canSpanZuege(me)}
                onSelect={setSelectedId}
                onCommit={commitDraft}
                onOpen={(id) => setDialog({ kind: 'block', id })}
                onCreate={newBlock}
                onBlockMenu={printing ? undefined : blockMenu.onBlockMenu}
                onEmptyMenu={printing ? undefined : blockMenu.onEmptyMenu}
                renderInner={showResources ? (b, h) => (h >= 40 ? <ResourceChips chips={resourcesOf(b)} onColor /> : null) : undefined}
              />
          </div>
        ) : (
          <ListView detail={detail} days={days} zugId={dimOthers ? ownZugId : null} resourcesOf={showResources ? resourcesOf : undefined} />
        )}

        {/* Print legend */}
        <div className="print-only mt-2 text-[10px]">
          <b>{t('ap.legend')}</b> {locations.map((l) => `${l.nr} = ${l.name}`).join(' · ')} · {t('ap.legendMoveLocked')}
        </div>
      </div>

      {!printing && !mobile && (
        <Sidebar
          wkId={wk.id}
          selected={selected}
          zuege={columns}
          locations={locations}
          hints={hints}
          selectedResources={selected ? resourcesOf(selected) : []}
          canEditSelected={!!selected && canEdit(selected)}
          canEditLocations={canEditApStructure(me, wk)}
          onOpen={(id) => setDialog({ kind: 'block', id })}
          onSelect={setSelectedId}
        />
      )}

      {blockMenu.element}
      {/* Dialogs */}
      {dialog?.kind === 'block' && dialogBlock && (
        <BlockDialog
          key={dialogBlock.id + ':' + dialogBlock.version}
          title={canEdit(dialogBlock) ? t('ap.editBlock') : t('ap.block')}
          initial={toInput(dialogBlock)}
          days={daySel.all}
          zuege={columns}
          locations={locations}
          {...catalogueProps}
          readOnly={!canEdit(dialogBlock)}
          canSpan={canSpanZuege(me)}
          canLock={canLockBlocks(me) && dialogBlock.source === 'KP'}
          lockedByBat={dialogBlock.source === 'BAT'}
          onClose={() => setDialog(null)}
          onSave={async (b) => {
            if (await ops.update(dialogBlock.id, b)) setDialog(null);
          }}
          onDelete={async () => {
            if (await ops.remove(dialogBlock.id)) {
              setDialog(null);
              setSelectedId(null);
            }
          }}
          onDuplicate={() => setDialog({ kind: 'new', initial: { ...toInput(dialogBlock), locked: me.role === 'BAT' } })}
          resources={(b) => <BlockRequests detail={detail} block={dialogBlock} draft={b} initialKind={dialog.request} />}
        />
      )}
      {dialog?.kind === 'new' && (
        <BlockDialog
          title={t('ap.newBlock')}
          initial={dialog.initial}
          days={daySel.all}
          zuege={columns}
          locations={locations}
          {...catalogueProps}
          readOnly={false}
          canSpan={canSpanZuege(me)}
          canLock={canLockBlocks(me)}
          lockedByBat={false}
          onClose={() => setDialog(null)}
          onSave={async (b) => {
            const created = await ops.create(b);
            if (created) {
              setDialog(null);
              setSelectedId(created.id);
            }
          }}
          resources={(b) => (
            <BlockRequests
              detail={detail}
              block={null}
              draft={b}
              onRequestNew={async (kind) => {
                const created = await ops.create({ ...b, title: b.title.trim() });
                if (created) {
                  setSelectedId(created.id);
                  setDialog({ kind: 'block', id: created.id, request: kind });
                }
              }}
            />
          )}
        />
      )}
      {dialog?.kind === 'standardtag' && <StandardBlocksDialog detail={detail} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'copy' && <CopyDialog detail={detail} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'settings' && (
        <SettingsDialog
          detail={detail}
          onClose={() => setDialog(null)}
          onError={(e) => toast(errMsg(e), 'error')}
        />
      )}
    </div>
  );
}

// ---- List view ("Mein Programm") ----

function ListView({
  detail,
  days,
  zugId,
  resourcesOf,
}: {
  detail: WkDetail;
  days: string[];
  zugId: number | null;
  resourcesOf?: (b: Block) => ResourceChip[];
}) {
  const { wk, zuege, locations, blocks } = detail;
  const { t, weekday } = useT();
  const zugName = (ids: number[]) =>
    zuege.length > 1 && zuege.every((z) => ids.includes(z.id)) ? t('ap.allZuege') : ids.map((id) => columnName(zuege, id)).join(', ');
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
      {zugId && <p className="no-print mb-3 text-sm text-slate-600">{t('ap.programFor', { name: zuege.find((z) => z.id === zugId)?.name ?? '' })}</p>}
      <div className="space-y-4">
        {days.map((d) => {
          const list = blocks
            .filter((b) => b.date === d && (!zugId || b.zugIds.includes(zugId)))
            .sort((a, b) => a.startMin - b.startMin || a.zugIds.length - b.zugIds.length);
          return (
            <section key={d} className="break-inside-avoid rounded-lg border border-slate-200 bg-white">
              <h3 className={`border-b px-4 py-2 text-sm font-semibold ${isAvorDay(wk, d) ? 'bg-amber-50' : ''}`}>
                {weekday(d)}, {fmtDate(d)}
                {isAvorDay(wk, d) && <span className="ml-2 rounded bg-amber-500 px-1.5 text-[10px] text-white">{t('duty.AVOR')}</span>}
              </h3>
              {list.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">{t('ap.noEntries')}</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {list.map((b) => {
                      const loc = locations.find((l) => l.id === b.locationId);
                      return (
                        <tr key={b.id} className="border-t border-slate-100 first:border-t-0 align-top">
                          <td className="w-24 whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600 sm:w-28 sm:px-4">
                            {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BLOCK_TYPE_INFO[b.type].color }} />
                            <span className="font-medium">{b.title}</span>
                            {b.notes && <div className="text-xs text-slate-500">{b.notes}</div>}
                            {resourcesOf && <ResourceChips chips={resourcesOf(b)} />}
                            <div className="text-xs text-slate-500 md:hidden">
                              {[loc && `(${loc.nr}) ${loc.name}`, b.verantwortlich, zugName(b.zugIds)].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-slate-600 max-md:hidden">{loc ? `(${loc.nr}) ${loc.name}` : ''}</td>
                          <td className="px-2 py-1.5 text-slate-600 max-md:hidden">{b.verantwortlich}</td>
                          <td className="px-4 py-1.5 text-right text-xs text-slate-500 max-md:hidden">{zugName(b.zugIds)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---- Copy from another WK ----

function CopyDialog({ detail, onClose }: { detail: WkDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useT();
  const wks = useQuery({ queryKey: ['wks'], queryFn: api.wks });
  const others = (wks.data ?? []).filter((w) => w.kpId === detail.wk.kpId && w.id !== detail.wk.id);
  const [src, setSrc] = useState<number | null>(null);
  const run = async () => {
    try {
      const r = await api.copyFrom(detail.wk.id, src!);
      await qc.invalidateQueries({ queryKey: ['wk', detail.wk.id] });
      toast(t('ap.copied', { n: r.created }));
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <Modal
      title={t('ap.copyTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!src} onClick={run}>
            {t('ap.copy')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        {t('ap.copyHint')}
      </p>
      {others.length === 0 ? (
        <p className="text-sm text-slate-500">{t('ap.noOtherWks')}</p>
      ) : (
        <Field label={t('ap.source')}>
          <select className="input" value={src ?? ''} onChange={(e) => setSrc(Number(e.target.value) || null)}>
            <option value="">{t('common.choose')}</option>
            {others.map((w) => (
              <option key={w.id} value={w.id}>
                {t('ap.sourceOption', { title: w.title, date: fmtDate(w.startDate), n: w.blockCount })}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Modal>
  );
}

const DUTY_CLASS: Record<Duty, string> = {
  WK: 'border-slate-300 bg-white',
  KVK: 'border-sky-300 bg-sky-50 text-sky-900',
  AVOR: 'border-amber-300 bg-amber-50 text-amber-900',
  NONE: 'border-slate-200 bg-slate-100 text-slate-400',
};

// ---- WK settings ----

function SettingsDialog({ detail, onClose, onError }: { detail: WkDetail; onClose: () => void; onError: (e: unknown) => void }) {
  const qc = useQueryClient();
  const { t, tn, weekdayShort } = useT();
  const { wk, zuege } = detail;
  const [f, setF] = useState({
    title: wk.title,
    startDate: wk.startDate,
    endDate: wk.endDate,
    dayStart: fmtTime(wk.dayStart),
    dayEnd: fmtTime(wk.dayEnd),
    snapMin: wk.snapMin,
    avorDays: wk.avorDays,
    kvkDays: wk.kvkDays,
    dayDuty: wk.dayDuty,
  });
  const [newDay, setNewDay] = useState('');
  const days = wkDays(f);
  const setDuty = (d: string, zugId: number, duty: Duty) => {
    const perZug = { ...f.dayDuty[d], [String(zugId)]: duty };
    // Same as the type of the day: no entry needed.
    if (duty === defaultDuty(f, d)) delete perZug[String(zugId)];
    const dayDuty = { ...f.dayDuty, [d]: perZug };
    if (!Object.keys(perZug).length) delete dayDuty[d];
    setF({ ...f, dayDuty });
  };
  const addDay = (kind: 'avor' | 'kvk') => {
    if (!newDay) return;
    const avorDays = f.avorDays.filter((x) => x !== newDay);
    const kvkDays = f.kvkDays.filter((x) => x !== newDay);
    setF({ ...f, avorDays: kind === 'avor' ? [...avorDays, newDay].sort() : avorDays, kvkDays: kind === 'kvk' ? [...kvkDays, newDay].sort() : kvkDays });
    setNewDay('');
  };
  const removeDay = (d: string) => {
    const dayDuty = { ...f.dayDuty };
    delete dayDuty[d];
    setF({ ...f, avorDays: f.avorDays.filter((x) => x !== d), kvkDays: f.kvkDays.filter((x) => x !== d), dayDuty });
  };
  const save = async () => {
    try {
      await api.updateWk(wk.id, { ...f, dayStart: parseTime(f.dayStart), dayEnd: parseTime(f.dayEnd) });
      await qc.invalidateQueries({ queryKey: ['wk', wk.id] });
      qc.invalidateQueries({ queryKey: ['wks'] });
      onClose();
    } catch (e) {
      onError(e);
    }
  };
  const chip = (d: string, kind: 'AVOR' | 'KVK') => (
    <span key={d} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm ${kind === 'AVOR' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}>
      <b className="text-[10px]">{t(`duty.${kind}`)}</b> {weekdayShort(d)} {fmtDate(d)}
      <button className="opacity-70 hover:text-red-600" onClick={() => removeDay(d)} aria-label={t('ap.removeDay', { kind: t(`duty.${kind}`) })}>
        ✕
      </button>
    </span>
  );
  return (
    <Modal
      title={t('ap.settingsTitle')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('dash.designation')}>
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label={t('ap.firstWkDay')}>
          <input type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </Field>
        <Field label={t('ap.lastWkDay')}>
          <input type="date" className="input" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </Field>
        <Field label={t('dash.dayStart')}>
          <input type="time" className="input" value={f.dayStart} onChange={(e) => setF({ ...f, dayStart: e.target.value })} />
        </Field>
        <Field label={t('dash.dayEnd')}>
          <input type="time" className="input" value={f.dayEnd} onChange={(e) => setF({ ...f, dayEnd: e.target.value })} />
        </Field>
        <Field label={t('ap.snap')}>
          <select className="input" value={f.snapMin} onChange={(e) => setF({ ...f, snapMin: Number(e.target.value) })}>
            {[5, 10, 15, 30, 60].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
      </div>
      <div>
        <span className="label">{t('ap.extraDays')}</span>
        <p className="mb-1 text-xs text-slate-500">
          {tn('ap.extraDaysHint', { avor: <b>{t('duty.AVOR')}</b>, kvk: <b>{t('duty.KVK')}</b> })}
        </p>
        <div className="flex flex-wrap gap-2">
          {[...f.avorDays.map((d) => chip(d, 'AVOR')), ...f.kvkDays.map((d) => chip(d, 'KVK'))]}
          {f.avorDays.length + f.kvkDays.length === 0 && <span className="text-sm text-slate-400">{t('ap.noneDays')}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input type="date" className="input !w-44" value={newDay} onChange={(e) => setNewDay(e.target.value)} aria-label={t('ap.day')} />
          <Button disabled={!newDay} onClick={() => addDay('avor')}>
            {t('ap.addAvorDay')}
          </Button>
          <Button disabled={!newDay} onClick={() => addDay('kvk')}>
            {t('ap.addKvkDay')}
          </Button>
        </div>
      </div>
      {zuege.length > 0 && days.length > 0 && (
        <div>
          <span className="label">{t('ap.dutyPerZug')}</span>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="pr-3 text-left font-medium">{t('common.zug')}</th>
                  {days.map((d) => (
                    <th key={d} className={`px-1 text-center font-medium ${isAvorDay(f, d) ? 'text-amber-700' : isKvkDay(f, d) ? 'text-sky-700' : ''}`}>
                      {isAvorDay(f, d) ? t('duty.AVOR') : isKvkDay(f, d) ? t('duty.KVK') : weekdayShort(d)}
                      <div className="font-normal tabular-nums">{fmtDate(d).slice(0, 6)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 text-slate-500">
                  <td className="py-1 pr-3">{t('kdo')}</td>
                  {days.map((d) => (
                    <td key={d} className="text-center">
                      ✓
                    </td>
                  ))}
                </tr>
                {zuege.map((z) => (
                  <tr key={z.id} className="border-t border-slate-100">
                    <td className="py-1 pr-3">{z.name}</td>
                    {days.map((d) => {
                      const duty = dutyOf(f, d, z.id);
                      const differs = duty !== defaultDuty(f, d);
                      return (
                        <td key={d} className="px-0.5 py-0.5 text-center">
                          <select
                            className={`rounded border px-0.5 py-0.5 text-xs ${DUTY_CLASS[duty]} ${differs ? 'font-semibold ring-1 ring-zs-blue' : ''}`}
                            value={duty}
                            onChange={(e) => setDuty(d, z.id, e.target.value as Duty)}
                            aria-label={`${z.name} ${fmtDate(d)}`}
                          >
                            {(['WK', 'KVK', 'AVOR', 'NONE'] as Duty[]).map((x) => (
                              <option key={x} value={x}>
                                {x === 'NONE' ? '–' : t(`duty.${x}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t('ap.dutyHint', { wk: t('duty.WK'), kvk: t('duty.KVK'), avor: t('duty.AVOR') })}
          </p>
        </div>
      )}
    </Modal>
  );
}
