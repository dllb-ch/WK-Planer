import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Block, BlockDetail, BlockInput, DetailInput, ResourceKind, Zug, ZugGroup } from '@shared/types';
import { BLOCK_TYPE_INFO, emptyBestand } from '@shared/types';
import {
  canCreateAv,
  canCreateBlock,
  canEditBlock,
  canEditDetails,
  canRequestResource,
  canViewZug,
} from '@shared/permissions';
import { dutyOf, fmtDate, fmtTime, isAvorDay, isKvkDay, parseTime, servesOnDay, weekday, wkDays } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, Empty, useToast } from '../../components/ui';
import { DaySelector, useDaySelection } from '../../components/DaySelector';
import { useIsMobile } from '../../components/useMedia';
import { PersonSelect } from '../../components/PersonSelect';
import { BlockDialog } from '../arbeitsprogramm/BlockDialog';
import { analyse, clamp, type Layout } from '../arbeitsprogramm/geometry';
import { PlannerGrid, type Draft } from '../arbeitsprogramm/PlannerGrid';
import { toInput, useBlockOps } from '../arbeitsprogramm/useBlockOps';
import { useBlockMenu } from '../arbeitsprogramm/useBlockMenu';
import { RequestBadge } from '../ressourcen/RessourcenPage';
import { BlockRequests, ResourceChips, useBlockResources } from '../ressourcen/BlockResources';
import { RequestDialog } from '../ressourcen/RequestDialog';
import { DetailCard, GroupPicker, GroupsDialog, groupLabel, toDetailInput, TurnusDialog, useSaveDetails } from './groups';

const AXIS_W = 44;

