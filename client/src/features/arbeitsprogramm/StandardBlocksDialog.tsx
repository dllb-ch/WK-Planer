// Standardblöcke (Appell, Mittagessen, Rapport …): edit, save as standard of the Kp, insert for chosen days and columns.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BlockInput, StandardBlock, StandardScope } from '@shared/types';
import { BLOCK_TYPES, KDO_ID } from '@shared/types';
import { canCreateBlock, canEditStandardBlocks } from '@shared/permissions';
import { fmtDate, fmtTime, isAvorDay, isKvkDay, parseTime, servesOnDay, wkDays } from '@shared/util';
import { useT } from '../../i18n';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, errMsg, Modal, useToast } from '../../components/ui';
import { withKdo } from './columns';
import { clamp } from './geometry';

type Row = StandardBlock & { on: boolean };

/** Splits columns into runs of neighbours (a block spans neighbouring columns only). */
function runs(cols: number[], order: number[]) {
  const idx = cols.map((c) => order.indexOf(c)).filter((i) => i >= 0).sort((a, b) => a - b);
  const out: number[][] = [];
  for (const i of idx) {
    const last = out[out.length - 1];
    if (last && order.indexOf(last[last.length - 1]) === i - 1) last.push(order[i]);
    else out.push([order[i]]);
  }
  return out;
}

