import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Participant, ParticipantInput, Zug } from '@shared/types';
import { DIET_LABEL } from '@shared/types';
import { canManagePersonnel } from '@shared/permissions';
import { fmtDate, wkDays } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { ImportExportMenu } from '../../components/ImportExport';
import { Button, Card, Empty, errMsg, Field, Modal, useToast } from '../../components/ui';
import { exportTable, importTable } from '../../lib/tableFile';

import { ALIASES, applyZugMapping, COLUMNS, parseParticipants, type ParsedImport } from './participantImport';
import { useT } from '../../i18n';

const fullName = (p: Pick<Participant, 'grad' | 'vorname' | 'nachname'>) => [p.grad, p.nachname, p.vorname].filter(Boolean).join(' ');

export function Participants({ detail }: { detail: WkDetail }) {
  const { t, tn } = useT();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const manage = canManagePersonnel(me, wk);
  const q = useQuery({ queryKey: ['participants', wk.id], queryFn: () => api.participants(wk.id) });
  const [zugFilter, setZugFilter] = useState<number | 'none' | ''>('');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Partial<Participant> | null>(null);
  const [pending, setPending] = useState<ParsedImport | null>(null);
  // Zug per Funktion (personnel system without Zug column); remembered per Kp for the next import.
  const mappingKey = `zs-funktion-zug-${wk.kpId}`;
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const zugName = (id: number | null) => zuege.find((z) => z.id === id)?.name ?? '';
  const list = (q.data ?? [])
    .filter((p) => zugFilter === '' || (zugFilter === 'none' ? p.zugId === null : p.zugId === zugFilter))
    .filter((p) => !search || `${p.vorname} ${p.nachname} ${p.funktion} ${p.grad}`.toLowerCase().includes(search.toLowerCase()));
  const refresh = () => qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === 'participants' || x.queryKey[0] === 'checkins' });

  const exportFile = (format: 'xlsx' | 'json') =>
    exportTable(
      `Teilnehmerliste_${wk.title.replace(/[^\w]+/g, '_')}`,
      'WK-Planer Teilnehmerliste',
      COLUMNS,
      (q.data ?? []).map((p) => ({
        nachname: p.nachname,
        vorname: p.vorname,
        grad: p.grad,
        funktion: p.funktion,
        zug: zugName(p.zugId),
        email: p.email,
        nummer: p.extId,
        tage: p.days.map(fmtDate).join(', '),
        essen: DIET_LABEL[p.diet],
        unvertraeglichkeiten: p.intolerances,
      })),
      format,
    );

  const importFile = async (file: File) => {
    const rows = await importTable(file, [...COLUMNS, ...ALIASES]);
    const parsed = parseParticipants(rows, wk, zuege);
    if (!parsed.items.length) throw new Error(t('part.noneInFile'));
    let saved: Record<string, number | null> = {};
    try {
      saved = JSON.parse(localStorage.getItem(mappingKey) ?? '{}');
    } catch {
      /* no storage */
    }
    const ids = new Set(zuege.map((z) => z.id));
    setMapping(
      Object.fromEntries(
        parsed.funktionen.map((f) => [f.funktion, f.funktion in saved && (saved[f.funktion] === null || ids.has(saved[f.funktion]!)) ? saved[f.funktion] : f.guess]),
      ),
    );
    setPending(parsed);
  };
  const runImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    try {
      try {
        localStorage.setItem(mappingKey, JSON.stringify(mapping));
      } catch {
        /* no storage */
      }
      const r = await api.importParticipants(wk.id, mode, applyZugMapping(pending.items, mapping));
      refresh();
      toast(`${r.added} neu, ${r.updated} aktualisiert${r.removed ? `, ${r.removed} entfernt` : ''}`);
      setPending(null);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Card
      title={t('part.title', { n: q.data?.length ?? 0 })}
      actions={
        <>
          <ImportExportMenu onExport={exportFile} onImport={manage ? importFile : undefined} />
          {manage && (
            <Button variant="primary" onClick={() => setEdit({ zugId: typeof zugFilter === 'number' ? zugFilter : null })}>
              {t('part.add')}
            </Button>
          )}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={zugFilter} onChange={(e) => setZugFilter(e.target.value === '' || e.target.value === 'none' ? e.target.value : Number(e.target.value))}>
          <option value="">{t('part.allZuege')}</option>
          {zuege.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
          <option value="none">{t('part.noZug')}</option>
        </select>
        <input className="input w-56" placeholder={t('part.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {manage && (q.data?.length ?? 0) === 0 && (
        <p className="mb-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-slate-700">
          Excel-Liste aus dem Personalsystem importieren (Import / Export). Erkannte Spalten: Nachname, Vorname, Grad, Funktion, Zug, E-Mail, Nummer
          (z. B. AHV-Nr.), Tage (leer = ganzer WK).
        </p>
      )}
      {manage && selected.length > 0 && (
        <BulkBar
          detail={detail}
          ids={selected}
          onDone={() => {
            setSelected([]);
            refresh();
          }}
        />
      )}
      {q.isLoading ? (
        <Empty>{t('common.loading')}</Empty>
      ) : list.length === 0 ? (
        <Empty>{t('part.none')}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                {manage && (
                  <th className="w-8 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={t('part.selectAll')}
                      checked={list.length > 0 && list.every((p) => selected.includes(p.id))}
                      onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...list.map((p) => p.id)])] : selected.filter((id) => !list.some((p) => p.id === id)))}
                    />
                  </th>
                )}
                <th className="py-1.5 pr-3">{t('profile.name')}</th>
                <th className="py-1.5 pr-3">{t('admin.funktion')}</th>
                <th className="py-1.5 pr-3">{t('common.zug')}</th>
                <th className="py-1.5 pr-3 max-sm:hidden">{t('login.email')}</th>
                <th className="py-1.5 pr-3 max-sm:hidden">{t('part.days')}</th>
                <th className="py-1.5 pr-3 max-md:hidden">{t('part.food')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr
                  key={p.id}
                  className={`border-t border-slate-100 ${manage ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  onClick={() => manage && setEdit(p)}
                >
                  {manage && (
                    <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={t('part.select', { name: fullName(p) })}
                        checked={selected.includes(p.id)}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
                      />
                    </td>
                  )}
                  <td className="py-1.5 pr-3 font-medium">{fullName(p)}</td>
                  <td className="py-1.5 pr-3">{p.funktion}</td>
                  <td className="py-1.5 pr-3">{zugName(p.zugId) || <span className="text-amber-700">–</span>}</td>
                  <td className="py-1.5 pr-3 max-sm:hidden">{p.email}</td>
                  <td className="py-1.5 pr-3 text-xs max-sm:hidden">{p.days.length ? p.days.map((d) => fmtDate(d).slice(0, 6)).join(', ') : t('part.wholeWk')}</td>
                  <td className="py-1.5 pr-3 text-xs max-md:hidden">
                    {p.diet !== 'NORMAL' && t(`diet.${p.diet}`)}
                    {p.intolerances && <span className="text-slate-500"> {p.intolerances}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <ParticipantDialog detail={detail} initial={edit} onClose={() => setEdit(null)} onSaved={refresh} />}
      {pending && (
        <Modal
          title={t('part.importTitle')}
          onClose={() => setPending(null)}
          footer={
            <>
              <Button onClick={() => setPending(null)}>{t('common.cancel')}</Button>
              {(q.data?.length ?? 0) > 0 && (
                <Button variant="danger" onClick={() => runImport('replace')}>
                  {t('part.replace')}
                </Button>
              )}
              <Button variant="primary" onClick={() => runImport('merge')}>
                {(q.data?.length ?? 0) > 0 ? t('part.merge') : t('part.import')}
              </Button>
            </>
          }
        >
          <p className="text-sm">{t('part.foundInFile', { n: pending.items.length })}</p>
          {(q.data?.length ?? 0) > 0 && (
            <p className="text-sm text-slate-600">
              {tn('part.mergeHint', { merge: <b>{t('part.merge')}</b>, replace: <b>{t('part.replace')}</b> })}
            </p>
          )}
          {pending.outside > 0 && (
            <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">
              {t('part.outside', { n: pending.outside, wk: wk.title })}
            </p>
          )}
          {pending.funktionen.length > 0 && (
            <div>
              <div className="label">{t('part.zugPerFunktion')}</div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {pending.funktionen.map((f) => (
                  <label key={f.funktion} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {f.funktion} <span className="text-xs text-slate-500">({f.count})</span>
                    </span>
                    <select
                      className="input !w-44 py-1 text-sm"
                      value={mapping[f.funktion] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [f.funktion]: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">{t('part.noZugKdo')}</option>
                      {zuege.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">{t('part.keepZug')}</p>
            </div>
          )}
          {pending.unknownZuege.length > 0 && (
            <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">
              {t('part.unknownZuege', { list: pending.unknownZuege.join(', '), known: zuege.map((z) => z.name).join(', ') })}
            </p>
          )}
        </Modal>
      )}
    </Card>
  );
}

export function ParticipantDialog({
  detail,
  initial,
  onClose,
  onSaved,
  title,
  onSubmit,
}: {
  detail: WkDetail;
  initial: Partial<Participant>;
  onClose: () => void;
  onSaved: () => void;
  title?: string;
  /** Instead of saving the person: e.g. add from an unmatched check-in. */
  onSubmit?: (p: ParticipantInput) => Promise<void>;
}) {
  const { t } = useT();
  const toast = useToast();
  const { wk, zuege } = detail;
  const days = wkDays(wk);
  const [p, setP] = useState<ParticipantInput>({
    nachname: initial.nachname ?? '',
    vorname: initial.vorname ?? '',
    grad: initial.grad ?? '',
    funktion: initial.funktion ?? '',
    zugId: initial.zugId ?? null,
    email: initial.email ?? '',
    extId: initial.extId ?? '',
    days: initial.days ?? [],
  });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onSaved();
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const save = () =>
    run(() => (onSubmit ? onSubmit(p) : initial.id ? api.updateParticipant(wk.id, initial.id, p) : api.createParticipant(wk.id, p)));
  return (
    <Modal
      title={title ?? (initial.id ? t('part.edit') : t('part.addTitle'))}
      onClose={onClose}
      footer={
        <>
          {initial.id && !onSubmit && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => confirm(t('part.confirmRemove')) && run(() => api.deleteParticipant(wk.id, initial.id!))}
            >
              {t('common.remove')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!p.nachname.trim()} onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('part.lastName')}>
          <input className="input" value={p.nachname} onChange={(e) => setP({ ...p, nachname: e.target.value })} />
        </Field>
        <Field label={t('part.firstName')}>
          <input className="input" value={p.vorname} onChange={(e) => setP({ ...p, vorname: e.target.value })} />
        </Field>
        <Field label={t('part.grad')}>
          <input className="input" value={p.grad} onChange={(e) => setP({ ...p, grad: e.target.value })} />
        </Field>
        <Field label={t('admin.funktion')}>
          <input className="input" value={p.funktion} onChange={(e) => setP({ ...p, funktion: e.target.value })} />
        </Field>
        <Field label={t('common.zug')}>
          <select className="input" value={p.zugId ?? ''} onChange={(e) => setP({ ...p, zugId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{t('part.none2')}</option>
            {zuege.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('login.email')}>
          <input className="input" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
        </Field>
        <Field label={t('part.number')}>
          <input className="input" value={p.extId} onChange={(e) => setP({ ...p, extId: e.target.value })} />
        </Field>
      </div>
      <div>
        <span className="label">{t('part.serviceDays')}</span>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => {
            const on = p.days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setP({ ...p, days: on ? p.days.filter((x) => x !== d) : [...p.days, d].sort() })}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-zs-blue bg-blue-50 text-zs-blue' : 'border-slate-300 text-slate-600'}`}
              >
                {fmtDate(d).slice(0, 6)}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/** Several selected people: Zug and/or days of service at once. */
function BulkBar({ detail, ids, onDone }: { detail: WkDetail; ids: number[]; onDone: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const { wk, zuege } = detail;
  const days = wkDays(wk);
  const [zug, setZug] = useState<string>('');
  const [serve, setServe] = useState<string[]>([]);
  const run = async (b: { zugId?: number | null; days?: string[] }, what: string) => {
    try {
      const r = await api.bulkParticipants(wk.id, { ids, ...b });
      toast(t('part.updated', { n: r.updated, what }));
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const remove = async () => {
    if (!confirm(t('part.confirmBulkRemove', { n: ids.length }))) return;
    try {
      const r = await api.deleteParticipants(wk.id, ids);
      toast(t('part.removed', { n: r.deleted }));
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <div className="no-print sticky top-0 z-10 mb-3 space-y-2 rounded-md border border-zs-blue bg-blue-50 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>{t('part.selected', { n: ids.length })}</b>
        <span className="text-slate-400">|</span>
        <select className="input !w-auto py-1 text-sm" value={zug} onChange={(e) => setZug(e.target.value)} aria-label={t('common.zug')}>
          <option value="">{t('part.chooseZug')}</option>
          <option value="none">{t('part.noZugKdo')}</option>
          {zuege.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <Button className="py-1 text-xs" disabled={!zug} onClick={() => run({ zugId: zug === 'none' ? null : Number(zug) }, t('part.zugAssigned'))}>
          {t('part.assignZug')}
        </Button>
        <span className="flex-1" />
        <Button variant="danger" className="py-1 text-xs" onClick={remove}>
          {ids.length} entfernen
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-slate-600">{t('part.serviceDaysLabel')}</span>
        {days.map((d) => {
          const on = serve.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => setServe(on ? serve.filter((x) => x !== d) : [...serve, d].sort())}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 bg-white text-slate-600'}`}
            >
              {wk.avorDays.includes(d) ? t('duty.AVOR') + ' ' : wk.kvkDays.includes(d) ? t('duty.KVK') + ' ' : ''}
              {fmtDate(d).slice(0, 6)}
            </button>
          );
        })}
        <Button className="py-1 text-xs" disabled={!serve.length} onClick={() => run({ days: serve }, t('part.daysSet'))}>
          {t('part.setDays')}
        </Button>
        <Button className="py-1 text-xs" onClick={() => run({ days: [] }, t('part.wholeWk'))}>
          {t('part.wholeWkButton')}
        </Button>
      </div>
    </div>
  );
}