/** Only the assigned Zug: Grobprogramm blocks with the Zfhr's detail plan, documents and requests per slot. */
export function ZugPage({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const { wk, zuege } = detail;
  const visible = zuege.filter((z) => canViewZug(me, wk, z.id));
  const [zugId, setZugId] = useState<number | null>(visible.find((z) => z.id === me.zugId)?.id ?? visible[0]?.id ?? null);
  const zug = zuege.find((z) => z.id === zugId);
  const daySel = useDaySelection(wk, 'zug');
  const [view, setView] = useState<'grid' | 'zeitplan'>('grid');
  const mobile = useIsMobile();

  if (!zug) return <Empty>Kein Zug zugewiesen.</Empty>;
  // Only the days on which the Zug serves.
  const zugAll = daySel.all.filter((d) => servesOnDay(wk, d, zug.id));
  const zugDays = daySel.days.filter((d) => servesOnDay(wk, d, zug.id));
  const shownDays = zugDays.length ? zugDays : zugAll;
  const pickable = visible.length > 1 && !(me.role === 'KADER' || (me.role === 'ZFHR' && me.zugId === zug.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        {pickable ? (
          <select className="input !w-auto font-semibold" value={zug.id} onChange={(e) => setZugId(Number(e.target.value))} aria-label="Zug">
            {visible.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded bg-orange-100 px-2.5 py-1 text-sm font-semibold text-orange-900">{zug.name}</span>
        )}
        <div className="flex rounded-md border border-slate-300 p-0.5 max-md:hidden">
          {(['grid', 'zeitplan'] as const).map((v) => (
            <button
              key={v}
              className={`rounded px-2.5 py-1 text-xs font-medium ${view === v ? 'bg-zs-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              onClick={() => setView(v)}
            >
              {v === 'grid' ? 'Raster' : 'Zeitplan'}
            </button>
          ))}
        </div>
        {!mobile && <DaySelector wk={wk} all={zugAll} days={shownDays} onChange={daySel.set} />}
        <span className="flex-1" />
        <Button className="max-md:hidden" onClick={() => window.print()}>
          Drucken
        </Button>
      </div>
      {mobile ? (
        <MobileZug key={zug.id} detail={detail} zug={zug} />
      ) : view === 'grid' ? (
        <ZugGrid key={zug.id} detail={detail} zug={zug} days={shownDays} />
      ) : (
        <Zeitplan detail={detail} zug={zug} days={shownDays} />
      )}
    </div>
  );
}

type Selection = { kind: 'block'; id: number } | { kind: 'detail'; blockId: number; sig: string } | null;

/** Identifies a sequence across saves (the server re-creates the rows of a block on every save). */
const sigOf = (d: DetailInput) => `${d.startMin}|${d.endMin}|${d.groupIds.join('.')}|${d.title}`;

function ZugGrid({ detail, zug, days }: { detail: WkDetail; zug: Zug; days: string[] }) {
  const me = useUser();
  const toast = useToast();
  const { wk, blocks, locations, details } = detail;
  const ops = useBlockOps(wk.id);
  const saveDetails = useSaveDetails(wk.id);
  const resourcesOf = useBlockResources(wk);
  const [sel, setSel] = useState<Selection>(null);
  const [dialog, setDialog] = useState<{ kind: 'edit'; id: number; request?: ResourceKind } | { kind: 'new'; initial: BlockInput } | { kind: 'groups' } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [ppm, setPpm] = useState(1.6);
  const [lanesOn, setLanesOn] = useState(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const groups = useMemo(() => detail.groups.filter((g) => g.zugId === zug.id), [detail.groups, zug.id]);
  const editDetails = canEditDetails(me, wk, zug.id);
  const lanes = lanesOn && groups.length >= 2;
  const zugBlocks = useMemo(() => blocks.filter((b) => b.zugIds.includes(zug.id)), [blocks, zug.id]);
  const detailsOf = (blockId: number) => details.filter((d) => d.blockId === blockId && d.zugId === zug.id);
  const laneCols: Zug[] = useMemo(() => groups.map((g) => ({ id: g.id, kpId: zug.kpId, name: g.name, order: g.sort, zfhrUserId: null, soll: emptyBestand(), ist: emptyBestand(), gruppen: [] })), [groups, zug.kpId]);
  const columns = useMemo(() => (lanes ? laneCols : [zug]), [lanes, laneCols, zug]);
  const allLanes = laneCols.map((c) => c.id);

  // In group mode the sequences are the interactive blocks; pseudo ids map back to the detail.
  const { detailBlocks, byPseudo } = useMemo(() => {
    const byPseudo = new Map<number, BlockDetail>();
    const detailBlocks: Block[] = [];
    if (lanes) {
      let n = 0;
      for (const b of zugBlocks) {
        for (const d of details.filter((x) => x.blockId === b.id && x.zugId === zug.id)) {
          const id = ++n;
          byPseudo.set(id, d);
          const zugIds = d.groupIds.length ? allLanes.filter((g) => d.groupIds.includes(g)) : allLanes;
          detailBlocks.push({ ...b, id, startMin: d.startMin, endMin: d.endMin, zugIds, title: d.title, verantwortlich: d.verantwortlich, notes: '', locked: false, source: 'KP' });
        }
      }
    }
    return { detailBlocks, byPseudo };
    // allLanes is derived from laneCols
  }, [lanes, zugBlocks, details, zug.id, laneCols]);

  const backgroundBlocks = useMemo(() => (lanes ? zugBlocks.map((b) => ({ ...b, zugIds: allLanes })) : undefined), [lanes, zugBlocks, laneCols]);
  const layout: Layout = {
    days,
    zuege: columns,
    avorDays: wk.avorDays,
    kvkDays: wk.kvkDays,
    duty: (d) => dutyOf(wk, d, zug.id),
    dayStart: wk.dayStart,
    dayEnd: wk.dayEnd,
    snap: lanes ? 5 : wk.snapMin,
    axisW: AXIS_W,
    headerH: 46,
    colW: Math.max(lanes ? 80 : 170, Math.floor((width - 2 * AXIS_W - 20) / Math.max(1, days.length * columns.length))),
    ppm,
  };
  const gridBlocks = lanes ? detailBlocks : zugBlocks;
  const { conflictIds } = useMemo(() => analyse(gridBlocks, columns, lanes ? [] : locations), [gridBlocks, columns, lanes, locations]);

  const selectedBlockId = sel?.kind === 'block' ? sel.id : sel?.kind === 'detail' ? sel.blockId : null;
  const selectedBlock = zugBlocks.find((b) => b.id === selectedBlockId) ?? null;
  const selectedDetail = sel?.kind === 'detail' ? (details.find((d) => d.blockId === sel.blockId && d.zugId === zug.id && sigOf(d) === sel.sig) ?? null) : null;
  const selectedPseudo = selectedDetail ? ([...byPseudo].find(([, d]) => d === selectedDetail)?.[0] ?? null) : null;
  const canCreateIn = () => canCreateBlock(me, wk, { zugIds: [zug.id], locked: false, source: 'KP' });
  const dialogBlock = dialog?.kind === 'edit' ? zugBlocks.find((b) => b.id === dialog.id) : undefined;

  // ---- Sequence placement in group mode ----
  const parentAt = (date: string, min: number) => zugBlocks.find((b) => b.date === date && min >= b.startMin && min < b.endMin);
  const fit = (d: Draft, parent: Block) => {
    const dur = Math.min(d.endMin - d.startMin, parent.endMin - parent.startMin);
    const startMin = clamp(d.startMin, parent.startMin, parent.endMin - dur);
    return { startMin, endMin: startMin + dur };
  };
  const toGroups = (laneIds: number[]) => (laneIds.length >= allLanes.length ? [] : laneIds);

  async function place(pseudo: number | null, d: Draft, keepOriginal: boolean) {
    const original = pseudo != null ? byPseudo.get(pseudo) : undefined;
    const from = original ? zugBlocks.find((b) => b.id === original.blockId) : undefined;
    const target = parentAt(d.date, d.startMin) ?? (from && from.date === d.date ? from : undefined);
    if (!target) {
      toast('Sequenzen liegen immer innerhalb eines Zeitfensters des Grobprogramms', 'error');
      return;
    }
    const next: DetailInput = {
      title: original?.title ?? 'Neue Sequenz',
      verantwortlich: original?.verantwortlich ?? '',
      ...fit(d, target),
      groupIds: toGroups(d.zugIds),
    };
    const rest = (blockId: number) => detailsOf(blockId).filter((x) => keepOriginal || x !== original).map(toDetailInput);
    if (from && from.id !== target.id && !keepOriginal) {
      if (!(await saveDetails(from.id, zug.id, rest(from.id)))) return;
    }
    if (await saveDetails(target.id, zug.id, [...rest(target.id), next])) setSel({ kind: 'detail', blockId: target.id, sig: sigOf(next) });
  }

  const newBlock = (d: Draft) =>
    setDialog({ kind: 'new', initial: { ...d, title: '', type: 'AUSBILDUNG', locationId: null, verantwortlich: '', notes: '', locked: false } });

  const nav = useNavigate();
  const avs = useQuery({ queryKey: ['avs', wk.id], queryFn: () => api.avs(wk.id) });
  const blockMenu = useBlockMenu({
    detail,
    ops,
    days,
    onEdit: (id) => setDialog({ kind: 'edit', id }),
    onDuplicate: (initial) => setDialog({ kind: 'new', initial: { ...initial, zugIds: [zug.id] } }),
    onNew: (at) => {
      const start = clamp(at.min, wk.dayStart, wk.dayEnd - 30);
      newBlock({ date: at.date, zugIds: [zug.id], startMin: start, endMin: Math.min(start + 60, wk.dayEnd) });
    },
    canCreateAt: () => canCreateIn(),
    extraBlockItems: (b) => {
      const own = (avs.data ?? []).filter((a) => a.blockId === b.id && a.zugId === zug.id);
      return [
        'separator',
        ...own.map((a) => ({ label: `Vorbereitung «${a.thema}» öffnen`, icon: '📄', onClick: () => nav(`../av/${a.id}`) })),
        ...(canCreateAv(me, wk, zug.id) && (b.type === 'AUSBILDUNG' || b.type === 'UEBUNG')
          ? [{ label: 'Ausbildungsvorbereitung erstellen', icon: '📝', onClick: () => nav(`../av/neu?block=${b.id}&zug=${zug.id}`) }]
          : []),
      ];
    },
  });

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-1 text-xs text-slate-500">
          {lanes
            ? editDetails
              ? 'Sequenzen ziehen (auch in andere Gruppen), mit Alt/Option klonen; im Zeitfenster ziehen für eine neue Sequenz.'
              : 'Sequenzen pro Gruppe; anklicken für Details.'
            : canCreateIn()
              ? 'Blöcke des Zuges verschieben und anpassen; Details im Seitenbereich planen.'
              : 'Block anklicken für Details, Ausbildungsvorbereitungen und Anfragen.'}
          <span className="flex-1" />
          {groups.length >= 2 && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={lanesOn} onChange={(e) => setLanesOn(e.target.checked)} /> Spalten pro Gruppe
            </label>
          )}
          {editDetails && (
            <Button variant="ghost" className="!py-0.5 text-xs" onClick={() => setDialog({ kind: 'groups' })}>
              Gruppen ({groups.length}) …
            </Button>
          )}
          Höhe
          <input type="range" min={8} max={30} value={ppm * 10} onChange={(e) => setPpm(Number(e.target.value) / 10)} className="w-24" aria-label="Zeilenhöhe" />
        </div>
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-slate-50 p-2">
          {lanes ? (
            <PlannerGrid
              layout={layout}
              blocks={detailBlocks}
              locations={[]}
              selectedId={selectedPseudo}
              conflictIds={conflictIds}
              highlightZugId={null}
              dimOthers={false}
              canEdit={() => editDetails}
              canCreateIn={() => editDetails}
              canChangeZug={editDetails}
              backgroundBlocks={backgroundBlocks}
              selectedBackgroundId={sel?.kind === 'block' ? sel.id : null}
              onEmptyPointer={(date, min) => {
                const parent = parentAt(date, min);
                setSel(parent ? { kind: 'block', id: parent.id } : null);
              }}
              onSelect={(id) => {
                const d = id != null ? byPseudo.get(id) : undefined;
                if (d) setSel({ kind: 'detail', blockId: d.blockId, sig: sigOf(d) });
              }}
              onCommit={(id, d) => place(id, d, false)}
              onClone={(id, d) => place(id, d, true)}
              onOpen={(id) => {
                const d = byPseudo.get(id);
                if (d) setSel({ kind: 'detail', blockId: d.blockId, sig: sigOf(d) });
              }}
              onCreate={(d) => place(null, d, true)}
              onEmptyMenu={(at, x, y) => {
                // Detail planning: the menu of the Grobprogramm block underneath.
                const parent = parentAt(at.date, at.min);
                if (parent) blockMenu.onBlockMenu(parent.id, x, y);
              }}
            />
          ) : (
            <PlannerGrid
              layout={layout}
              blocks={zugBlocks}
              locations={locations}
              selectedId={selectedBlockId}
              conflictIds={conflictIds}
              highlightZugId={null}
              dimOthers={false}
              canEdit={(b) => canEditBlock(me, wk, b)}
              canCreateIn={canCreateIn}
              canChangeZug={false}
              onSelect={(id) => setSel(id == null ? null : { kind: 'block', id })}
              onCommit={(id, d) => ops.update(id, { date: d.date, startMin: d.startMin, endMin: d.endMin })}
              onOpen={(id) => setDialog({ kind: 'edit', id })}
              onCreate={newBlock}
              onBlockMenu={blockMenu.onBlockMenu}
              onEmptyMenu={blockMenu.onEmptyMenu}
              renderInner={(b, h) => (
                <>
                  {h >= 40 && <ResourceChips chips={resourcesOf({ ...b, zugIds: [zug.id] })} onColor />}
                  <DetailLines details={detailsOf(b.id)} groups={groups} height={h} />
                </>
              )}
            />
          )}
        </div>
      </div>
      <SlotPanel
        detail={detail}
        zug={zug}
        block={selectedBlock}
        details={selectedBlock ? detailsOf(selectedBlock.id) : []}
        groups={groups}
        selectedDetail={selectedDetail}
        onSelectDetail={(blockId, d) => setSel(d ? { kind: 'detail', blockId, sig: sigOf(d) } : { kind: 'block', id: blockId })}
        onEdit={(id) => setDialog({ kind: 'edit', id })}
        onManageGroups={() => setDialog({ kind: 'groups' })}
      />

      {blockMenu.element}
      {dialog?.kind === 'groups' && <GroupsDialog wkId={wk.id} zugId={zug.id} zugName={zug.name} groups={groups} onClose={() => setDialog(null)} />}
      {dialogBlock && (
        <BlockDialog
          key={dialogBlock.id + ':' + dialogBlock.version}
          title={canEditBlock(me, wk, dialogBlock) ? 'Block anpassen' : 'Block'}
          initial={toInput(dialogBlock)}
          days={days.includes(dialogBlock.date) ? days : [...days, dialogBlock.date].sort()}
          zuege={[zug]}
          locations={locations}
          readOnly={!canEditBlock(me, wk, dialogBlock)}
          canSpan={false}
          canLock={false}
          lockedByBat={dialogBlock.source === 'BAT'}
          onClose={() => setDialog(null)}
          onSave={async (b) => {
            if (await ops.update(dialogBlock.id, b)) setDialog(null);
          }}
          onDelete={async () => {
            if (await ops.remove(dialogBlock.id)) {
              setDialog(null);
              setSel(null);
            }
          }}
          resources={(b) => <BlockRequests detail={detail} block={dialogBlock} draft={b} initialKind={dialog?.kind === 'edit' ? dialog.request : undefined} />}
        />
      )}
      {dialog?.kind === 'new' && (
        <BlockDialog
          title="Neuer Block"
          initial={dialog.initial}
          days={days}
          zuege={[zug]}
          locations={locations}
          readOnly={false}
          canSpan={false}
          canLock={false}
          lockedByBat={false}
          onClose={() => setDialog(null)}
          onSave={async (b) => {
            const created = await ops.create(b);
            if (created) {
              setDialog(null);
              setSel({ kind: 'block', id: created.id });
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
                  setSel({ kind: 'block', id: created.id });
                  // The block dialog reopens with the request dialog of that kind.
                  setDialog({ kind: 'edit', id: created.id, request: kind });
                }
              }}
            />
          )}
        />
      )}
    </div>
  );
}

function DetailLines({ details, groups, height }: { details: BlockDetail[]; groups: ZugGroup[]; height: number }) {
  if (!details.length || height < 50) return null;
  return (
    <ul className="mt-1 space-y-px border-t border-white/40 pt-0.5 text-[10px] leading-tight">
      {details.map((d) => (
        <li key={d.id} className="truncate">
          <span className="tabular-nums opacity-80">{fmtTime(d.startMin)}</span> {d.groupIds.length > 0 && <b>{groupLabel(groups, d.groupIds)}: </b>}
          {d.title}
          {d.verantwortlich && <span className="opacity-80"> · {d.verantwortlich}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---- Side panel for the selected slot ----

function SlotPanel({
  detail,
  zug,
  block,
  details,
  onEdit,
  groups = [],
  selectedDetail = null,
  onSelectDetail,
  onManageGroups,
  sheet,
}: {
  detail: WkDetail;
  zug: Zug;
  block: Block | null;
  details: BlockDetail[];
  onEdit: (id: number) => void;
  groups?: ZugGroup[];
  selectedDetail?: BlockDetail | null;
  onSelectDetail?: (blockId: number, d: DetailInput | null) => void;
  onManageGroups?: () => void;
  /** Full-width variant for the mobile slot sheet. */
  sheet?: boolean;
}) {
  const me = useUser();
  const nav = useNavigate();
  const { wk, locations } = detail;
  const avs = useQuery({ queryKey: ['avs', wk.id], queryFn: () => api.avs(wk.id) });
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id) });
  const [requesting, setRequesting] = useState(false);
  const [turnus, setTurnus] = useState(false);

  if (!block) {
    return (
      <aside className="no-print w-96 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 text-sm text-slate-500">
        Zeitfenster (Block) anklicken, um
        <ul className="ml-4 mt-1 list-disc">
          <li>die Detailplanung zu erfassen,</li>
          <li>Ausbildungsvorbereitungen zu schreiben,</li>
          <li>Fahrzeuge, Räume oder Gelände anzufragen.</li>
        </ul>
      </aside>
    );
  }
  const loc = locations.find((l) => l.id === block.locationId);
  const slotAvs = (avs.data ?? []).filter((a) => a.blockId === block.id && a.zugId === zug.id);
  const slotRequests = (requests.data ?? []).filter((q) => q.blockId === block.id && q.zugId === zug.id);

  return (
    <aside className={sheet ? 'flex flex-col bg-white' : 'no-print flex w-96 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white'}>
      <div className="border-b p-4">
        <div className="flex items-start gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: BLOCK_TYPE_INFO[block.type].color }} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{block.title}</div>
            <div className="text-xs text-slate-500">
              {weekday(block.date)} {fmtDate(block.date)}, {fmtTime(block.startMin)}–{fmtTime(block.endMin)}
              {loc && ` · (${loc.nr}) ${loc.name}`}
            </div>
          </div>
          <Button variant="ghost" className="text-xs" onClick={() => onEdit(block.id)}>
            {canEditBlock(me, wk, block) ? 'Anpassen' : 'Details'}
          </Button>
        </div>
      </div>

      <section className="border-b p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="label !mb-0">Detailplanung {zug.name}</h3>
          {canEditDetails(me, wk, zug.id) && (
            <div className="flex gap-1">
              {onManageGroups && (
                <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={onManageGroups}>
                  Gruppen …
                </Button>
              )}
              {groups.length >= 2 && (
                <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={() => setTurnus(true)}>
                  Turnus …
                </Button>
              )}
            </div>
          )}
        </div>
        {selectedDetail ? (
          <div className="rounded-md border border-orange-200 bg-orange-50/50 p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-orange-900">Ausgewählte Sequenz</span>
              <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => onSelectDetail?.(block.id, null)}>
                Alle Sequenzen
              </button>
            </div>
            <DetailCard
              key={`${selectedDetail.id}:${selectedDetail.startMin}:${selectedDetail.endMin}:${selectedDetail.title}:${selectedDetail.groupIds.join()}`}
              detail={selectedDetail}
              block={block}
              details={details}
              groups={groups}
              editable={canEditDetails(me, wk, zug.id)}
              onSaved={(d) => onSelectDetail?.(block.id, d)}
              onClose={() => onSelectDetail?.(block.id, null)}
            />
          </div>
        ) : (
          <DetailEditor
            key={`${block.id}:${block.startMin}:${block.endMin}:${details.map((d) => d.id).join()}`}
            block={block}
            zugId={zug.id}
            details={details}
            groups={groups}
            editable={canEditDetails(me, wk, zug.id)}
          />
        )}
      </section>

      <section className="border-b p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="label !mb-0">Ausbildungsvorbereitungen</h3>
          {canCreateAv(me, wk, zug.id) && (
            <Button variant="ghost" className="text-xs" onClick={() => nav(`../av/neu?block=${block.id}&zug=${zug.id}`)}>
              + Neu
            </Button>
          )}
        </div>
        {slotAvs.length === 0 ? (
          <p className="text-xs text-slate-400">Noch keine.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {slotAvs.map((a) => (
              <li key={a.id}>
                <Link to={`../av/${a.id}`} className="text-zs-blue hover:underline">
                  {a.thema}
                </Link>
                <span className="text-xs text-slate-500"> · {a.leiter || a.createdByName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="label !mb-0">Fahrzeuge, Räume, Gelände</h3>
          {canRequestResource(me, wk, zug.id) && (
            <Button variant="ghost" className="text-xs" onClick={() => setRequesting(true)}>
              + Anfragen
            </Button>
          )}
        </div>
        {slotRequests.length === 0 ? (
          <p className="text-xs text-slate-400">Keine Anfragen für dieses Zeitfenster.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {slotRequests.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-2">
                <span>
                  {q.zweck}
                  <div className="text-xs text-slate-500">
                    {fmtTime(q.startMin)}–{fmtTime(q.endMin)}
                    {q.decisionNote && ` · ${q.decisionNote}`}
                  </div>
                </span>
                <RequestBadge status={q.status} />
              </li>
            ))}
          </ul>
        )}
        <Link to="../ressourcen" className="mt-2 inline-block text-xs text-zs-blue hover:underline">
          Alle Anfragen →
        </Link>
      </section>

      {turnus && <TurnusDialog block={block} details={details} groups={groups} onClose={() => setTurnus(false)} />}
      {requesting && (
        <RequestDialog
          detail={detail}
          initial={{ zugId: zug.id, blockId: block.id, date: block.date, startMin: block.startMin, endMin: block.endMin, zweck: block.title }}
          onClose={() => setRequesting(false)}
        />
      )}
    </aside>
  );
}

// ---- Mobile: day agenda with full-screen slot sheet ----

function MobileZug({ detail, zug }: { detail: WkDetail; zug: Zug }) {
  const me = useUser();
  const { wk, blocks, locations, details } = detail;
  const ops = useBlockOps(wk.id);
  const avs = useQuery({ queryKey: ['avs', wk.id], queryFn: () => api.avs(wk.id) });
  const resourcesOf = useBlockResources(wk);
  const days = wkDays(wk).filter((d) => servesOnDay(wk, d, zug.id));
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(days.includes(today) ? today : (days.find((d) => !isAvorDay(wk, d)) ?? days[0]));
  const [openId, setOpenId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);

  const list = blocks.filter((b) => b.date === day && b.zugIds.includes(zug.id)).sort((a, b) => a.startMin - b.startMin);
  const open = blocks.find((b) => b.id === openId) ?? null;
  const edit = blocks.find((b) => b.id === editId);
  const detailsOf = (id: number) => details.filter((d) => d.blockId === id && d.zugId === zug.id);
  const mobileGroups = detail.groups.filter((g) => g.zugId === zug.id);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
      <div className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
        {days.map((d) => (
          <button
            key={d}
            className={`shrink-0 rounded-lg border px-2.5 py-1 text-center leading-tight ${
              d === day
                ? 'border-zs-blue bg-zs-blue text-white'
                : dutyOf(wk, d, zug.id) === 'AVOR'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : dutyOf(wk, d, zug.id) === 'KVK'
                    ? 'border-sky-300 bg-sky-50 text-sky-900'
                    : 'border-slate-300 bg-white'
            }`}
            onClick={() => setDay(d)}
          >
            <div className="text-[11px] uppercase">{dutyOf(wk, d, zug.id) === 'WK' ? weekday(d).slice(0, 2) : dutyOf(wk, d, zug.id)}</div>
            <div className="text-sm font-semibold">{fmtDate(d).slice(0, 6)}</div>
          </button>
        ))}
      </div>
      <div className="space-y-2 p-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {weekday(day)}, {fmtDate(day)}
        </h2>
        {list.length === 0 && <Empty>Keine Einträge für {zug.name}.</Empty>}
        {list.map((b) => {
          const loc = locations.find((l) => l.id === b.locationId);
          const ds = detailsOf(b.id);
          const nAv = (avs.data ?? []).filter((a) => a.blockId === b.id && a.zugId === zug.id).length;
          const reqs = resourcesOf({ ...b, zugIds: [zug.id] });
          return (
            <button key={b.id} className="block w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm active:bg-slate-50" onClick={() => setOpenId(b.id)}>
              <div className="flex">
                <div className="w-1.5 shrink-0" style={{ background: BLOCK_TYPE_INFO[b.type].color }} />
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums text-slate-600">
                      {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                    </span>
                    {(b.locked || b.source === 'BAT') && <span className="text-xs">🔒</span>}
                  </div>
                  <div className="font-semibold">{b.title}</div>
                  {(loc || b.verantwortlich) && (
                    <div className="text-sm text-slate-500">
                      {loc && `(${loc.nr}) ${loc.name}`}
                      {loc && b.verantwortlich && ' · '}
                      {b.verantwortlich}
                    </div>
                  )}
                  {ds.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-sm">
                      {ds.map((d) => (
                        <li key={d.id} className="flex gap-2">
                          <span className="shrink-0 tabular-nums text-slate-500">{fmtTime(d.startMin)}</span>
                          <span className="min-w-0">
                            {d.groupIds.length > 0 && <b>{groupLabel(mobileGroups, d.groupIds)}: </b>}
                            {d.title}
                            {d.verantwortlich && <span className="text-slate-500"> · {d.verantwortlich}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(nAv > 0 || reqs.length > 0) && (
                    <div className="mt-2 space-y-1">
                      {nAv > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-zs-blue">{nAv} Ausb.-Vorb.</span>}
                      <ResourceChips chips={reqs} />
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white">
          <div className="flex items-center gap-2 border-b px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button className="rounded px-2 py-1.5 text-sm font-medium text-zs-blue" onClick={() => setOpenId(null)}>
              ‹ Zurück
            </button>
            <span className="truncate text-sm text-slate-500">
              {weekday(open.date).slice(0, 2)} {fmtDate(open.date).slice(0, 6)} · {zug.name}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <SlotPanel sheet detail={detail} zug={zug} block={open} details={detailsOf(open.id)} groups={mobileGroups} onEdit={setEditId} />
          </div>
        </div>
      )}
      {edit && (
        <BlockDialog
          key={edit.id + ':' + edit.version}
          title={canEditBlock(me, wk, edit) ? 'Block anpassen' : 'Block'}
          initial={toInput(edit)}
          days={days}
          zuege={[zug]}
          locations={locations}
          readOnly={!canEditBlock(me, wk, edit)}
          canSpan={false}
          canLock={false}
          lockedByBat={edit.source === 'BAT'}
          onClose={() => setEditId(null)}
          onSave={async (b) => {
            if (await ops.update(edit.id, b)) setEditId(null);
          }}
          onDelete={async () => {
            if (await ops.remove(edit.id)) {
              setEditId(null);
              setOpenId(null);
            }
          }}
          resources={(b) => <BlockRequests detail={detail} block={edit} draft={b} />}
        />
      )}
    </div>
  );
}

function DetailEditor({ block, zugId, details, groups, editable }: { block: Block; zugId: number; details: BlockDetail[]; groups: ZugGroup[]; editable: boolean }) {
  const toast = useToast();
  const saveDetails = useSaveDetails(block.wkId);
  const [rows, setRows] = useState<DetailInput[]>(details.map(toDetailInput));
  const [dirty, setDirty] = useState(false);
  const update = (i: number, patch: Partial<DetailInput>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  if (!editable) {
    return details.length ? (
      <ul className="space-y-1 text-sm">
        {details.map((d) => (
          <li key={d.id} className="flex gap-2">
            <span className="w-24 shrink-0 tabular-nums text-slate-500">
              {fmtTime(d.startMin)}–{fmtTime(d.endMin)}
            </span>
            <span>
              {d.groupIds.length > 0 && <b>{groupLabel(groups, d.groupIds)}: </b>}
              {d.title}
              {d.verantwortlich && <span className="text-slate-500"> · {d.verantwortlich}</span>}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-xs text-slate-400">Noch keine Detailplanung.</p>
    );
  }

  const add = () => {
    const start = rows.length ? rows[rows.length - 1].endMin : block.startMin;
    const s = clamp(start, block.startMin, block.endMin - 5);
    setRows([...rows, { startMin: s, endMin: Math.min(s + 30, block.endMin), title: '', verantwortlich: '', groupIds: [] }]);
    setDirty(true);
  };
  const invalid = rows.some((r) => !r.title.trim() || r.endMin <= r.startMin || r.startMin < block.startMin || r.endMin > block.endMin);
  const save = async () => {
    if (await saveDetails(block.id, zugId, rows)) {
      setDirty(false);
      toast('Detailplanung gespeichert');
    }
  };

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="space-y-1 rounded border border-slate-200 p-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <input type="time" className="input !w-[6.5rem] !px-1.5 !py-1" value={fmtTime(r.startMin)} onChange={(e) => e.target.value && update(i, { startMin: parseTime(e.target.value) })} aria-label="Von" />
            <span className="text-slate-400">–</span>
            <input type="time" className="input !w-[6.5rem] !px-1.5 !py-1" value={fmtTime(r.endMin)} onChange={(e) => e.target.value && update(i, { endMin: parseTime(e.target.value) })} aria-label="Bis" />
            <div className="min-w-[9rem] flex-1">
              <PersonSelect kpId={0} zugId={zugId} value={r.verantwortlich} onChange={(verantwortlich) => update(i, { verantwortlich })} />
            </div>
            <button
              className="px-1 text-slate-400 hover:text-red-600"
              onClick={() => {
                setRows(rows.filter((_, j) => j !== i));
                setDirty(true);
              }}
              aria-label="Zeile entfernen"
            >
              ✕
            </button>
          </div>
          <input className="input !py-1" placeholder="Was / Wo / Womit" value={r.title} onChange={(e) => update(i, { title: e.target.value })} />
          <GroupPicker groups={groups} value={r.groupIds} onChange={(groupIds) => update(i, { groupIds })} />
        </div>
      ))}
      {rows.length === 0 && <p className="text-xs text-slate-400">Das Zeitfenster in Sequenzen unterteilen (Zeitplan, Postenarbeit, Turnus).</p>}
      <div className="flex gap-2">
        <Button variant="ghost" className="text-xs" onClick={add} disabled={rows.length > 0 && rows[rows.length - 1].endMin >= block.endMin}>
          + Sequenz
        </Button>
        <span className="flex-1" />
        {dirty && (
          <Button variant="primary" className="text-xs" disabled={invalid} onClick={save}>
            Speichern
          </Button>
        )}
      </div>
      {invalid && dirty && <p className="text-xs text-red-600">Jede Sequenz braucht einen Inhalt und muss im Zeitfenster {fmtTime(block.startMin)}–{fmtTime(block.endMin)} liegen.</p>}
    </div>
  );
}

// ---- Zeitplan (printable detail programme, Anhänge p. 21) ----

function Zeitplan({ detail, zug, days }: { detail: WkDetail; zug: Zug; days: string[] }) {
  const { wk, blocks, details, locations } = detail;
  const zugGroups = detail.groups.filter((g) => g.zugId === zug.id);
  const avs = useQuery({ queryKey: ['avs', wk.id], queryFn: () => api.avs(wk.id) });
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <h2 className="mb-3 text-lg font-semibold">
        Zeitplan {zug.name} – {wk.title}
      </h2>
      <div className="space-y-4">
        {days.map((d) => {
          const list = blocks.filter((b) => b.date === d && b.zugIds.includes(zug.id)).sort((a, b) => a.startMin - b.startMin);
          return (
            <section key={d} className="break-inside-avoid overflow-hidden rounded-lg border border-slate-200 bg-white">
              <h3 className={`border-b px-4 py-2 text-sm font-semibold ${isAvorDay(wk, d) ? 'bg-amber-50' : 'bg-slate-50'}`}>
                {weekday(d)}, {fmtDate(d)}
                {isAvorDay(wk, d) && <span className="ml-2 rounded bg-amber-500 px-1.5 text-[10px] text-white">AVOR</span>}
              </h3>
              {list.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">Keine Einträge.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="w-16 px-4 py-1">von</th>
                      <th className="w-16 py-1">bis</th>
                      <th className="w-36 py-1">Verantw.</th>
                      <th className="py-1">Was / Wo / Womit</th>
                      <th className="w-32 px-4 py-1 text-right">Ausb.-Vorb.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((b) => {
                      const ds = details.filter((x) => x.blockId === b.id && x.zugId === zug.id);
                      const loc = locations.find((l) => l.id === b.locationId);
                      const bAvs = (avs.data ?? []).filter((a) => a.blockId === b.id && a.zugId === zug.id);
                      return [
                        <tr key={b.id} className="border-t border-slate-200 bg-slate-50/60 align-top">
                          <td className="px-4 py-1.5 tabular-nums">{fmtTime(b.startMin)}</td>
                          <td className="py-1.5 tabular-nums">{fmtTime(b.endMin)}</td>
                          <td className="py-1.5">{b.verantwortlich}</td>
                          <td className="py-1.5">
                            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BLOCK_TYPE_INFO[b.type].color }} />
                            <b>{b.title}</b>
                            {loc && <span className="text-slate-500"> · ({loc.nr}) {loc.name}</span>}
                          </td>
                          <td className="px-4 py-1.5 text-right text-xs">
                            {bAvs.map((a) => (
                              <Link key={a.id} to={`../av/${a.id}`} className="block text-zs-blue hover:underline">
                                {a.thema}
                              </Link>
                            ))}
                          </td>
                        </tr>,
                        ...ds.map((x) => (
                          <tr key={`d${x.id}`} className="border-t border-slate-100 align-top">
                            <td className="px-4 py-1 pl-8 tabular-nums text-slate-600">{fmtTime(x.startMin)}</td>
                            <td className="py-1 tabular-nums text-slate-600">{fmtTime(x.endMin)}</td>
                            <td className="py-1 text-slate-600">{x.verantwortlich}</td>
                            <td className="py-1 pl-5">
                              {x.groupIds.length > 0 && <b>{groupLabel(zugGroups, x.groupIds)}: </b>}
                              {x.title}
                            </td>
                            <td />
                          </tr>
                        )),
                      ];
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
