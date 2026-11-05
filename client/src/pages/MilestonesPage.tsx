import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Milestone, MilestoneInput, Role } from '@shared/types';
import { PLANNING_ROLES, ROLE_LABEL } from '@shared/types';
import { canEditMilestones, canSeeAllMilestones, canTickMilestone } from '@shared/permissions';
import { fmtDate } from '@shared/util';
import { api, type WkDetail } from '../api';
import { useUser } from '../auth';
import { Button, Card, Empty, errMsg, Modal, Field, TextArea, useToast } from '../components/ui';
import { ImportExportMenu } from '../components/ImportExport';
import { exportTable, importTable, parseDateCell } from '../lib/tableFile';
import { roleOf, STEP_COLUMNS } from '../lib/vorbereitungFile';

const today = () => new Date().toISOString().slice(0, 10);
const doneByMe = (m: Milestone, userId: number) => m.doneBy.some((d) => d.userId === userId);
const complete = (m: Milestone) => m.responsible.length > 0 && m.responsible.every((p) => m.doneBy.some((d) => d.userId === p.userId));

/** Vorbereitung: each person works through the items of their role; Bat and Kp Kdt follow everybody's progress. */
/** `embedded`: part of the Pendenzen view (no own scroll area). */
export function MilestonesPage({ detail, embedded }: { detail: WkDetail; embedded?: boolean }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk } = detail;
  const key = ['milestones', wk.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.milestones(wk.id), refetchInterval: 30000 });
  const seesAll = canSeeAllMilestones(me);
  const editable = canEditMilestones(me, wk);
  const [roleFilter, setRoleFilter] = useState<Role | 'MINE' | 'ALL'>(seesAll ? 'ALL' : 'MINE');
  const [edit, setEdit] = useState<Partial<Milestone> | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const all = q.data ?? [];
  const mine = all.filter((m) => m.ownerRole === me.role);
  const list = roleFilter === 'ALL' ? all : roleFilter === 'MINE' ? mine : all.filter((m) => m.ownerRole === roleFilter);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['wks'] });
  };
  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    try {
      await fn();
      refresh();
      if (msg) toast(msg);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const exportFile = (format: 'xlsx' | 'json') =>
    exportTable(
      `Vorbereitung_${wk.title.replace(/[^\wäöüÄÖÜ]+/g, '_')}`,
      'WK-Planer Vorbereitung',
      STEP_COLUMNS,
      list.map((m) => ({
        titel: m.title,
        beschreibung: m.description,
        rolle: ROLE_LABEL[m.ownerRole],
        termin: m.dueDate,
        erledigt: `${m.doneBy.length}/${m.responsible.length}`,
      })),
      format,
    );
  /** Adds the steps of a file that the WK does not have yet (matched by title). */
  const importFile = async (file: File) => {
    const rows = await importTable(file, STEP_COLUMNS);
    let added = 0;
    const skipped: string[] = [];
    for (const r of rows) {
      const role = roleOf(r.rolle);
      const due = parseDateCell(r.termin ?? '');
      if (!r.titel || !role || !due) {
        skipped.push(r.titel || '(ohne Titel)');
        continue;
      }
      if (all.some((m) => m.title === r.titel)) continue;
      await api.addMilestone(wk.id, { title: r.titel, description: r.beschreibung ?? '', ownerRole: role, dueDate: due });
      added++;
    }
    refresh();
    return `${added} Schritte ergänzt${skipped.length ? `, ${skipped.length} ohne gültige Rolle/Termin übersprungen` : ''}`;
  };

  const myDone = mine.filter((m) => doneByMe(m, me.id)).length;
  const allDone = all.filter(complete).length;
  const progress = seesAll && roleFilter !== 'MINE' ? { done: allDone, total: all.length, label: 'vollständig erledigt' } : { done: myDone, total: mine.length, label: 'von mir erledigt' };

  return (
    <div className={embedded ? '' : 'min-h-0 flex-1 overflow-y-auto'}>
      <div className={embedded ? 'space-y-4' : 'mx-auto max-w-4xl space-y-4 p-3 sm:p-6'}>
        <div>
          <h2 className="text-lg font-semibold">Vorbereitung</h2>
          <p className="text-sm text-slate-500">
            {progress.done} von {progress.total} {progress.label} · WK-Beginn {fmtDate(wk.startDate)}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(seesAll ? (['ALL', ...(PLANNING_ROLES.includes(me.role) ? ['MINE'] : []), ...PLANNING_ROLES] as const) : (['MINE'] as const)).map((r) => (
            <button
              key={r}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${roleFilter === r ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setRoleFilter(r as typeof roleFilter)}
            >
              {r === 'ALL' ? 'Alle' : r === 'MINE' ? `Meine (${ROLE_LABEL[me.role]})` : ROLE_LABEL[r as Role]}
              {r !== 'ALL' && r !== 'MINE' && ` ${all.filter((m) => m.ownerRole === r).length}`}
            </button>
          ))}
          <span className="flex-1" />
          <ImportExportMenu label="Excel / JSON" onExport={exportFile} onImport={editable ? importFile : undefined} />
          {editable && (
            <>
              <Button variant="ghost" className="text-xs" onClick={() => run(async () => toast(`${(await api.applyTemplate(wk.id)).added} Schritte aus der Vorlage ergänzt`))}>
                Vorlage übernehmen
              </Button>
              <Button variant="primary" className="text-xs" onClick={() => setEdit({ title: '', description: '', dueDate: '', ownerRole: 'ZFHR' })}>
                + Schritt
              </Button>
            </>
          )}
        </div>

        <Card>
          {list.length === 0 ? (
            <Empty>{q.isLoading ? 'Laden …' : 'Keine Vorbereitungsschritte.'}</Empty>
          ) : (
            <ol className="divide-y divide-slate-100">
              {list.map((m) => {
                const mineDone = doneByMe(m, me.id);
                const isDone = canTickMilestone(me, wk, m) ? mineDone : complete(m);
                const overdue = !isDone && m.dueDate < today();
                const expanded = openId === m.id;
                return (
                  <li key={m.id} className="px-3 py-2.5 sm:px-4">
                    <div className="flex items-start gap-3">
                      {canTickMilestone(me, wk, m) ? (
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
                          checked={mineDone}
                          onChange={(e) => run(() => api.tickMilestone(wk.id, m.id, e.target.checked))}
                          aria-label={`${m.title} erledigt`}
                        />
                      ) : (
                        <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${isDone ? 'bg-emerald-500' : overdue ? 'bg-red-500' : 'bg-slate-300'}`} />
                      )}
                      <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(expanded ? null : m.id)}>
                        <div className={`text-sm ${isDone ? 'text-slate-400 line-through' : 'font-medium'}`}>{m.title}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                          <span className={overdue ? 'font-semibold text-red-600' : ''}>
                            {fmtDate(m.dueDate)}
                            {overdue && ' · überfällig'}
                          </span>
                          {seesAll && <span>{ROLE_LABEL[m.ownerRole]}</span>}
                          {m.responsible.length > 1 && (
                            <span>
                              {m.doneBy.length}/{m.responsible.length} erledigt
                            </span>
                          )}
                          {m.responsible.length === 0 && <span className="text-amber-700">keine Person mit dieser Rolle</span>}
                        </div>
                      </button>
                      {editable && (
                        <button className="text-xs text-slate-400 hover:text-zs-blue" onClick={() => setEdit(m)}>
                          Bearbeiten
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div className="ml-8 mt-2 space-y-2 text-sm">
                        {m.description && <p className="whitespace-pre-wrap text-slate-600">{m.description}</p>}
                        {(seesAll || m.responsible.length > 1) && (
                          <ul className="flex flex-wrap gap-1.5">
                            {m.responsible.map((p) => {
                              const d = m.doneBy.find((x) => x.userId === p.userId);
                              return (
                                <li key={p.userId} className={`rounded-full px-2 py-0.5 text-xs ${d ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                                  {d ? '✓ ' : ''}
                                  {p.name}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      {edit && (
        <MilestoneDialog
          initial={edit}
          onClose={() => setEdit(null)}
          onSave={(b) =>
            run(async () => {
              if (edit.id) await api.updateMilestone(wk.id, edit.id, b);
              else await api.addMilestone(wk.id, b);
              setEdit(null);
            })
          }
          onDelete={
            edit.id
              ? () =>
                  confirm('Vorbereitungsschritt löschen?') &&
                  run(async () => {
                    await api.deleteMilestone(wk.id, edit.id!);
                    setEdit(null);
                  })
              : undefined
          }
        />
      )}
    </div>
  );
}

function MilestoneDialog({ initial, onClose, onSave, onDelete }: { initial: Partial<Milestone>; onClose: () => void; onSave: (m: MilestoneInput) => void; onDelete?: () => void }) {
  const [f, setF] = useState<MilestoneInput>({
    title: initial.title ?? '',
    description: initial.description ?? '',
    dueDate: initial.dueDate ?? '',
    ownerRole: initial.ownerRole ?? 'ZFHR',
  });
  return (
    <Modal
      title={initial.id ? 'Vorbereitungsschritt bearbeiten' : 'Neuer Vorbereitungsschritt'}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <Button variant="danger" className="mr-auto" onClick={onDelete}>
              Löschen
            </Button>
          )}
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!f.title.trim() || !f.dueDate} onClick={() => onSave(f)}>
            Speichern
          </Button>
        </>
      }
    >
      <Field label="Titel">
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Termin">
          <input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
        <Field label="Rolle">
          <select className="input" value={f.ownerRole} onChange={(e) => setF({ ...f, ownerRole: e.target.value as Role })}>
            {PLANNING_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Beschreibung">
        <TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      {initial.id && initial.ownerRole !== f.ownerRole && (
        <p className="text-xs text-amber-700">Bei einem Rollenwechsel werden die bisherigen Erledigt-Markierungen zurückgesetzt.</p>
      )}
    </Modal>
  );
}
