// Gruppen of a Zug: management, sequence editing, cloning and the Turnus (rotation) generator.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Block, BlockDetail, DetailInput, ZugGroup } from '@shared/types';
import { fmtTime, parseTime } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { Button, errMsg, Field, Modal, useToast } from '../../components/ui';
import { PersonSelect } from '../../components/PersonSelect';

export const toDetailInput = ({ startMin, endMin, title, verantwortlich, groupIds }: BlockDetail | DetailInput): DetailInput => ({
  startMin,
  endMin,
  title,
  verantwortlich,
  groupIds,
});

export const groupLabel = (groups: ZugGroup[], ids: number[]) =>
  ids.length === 0 ? 'Ganzer Zug' : groups.filter((g) => ids.includes(g.id)).map((g) => g.name).join(' + ');

/** Saves the detail plan of one block and Zug, updating the cache first so drags do not snap back. */
export function useSaveDetails(wkId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return async (blockId: number, zugId: number, list: DetailInput[]) => {
    const key = ['wk', wkId];
    const prev = qc.getQueryData<WkDetail>(key);
    const sorted = [...list].sort((a, b) => a.startMin - b.startMin);
    qc.setQueryData<WkDetail>(key, (d) =>
      d && {
        ...d,
        details: [
          ...d.details.filter((x) => !(x.blockId === blockId && x.zugId === zugId)),
          ...sorted.map((x, i) => ({ ...x, id: -(i + 1), blockId, zugId })),
        ],
      },
    );
    try {
      const saved = await api.saveDetails(wkId, blockId, zugId, sorted);
      qc.setQueryData<WkDetail>(key, (d) =>
        d && { ...d, details: [...d.details.filter((x) => !(x.blockId === blockId && x.zugId === zugId)), ...saved] },
      );
      return saved;
    } catch (e) {
      if (prev) qc.setQueryData(key, prev);
      toast(errMsg(e), 'error');
      return null;
    }
  };
}

// ---- Groups ----

