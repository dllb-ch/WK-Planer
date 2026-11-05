// Rapporte of a WK (Kp and Züge), planned Rapport blocks without protocol, and all Pendenzen.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Block, RapportSchema } from '@shared/types';
import { canCreateRapport } from '@shared/permissions';
import { RAPPORT_SCHEMAS } from '@shared/rapport';
import { fmtDate, fmtTime, parseTime, wkDays } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, Card, Empty, errMsg, Field, Modal, useToast } from '../../components/ui';
import { PendenzList } from './Pendenzen';
import { useT } from '../../i18n';

/** Before or on AVOR days: preparation Rapport; during the WK: Kaderrapport. */
export const schemaFor = (detail: WkDetail, date: string): RapportSchema =>
  date < detail.wk.startDate || detail.wk.avorDays.includes(date) || detail.wk.kvkDays.includes(date) ? 'AUSB_VORB' : 'AUSB_DURCH';

/** `part`: the Rapporte (tab «Rapporte») or all Pendenzen (tab «Pendenzen»). */
export function RapportePage({ detail, part = 'rapporte' }: { detail: WkDetail; part?: 'rapporte' | 'pendenzen' }) {
  const { t, weekdayShort } = useT();
  const me = useUser();
  const { wk, zuege, blocks } = detail;
  const rapporte = useQuery({ queryKey: ['rapporte', wk.id], queryFn: () => api.rapporte(wk.id) });
  const pendenzen = useQuery({ queryKey: ['pendenzen', wk.id], queryFn: () => api.pendenzen(wk.id) });
  const [creating, setCreating] = useState<Partial<NewRapport> | null>(null);
  const [filter, setFilter] = useState<'offen' | 'meine' | 'alle'>('offen');
  const list = rapporte.data ?? [];
  const zugName = (id: number | null) => (id === null ? 'Kp' : (zuege.find((z) => z.id === id)?.name ?? ''));
  // «Rapport» blocks of the Arbeitsprogramm that have no protocol yet.
  const planned = blocks
    .filter((b) => b.type === 'RAPPORT' && !list.some((r) => r.blockId === b.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const zugOfBlock = (b: Block) => (b.zugIds.length === 1 && b.zugIds[0] !== 0 ? b.zugIds[0] : null);
  const canNew = canCreateRapport(me, wk, null) || zuege.some((z) => canCreateRapport(me, wk, z.id));
  const shownPendenzen = (pendenzen.data ?? []).filter((p) => (filter === 'alle' ? true : filter === 'meine' ? p.responsibleUserId === me.id : !p.done));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-6">
        {part === 'rapporte' && (
        <Card
          title={t('rap.title')}
          actions={
            canNew && (
              <Button variant="primary" onClick={() => setCreating({})}>
                {t('rap.add')}
              </Button>
            )
          }
        >
          {rapporte.isLoading ? (
            <Empty>{t('common.loading')}</Empty>
          ) : list.length === 0 ? (
            <Empty>{t('rap.none')}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((r) => {
                const open = (pendenzen.data ?? []).filter((p) => p.rapportId === r.id && !p.done).length;
                return (
                  <li key={r.id}>
                    <Link to={`${r.id}`} className="flex flex-wrap items-baseline gap-x-3 py-2 hover:bg-slate-50">
                      <span className="w-32 shrink-0 text-sm tabular-nums text-slate-500">
                        {weekdayShort(r.date)} {fmtDate(r.date)} {r.startMin !== null && fmtTime(r.startMin)}
                      </span>
                      <span className="min-w-0 flex-1 font-medium text-zs-blue">{r.title}</span>
                      <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{zugName(r.zugId)}</span>
                      <span className="text-xs text-slate-500">{t(`rap.schema.${r.schema}.label`)}</span>
                      {open > 0 && <span className="text-xs font-medium text-amber-700">{open} Pendenzen offen</span>}
                      <span className={`text-xs ${r.status === 'ABGESCHLOSSEN' ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {r.status === 'ABGESCHLOSSEN' ? 'abgeschlossen' : 'offen'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {planned.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="label">{t('rap.plannedNoProtocol')}</div>
              <ul className="space-y-1 text-sm">
                {planned.map((b) => {
                  const zugId = zugOfBlock(b);
                  const can = canCreateRapport(me, wk, zugId);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-3">
                      <span className="w-32 shrink-0 tabular-nums text-slate-500">
                        {weekdayShort(b.date)} {fmtDate(b.date)} {fmtTime(b.startMin)}
                      </span>
                      <span className="flex-1">
                        {b.title} <span className="text-xs text-slate-400">({zugName(zugId)})</span>
                      </span>
                      {can && (
                        <Button
                          className="py-0.5 text-xs"
                          onClick={() => setCreating({ blockId: b.id, zugId, title: b.title, date: b.date, startMin: b.startMin, schema: schemaFor(detail, b.date) })}
                        >
                          {t('rap.createProtocol')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
        )}

        {part === 'pendenzen' && (
        <Card
          title={t('rap.pendenzen')}
          actions={
            <div className="flex gap-1">
              {(['offen', 'meine', 'alle'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === f ? 'border-zs-blue bg-blue-50 text-zs-blue' : 'border-slate-300 text-slate-600'}`}
                >
                  {t(`rap.filter.${f}`)}
                </button>
              ))}
            </div>
          }
        >
          {shownPendenzen.length === 0 && <Empty>{t('rap.noPendenzen')}</Empty>}
          <PendenzList wk={wk} items={shownPendenzen} rapporte={list} showSource />
        </Card>
        )}
      </div>
      {creating && <NewRapportDialog detail={detail} initial={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

interface NewRapport {
  zugId: number | null;
  blockId: number | null;
  title: string;
  schema: RapportSchema;
  date: string;
  startMin: number | null;
  ort: string;
}

function NewRapportDialog({ detail, initial, onClose }: { detail: WkDetail; initial: Partial<NewRapport>; onClose: () => void }) {
  const { t, weekdayShort } = useT();
  const me = useUser();
  const nav = useNavigate();
  const toast = useToast();
  const { wk, zuege } = detail;
  const days = wkDays(wk);
  const scopes = [
    ...(canCreateRapport(me, wk, null) ? [{ id: null as number | null, name: 'Kompanie (Kaderrapport)' }] : []),
    ...zuege.filter((z) => canCreateRapport(me, wk, z.id)).map((z) => ({ id: z.id as number | null, name: z.name })),
  ];
  const firstDate = initial.date ?? (days.find((d) => d >= new Date().toISOString().slice(0, 10)) || days[0]);
  const [f, setF] = useState<NewRapport>({
    zugId: scopes[0]?.id ?? null,
    blockId: null,
    title: '',
    schema: schemaFor(detail, firstDate),
    date: firstDate,
    startMin: null,
    ort: '',
    ...initial,
  });
  const create = async () => {
    try {
      const r = await api.createRapport(wk.id, { ...f, title: f.title.trim() || t(`rap.schema.${f.schema}.label`) });
      nav(`${r.id}`);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <Modal
      title={t('rap.new')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!f.date} onClick={create}>
            {t('erk.create')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.title')}>
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('rap.titlePh')} />
        </Field>
        <Field label={t('std.for')}>
          <select
            className="input"
            value={f.zugId ?? ''}
            disabled={scopes.length < 2}
            onChange={(e) => setF({ ...f, zugId: e.target.value ? Number(e.target.value) : null })}
          >
            {scopes.map((s) => (
              <option key={s.id ?? 'kp'} value={s.id ?? ''}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common.date')}>
          <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('common.time')}>
            <input
              type="time"
              className="input"
              value={f.startMin === null ? '' : fmtTime(f.startMin)}
              onChange={(e) => setF({ ...f, startMin: e.target.value ? parseTime(e.target.value) : null })}
            />
          </Field>
          <Field label={t('rap.ort')}>
            <input className="input" value={f.ort} onChange={(e) => setF({ ...f, ort: e.target.value })} />
          </Field>
        </div>
      </div>
      <div>
        <span className="label">{t('rap.schema')}</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(RAPPORT_SCHEMAS) as RapportSchema[]).map((k) => {
            const s = { label: t(`rap.schema.${k}.label`), hint: t(`rap.schema.${k}.hint`), traktanden: RAPPORT_SCHEMAS[k].traktanden };
            const on = f.schema === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setF({ ...f, schema: k })}
                className={`rounded-lg border-2 p-2.5 text-left ${on ? 'border-zs-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-xs text-slate-500">{s.hint}</div>
                {on && (
                  <ol className="mt-1 list-decimal pl-4 text-xs text-slate-600">
                    {s.traktanden.map((x) => (
                      <li key={x.key}>{x.title}</li>
                    ))}
                  </ol>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