export function StandardBlocksDialog({ detail, onClose }: { detail: WkDetail; onClose: () => void }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { t, weekdayShort } = useT();
  const { wk, zuege, blocks } = detail;
  const days = wkDays(wk);
  const columns = withKdo(wk.kpId, zuege);
  const order = columns.map((c) => c.id);
  const kp = { id: wk.kpId, batId: wk.batId };
  const canSave = canEditStandardBlocks(me, kp);
  // Columns this person may plan in (Kp Kdt: all incl. Kdo; Zugführer: the own Zug).
  const allowed = columns.filter((c) => canCreateBlock(me, wk, { zugIds: [c.id], locked: false, source: 'KP' })).map((c) => c.id);
  const mayLock = canCreateBlock(me, wk, { zugIds: order, locked: true, source: 'KP' });

  const q = useQuery({ queryKey: ['standardbloecke', wk.kpId], queryFn: () => api.standardBlocks(wk.kpId) });
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (q.data && !rows) setRows(q.data.items.map((b) => ({ ...b, on: true })));
  }, [q.data, rows]);
  const [sel, setSel] = useState<string[]>(days.filter((d) => !isAvorDay(wk, d)));
  const [targets, setTargets] = useState<number[]>(allowed);
  const [dirty, setDirty] = useState(false);

  const setRow = (i: number, patch: Partial<Row>) => {
    setRows(rows!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const scopeCols = (s: StandardScope) => (s === 'ALLE' ? order : s === 'KDO' ? [KDO_ID] : order.filter((id) => id !== KDO_ID));

  const plan = (): BlockInput[] => {
    const list: BlockInput[] = [];
    for (const d of sel)
      for (const r of (rows ?? []).filter((x) => x.on)) {
        const cols = scopeCols(r.scope).filter((c) => targets.includes(c) && allowed.includes(c));
        const startMin = clamp(r.startMin, wk.dayStart, wk.dayEnd - 5);
        const endMin = clamp(r.endMin, startMin + 5, wk.dayEnd);
        for (const run of runs(cols, order)) {
          // A block across columns may cross a Zug without service, but does not start or end in one.
          const first = run.findIndex((c) => servesOnDay(wk, d, c));
          const last = run.length - 1 - [...run].reverse().findIndex((c) => servesOnDay(wk, d, c));
          if (first < 0) continue;
          const zugIds = run.slice(first, last + 1);
          // Already there (inserted before): skip.
          const dup = blocks.some(
            (b) => b.date === d && b.startMin === startMin && b.endMin === endMin && b.title === r.title && b.zugIds.length === zugIds.length && zugIds.every((z) => b.zugIds.includes(z)),
          );
          if (!dup) list.push({ date: d, startMin, endMin, zugIds, title: r.title, type: r.type, locationId: null, verantwortlich: '', notes: '', locked: r.locked && mayLock });
        }
      }
    return list;
  };
  const planned = rows ? plan() : [];

  const apply = async () => {
    try {
      await api.createBlocks(wk.id, planned);
      await qc.invalidateQueries({ queryKey: ['wk', wk.id] });
      toast(t('std.inserted', { n: planned.length }));
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const saveStandard = async () => {
    try {
      const saved = await api.saveStandardBlocks(wk.kpId, rows!.map(({ on: _on, ...b }) => b));
      qc.setQueryData(['standardbloecke', wk.kpId], saved);
      setDirty(false);
      toast(t('std.savedAsStandard'));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Modal
      title={t('std.title')}
      onClose={onClose}
      wide
      footer={
        <>
          {canSave && (
            <Button className="mr-auto" disabled={!dirty || !rows} onClick={saveStandard} title={t('std.saveHint')}>
              {t('std.saveStandard')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!planned.length} onClick={apply}>
            {t('std.insertN', { n: planned.length })}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        {t('std.intro')}
        {q.data?.source === 'DEFAULT' && t('std.suggestion')}
      </p>
      <div>
        <span className="label">{t('days.label')}</span>
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <label key={d} className="flex items-center gap-1.5 rounded border px-2 py-1 text-sm">
              <input type="checkbox" checked={sel.includes(d)} onChange={(e) => setSel(e.target.checked ? [...sel, d] : sel.filter((x) => x !== d))} />
              {weekdayShort(d)} {fmtDate(d).slice(0, 6)}
              {isAvorDay(wk, d) && <span className="text-xs text-amber-600">{t('duty.AVOR')}</span>}
              {isKvkDay(wk, d) && <span className="text-xs text-sky-600">{t('duty.KVK')}</span>}
            </label>
          ))}
        </div>
      </div>
      {allowed.length > 1 && (
        <div>
          <span className="label">{t('std.insertFor')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {columns
              .filter((c) => allowed.includes(c.id))
              .map((c) => {
                const on = targets.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTargets(on ? targets.filter((x) => x !== c.id) : [...targets, c.id])}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    {on ? '✓ ' : ''}
                    {c.name}
                  </button>
                );
              })}
            <button type="button" className="ml-1 text-xs text-zs-blue hover:underline" onClick={() => setTargets(allowed)}>
              {t('common.all')}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t('std.forHint')}</p>
        </div>
      )}
      {!rows ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : (
        <div className="space-y-1.5">
          <div className="hidden grid-cols-[1.5rem,1fr,9rem,6rem,6rem,9rem,auto,1.5rem] gap-2 text-xs text-slate-500 sm:grid">
            <span />
            <span>{t('common.title')}</span>
            <span>{t('bd.type')}</span>
            <span>{t('bd.from')}</span>
            <span>{t('bd.to')}</span>
            <span>{t('std.for')}</span>
            <span>{t('std.fix')}</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.5rem,1fr] items-center gap-2 sm:grid-cols-[1.5rem,1fr,9rem,6rem,6rem,9rem,auto,1.5rem]">
              <input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label={t('std.insert')} />
              <input className="input" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} aria-label={t('common.title')} />
              <select className="input max-sm:col-start-2" value={r.type} onChange={(e) => setRow(i, { type: e.target.value as Row['type'] })} aria-label={t('bd.type')}>
                {BLOCK_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(`block.${x}`)}
                  </option>
                ))}
              </select>
              <input
                type="time"
                className="input max-sm:col-start-2"
                value={fmtTime(r.startMin)}
                onChange={(e) => e.target.value && setRow(i, { startMin: parseTime(e.target.value) })}
                aria-label={t('bd.from')}
              />
              <input
                type="time"
                className="input max-sm:col-start-2"
                value={fmtTime(r.endMin)}
                onChange={(e) => e.target.value && setRow(i, { endMin: parseTime(e.target.value) })}
                aria-label={t('bd.to')}
              />
              <select className="input max-sm:col-start-2" value={r.scope} onChange={(e) => setRow(i, { scope: e.target.value as StandardScope })} aria-label={t('std.for')}>
                {(['ALLE', 'ZUEGE', 'KDO'] as StandardScope[]).map((s) => (
                  <option key={s} value={s}>
                    {t(`scope.${s}`)}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-600 max-sm:col-start-2" title={t('std.fixHint')}>
                <input type="checkbox" checked={r.locked} disabled={!mayLock} onChange={(e) => setRow(i, { locked: e.target.checked })} />
                <span className="sm:hidden">{t('std.fixLower')}</span>
              </label>
              <button
                type="button"
                className="text-slate-400 hover:text-red-600 max-sm:col-start-2 max-sm:justify-self-start"
                onClick={() => {
                  setRows(rows.filter((_, j) => j !== i));
                  setDirty(true);
                }}
                aria-label={t('common.remove')}
              >
                ✕
              </button>
            </div>
          ))}
          <Button
            className="text-xs"
            onClick={() => {
              setRows([...rows, { on: true, title: t('std.newBlockTitle'), type: 'DIVERSES', startMin: 10 * 60, endMin: 10 * 60 + 15, scope: 'ZUEGE', locked: false }]);
              setDirty(true);
            }}
          >
            {t('ap.newBlockButton')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