export function GroupsDialog({ wkId, zugId, zugName, groups, onClose }: { wkId: number; zugId: number; zugName: string; groups: ZugGroup[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [list, setList] = useState<{ id?: number; name: string }[]>(groups.length ? groups.map(({ id, name }) => ({ id, name })) : [{ name: 'Gr 1' }, { name: 'Gr 2' }, { name: 'Gr 3' }]);
  const removed = groups.filter((g) => !list.some((x) => x.id === g.id));
  const save = async () => {
    try {
      await api.saveGroups(wkId, zugId, list.filter((x) => x.name.trim()));
      await qc.invalidateQueries({ queryKey: ['wk', wkId] });
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <Modal
      title={`Gruppen ${zugName}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save}>
            Speichern
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Mit Gruppen wird der Zug in der Zugansicht in Spalten aufgeteilt. Sequenzen können pro Gruppe geplant, geklont und im Turnus rotiert werden.
      </p>
      <ul className="space-y-1.5">
        {list.map((g, i) => (
          <li key={i} className="flex gap-2">
            <input className="input" value={g.name} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Name der Gruppe" />
            <button className="px-1 text-slate-400 hover:text-red-600" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Gruppe entfernen">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" onClick={() => setList([...list, { name: `Gr ${list.length + 1}` }])}>
        + Gruppe
      </Button>
      {removed.length > 0 && (
        <p className="text-xs text-amber-700">Sequenzen, die nur {removed.map((g) => g.name).join(', ')} betreffen, werden gelöscht.</p>
      )}
    </Modal>
  );
}

// ---- Selected sequence ----

/** Edit card for one sequence: content, time, groups, clone and delete. */
export function DetailCard({
  detail,
  block,
  details,
  groups,
  editable,
  onSaved,
  onClose,
}: {
  detail: BlockDetail;
  block: Block;
  details: BlockDetail[];
  groups: ZugGroup[];
  editable: boolean;
  onSaved?: (d: DetailInput) => void;
  onClose: () => void;
}) {
  const save = useSaveDetails(block.wkId);
  const [f, setF] = useState<DetailInput>(toDetailInput(detail));
  const [cloning, setCloning] = useState(false);
  const others = details.filter((d) => d.id !== detail.id).map(toDetailInput);
  const dirty = JSON.stringify(f) !== JSON.stringify(toDetailInput(detail));
  const valid = f.title.trim() && f.endMin > f.startMin && f.startMin >= block.startMin && f.endMin <= block.endMin;

  if (!editable) {
    return (
      <div className="space-y-1 text-sm">
        <div className="font-semibold">{detail.title}</div>
        <div className="text-xs text-slate-500">
          {fmtTime(detail.startMin)}–{fmtTime(detail.endMin)} · {groupLabel(groups, detail.groupIds)}
          {detail.verantwortlich && ` · ${detail.verantwortlich}`}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Was / Wo / Womit" aria-label="Inhalt" autoFocus={detail.title === 'Neue Sequenz'} />
      <div className="flex flex-wrap items-center gap-1">
        <input type="time" className="input !w-[6.5rem]" value={fmtTime(f.startMin)} onChange={(e) => e.target.value && setF({ ...f, startMin: parseTime(e.target.value) })} aria-label="Von" />
        <span className="text-slate-400">–</span>
        <input type="time" className="input !w-[6.5rem]" value={fmtTime(f.endMin)} onChange={(e) => e.target.value && setF({ ...f, endMin: parseTime(e.target.value) })} aria-label="Bis" />
        <div className="min-w-[9rem] flex-1">
          <PersonSelect kpId={0} zugId={detail.zugId} value={f.verantwortlich} onChange={(verantwortlich) => setF({ ...f, verantwortlich })} />
        </div>
      </div>
      <GroupPicker groups={groups} value={f.groupIds} onChange={(groupIds) => setF({ ...f, groupIds })} />
      {!valid && <p className="text-xs text-red-600">Inhalt erforderlich, Zeit innerhalb {fmtTime(block.startMin)}–{fmtTime(block.endMin)}.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" className="text-xs" onClick={async () => (await save(block.id, detail.zugId, others)) && onClose()}>
          Löschen
        </Button>
        <Button className="text-xs" onClick={() => setCloning(true)}>
          Klonen …
        </Button>
        <span className="flex-1" />
        {dirty && (
          <Button variant="primary" className="text-xs" disabled={!valid} onClick={async () => (await save(block.id, detail.zugId, [...others, f])) && onSaved?.(f)}>
            Speichern
          </Button>
        )}
      </div>
      <p className="text-[11px] text-slate-500">Tipp: Im Raster mit gedrückter Alt-/Option-Taste ziehen, um zu klonen.</p>
      {cloning && <CloneDialog detail={detail} block={block} details={details} groups={groups} onClose={() => setCloning(false)} />}
    </div>
  );
}

export function GroupPicker({ groups, value, onChange }: { groups: ZugGroup[]; value: number[]; onChange: (ids: number[]) => void }) {
  if (groups.length === 0) return null;
  const whole = value.length === 0;
  const toggle = (id: number) => {
    const base = whole ? groups.map((g) => g.id) : value;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onChange(next.length === 0 || next.length === groups.length ? [] : next);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      <button className={`rounded-full border px-2.5 py-0.5 text-xs ${whole ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300'}`} onClick={() => onChange([])}>
        Ganzer Zug
      </button>
      {groups.map((g) => (
        <button
          key={g.id}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${!whole && value.includes(g.id) ? 'border-zs-blue bg-blue-50 text-zs-blue' : 'border-slate-300'}`}
          onClick={() => toggle(g.id)}
        >
          {g.name}
        </button>
      ))}
    </div>
  );
}

// ---- Clone ----

function CloneDialog({ detail, block, details, groups, onClose }: { detail: BlockDetail; block: Block; details: BlockDetail[]; groups: ZugGroup[]; onClose: () => void }) {
  const save = useSaveDetails(block.wkId);
  const dur = detail.endMin - detail.startMin;
  // Default: the next time window of the same length, for every other group.
  const [start, setStart] = useState(Math.min(detail.endMin, block.endMin - dur));
  const [targets, setTargets] = useState<number[]>(groups.filter((g) => !detail.groupIds.includes(g.id)).map((g) => g.id));
  const [mode, setMode] = useState<'same' | 'shift'>(groups.length ? 'same' : 'shift');
  const startFor = (i: number) => (mode === 'same' ? detail.startMin : start + i * dur);
  const copies = (groups.length ? targets : [null]).map((g, i) => ({
    ...toDetailInput(detail),
    groupIds: g === null ? detail.groupIds : [g],
    startMin: g === null ? start : startFor(i),
    endMin: (g === null ? start : startFor(i)) + dur,
  }));
  const outside = copies.some((c) => c.startMin < block.startMin || c.endMin > block.endMin);
  const run = async () => {
    if (await save(block.id, detail.zugId, [...details.map(toDetailInput), ...copies])) onClose();
  };
  return (
    <Modal
      title="Sequenz klonen"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={outside || copies.length === 0} onClick={run}>
            {copies.length} Kopie{copies.length === 1 ? '' : 'n'} erstellen
          </Button>
        </>
      }
    >
      <p className="text-sm">
        <b>{detail.title}</b> · {fmtTime(detail.startMin)}–{fmtTime(detail.endMin)}
      </p>
      {groups.length > 0 && (
        <div>
          <span className="label">Für Gruppen</span>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={targets.includes(g.id)} onChange={(e) => setTargets(e.target.checked ? [...targets, g.id] : targets.filter((x) => x !== g.id))} />
                {g.name}
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === 'same'} onChange={() => setMode('same')} /> zur gleichen Zeit (parallel)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === 'shift'} onChange={() => setMode('shift')} /> nacheinander, ab
              <input type="time" className="input !w-[6.5rem]" value={fmtTime(start)} onChange={(e) => e.target.value && setStart(parseTime(e.target.value))} disabled={mode !== 'shift'} />
            </label>
          </div>
        </div>
      )}
      {groups.length === 0 && (
        <Field label="Beginn der Kopie">
          <input type="time" className="input !w-[6.5rem]" value={fmtTime(start)} onChange={(e) => e.target.value && setStart(parseTime(e.target.value))} />
        </Field>
      )}
      <ul className="text-xs text-slate-600">
        {copies.map((c, i) => (
          <li key={i}>
            {fmtTime(c.startMin)}–{fmtTime(c.endMin)} · {groupLabel(groups, c.groupIds)}
          </li>
        ))}
      </ul>
      {outside && <p className="text-xs text-red-600">Mindestens eine Kopie liegt ausserhalb des Zeitfensters {fmtTime(block.startMin)}–{fmtTime(block.endMin)}.</p>}
    </Modal>
  );
}

// ---- Turnus ----

/**
 * Rotation: the sequences of the source group define the time windows and posts; every other group
 * does the same posts shifted by its position (Gr 1: Po 1-2-3, Gr 2: Po 2-3-1, Gr 3: Po 3-1-2).
 */
export function buildTurnus(details: BlockDetail[], groups: ZugGroup[], sourceId: number): DetailInput[] {
  const sIdx = groups.findIndex((g) => g.id === sourceId);
  const source = details.filter((d) => d.groupIds.length === 1 && d.groupIds[0] === sourceId).sort((a, b) => a.startMin - b.startMin);
  const n = source.length;
  const others = groups.filter((g) => g.id !== sourceId);
  const keep = details.filter((d) => !(d.groupIds.length === 1 && others.some((g) => g.id === d.groupIds[0]))).map(toDetailInput);
  const rotated = others.flatMap((g) => {
    const shift = groups.indexOf(g) - sIdx;
    return source.map((slot, i) => {
      const content = source[(((i + shift) % n) + n) % n];
      return { startMin: slot.startMin, endMin: slot.endMin, title: content.title, verantwortlich: content.verantwortlich, groupIds: [g.id] };
    });
  });
  return [...keep, ...rotated];
}

export function TurnusDialog({ block, details, groups, onClose }: { block: Block; details: BlockDetail[]; groups: ZugGroup[]; onClose: () => void }) {
  const save = useSaveDetails(block.wkId);
  const withSingle = groups.filter((g) => details.some((d) => d.groupIds.length === 1 && d.groupIds[0] === g.id));
  const [sourceId, setSourceId] = useState(withSingle[0]?.id ?? groups[0]?.id);
  const result = buildTurnus(details, groups, sourceId);
  const slots = details.filter((d) => d.groupIds.length === 1 && d.groupIds[0] === sourceId).sort((a, b) => a.startMin - b.startMin);
  const cell = (gId: number, start: number) => result.find((d) => d.groupIds.length === 1 && d.groupIds[0] === gId && d.startMin === start)?.title ?? '–';
  const zugId = details[0]?.zugId;

  return (
    <Modal
      title="Turnus erstellen"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={slots.length < 2 || zugId === undefined} onClick={async () => (await save(block.id, zugId!, result)) && onClose()}>
            Turnus übernehmen
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Planen Sie die Posten für eine Gruppe nacheinander; alle anderen Gruppen erhalten dieselben Posten im Kreis versetzt. Bestehende
        Sequenzen der anderen Gruppen in diesem Zeitfenster werden ersetzt.
      </p>
      <Field label="Vorlage-Gruppe">
        <select className="input !w-auto" value={sourceId} onChange={(e) => setSourceId(Number(e.target.value))}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      {slots.length < 2 ? (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Die Vorlage-Gruppe braucht mindestens zwei Sequenzen nur für sich (z. B. Po 1, Po 2, Po 3 nacheinander).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2">Zeit</th>
                {groups.map((g) => (
                  <th key={g.id} className="py-1 pr-2">
                    {g.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap py-1 pr-2 tabular-nums">
                    {fmtTime(s.startMin)}–{fmtTime(s.endMin)}
                  </td>
                  {groups.map((g) => (
                    <td key={g.id} className={`py-1 pr-2 ${g.id === sourceId ? 'font-medium' : ''}`}>
                      {cell(g.id, s.startMin)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
