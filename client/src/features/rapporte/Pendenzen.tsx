// Pendenzen: list with tick-off and inline editing, used in the Rapport and in the overview.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Pendenz, PendenzInput, Rapport, Wk } from '@shared/types';
import { canCreateRapport, canEditRapport, canTickPendenz } from '@shared/permissions';
import { fmtDate } from '@shared/util';
import { api } from '../../api';
import { useUser } from '../../auth';
import { Button, errMsg, useToast } from '../../components/ui';
import { useT } from '../../i18n';

const today = () => new Date().toISOString().slice(0, 10);

/** People of the Kp, for «wer». */
export function useKpPeople(kpId: number) {
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  return (org.data?.users ?? []).filter((u) => u.kpId === kpId).sort((a, b) => a.name.localeCompare(b.name));
}

export function usePendenzEdit(wk: Wk, rapporte: Rapport[]) {
  const me = useUser();
  return (p: Pick<Pendenz, 'rapportId' | 'zugId' | 'createdBy'>) => {
    const rap = rapporte.find((r) => r.id === p.rapportId);
    return rap ? canEditRapport(me, wk, rap) : canCreateRapport(me, wk, p.zugId) || p.createdBy === me.id;
  };
}

export function PendenzList({
  wk,
  items,
  rapporte,
  newFor,
  showSource,
}: {
  wk: Wk;
  items: Pendenz[];
  rapporte: Rapport[];
  /** Where new Pendenzen go; without it none can be added. */
  newFor?: Pick<PendenzInput, 'rapportId' | 'traktandumKey' | 'zugId'>;
  showSource?: boolean;
}) {
  const { t } = useT();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const people = useKpPeople(wk.kpId);
  const canEdit = usePendenzEdit(wk, rapporte);
  const [draft, setDraft] = useState({ text: '', responsibleUserId: null as number | null, dueDate: '' });
  const [editing, setEditing] = useState<number | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['pendenzen', wk.id] });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const add = () =>
    newFor &&
    draft.text.trim() &&
    run(async () => {
      await api.createPendenz(wk.id, { ...newFor, ...draft, text: draft.text.trim() });
      setDraft({ text: '', responsibleUserId: draft.responsibleUserId, dueDate: draft.dueDate });
    });
  const rapTitle = (id: number | null) => {
    const r = rapporte.find((x) => x.id === id);
    return r ? `${r.title} ${fmtDate(r.date).slice(0, 6)}` : '';
  };
  const whoSelect = (value: number | null, onChange: (v: number | null) => void) => (
    <select className="input w-auto py-1 text-xs" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label={t('rap.who')}>
      <option value="">{t('pend.whoChoose')}</option>
      {people.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-1">
      {items.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {items.map((p) => {
            const edit = canEdit(p);
            const tick = canTickPendenz(me, wk, p, edit);
            const overdue = !p.done && p.dueDate && p.dueDate < today();
            return (
              <li key={p.id} className="flex flex-wrap items-start gap-x-2 gap-y-1 px-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={p.done}
                  disabled={!tick}
                  aria-label={t('pend.doneLower')}
                  onChange={(e) => run(() => api.tickPendenz(wk.id, p.id, e.target.checked))}
                />
                {editing === p.id ? (
                  <EditRow
                    p={p}
                    whoSelect={whoSelect}
                    onCancel={() => setEditing(null)}
                    onSave={(b) => run(async () => (await api.updatePendenz(wk.id, p.id, b), setEditing(null)))}
                    onDelete={() => confirm(t('pend.confirmDelete')) && run(() => api.deletePendenz(wk.id, p.id))}
                  />
                ) : (
                  <>
                    <span className={`min-w-0 flex-1 whitespace-pre-wrap ${p.done ? 'text-slate-400 line-through' : ''}`}>
                      {p.text}
                      {showSource && p.rapportId && <span className="ml-1 text-xs text-slate-400 no-underline">· {rapTitle(p.rapportId)}</span>}
                    </span>
                    <span className="text-xs text-slate-600">{p.responsibleName || <span className="text-slate-400">{t('pend.whoQ')}</span>}</span>
                    {p.dueDate && <span className={`text-xs tabular-nums ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>bis {fmtDate(p.dueDate)}</span>}
                    {p.done && <span className="text-xs text-emerald-700">✓ {p.doneByName}</span>}
                    {edit && (
                      <button className="no-print text-xs text-slate-400 hover:text-zs-blue" onClick={() => setEditing(p.id)} aria-label={t('common.edit')}>
                        ✎
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {newFor && canEdit({ ...newFor, createdBy: me.id }) && (
        <div className="no-print flex flex-wrap items-center gap-1.5">
          <input
            className="input min-w-[12rem] flex-1 py-1 text-sm"
            placeholder={t('pend.addPh')}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          {whoSelect(draft.responsibleUserId, (responsibleUserId) => setDraft({ ...draft, responsibleUserId }))}
          <input type="date" className="input w-auto py-1 text-xs" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} aria-label={t('rap.until')} />
          <Button className="py-1 text-xs" disabled={!draft.text.trim()} onClick={add}>
            {t('common.add')}
          </Button>
        </div>
      )}
    </div>
  );
}

function EditRow({
  p,
  whoSelect,
  onSave,
  onCancel,
  onDelete,
}: {
  p: Pendenz;
  whoSelect: (v: number | null, onChange: (v: number | null) => void) => JSX.Element;
  onSave: (b: Partial<PendenzInput>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const [b, setB] = useState({ text: p.text, responsibleUserId: p.responsibleUserId, dueDate: p.dueDate, traktandumKey: p.traktandumKey });
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <input className="input min-w-[12rem] flex-1 py-1 text-sm" value={b.text} autoFocus onChange={(e) => setB({ ...b, text: e.target.value })} />
      {whoSelect(b.responsibleUserId, (responsibleUserId) => setB({ ...b, responsibleUserId }))}
      <input type="date" className="input w-auto py-1 text-xs" value={b.dueDate} onChange={(e) => setB({ ...b, dueDate: e.target.value })} aria-label={t('rap.until')} />
      <Button className="py-1 text-xs" variant="primary" disabled={!b.text.trim()} onClick={() => onSave(b)}>
        {t('pend.ok')}
      </Button>
      <Button className="py-1 text-xs" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button className="py-1 text-xs" variant="ghost" onClick={onDelete}>
        {t('common.delete')}
      </Button>
    </div>
  );
}
