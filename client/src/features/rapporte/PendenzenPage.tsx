// Pendenzen and Vorbereitung in one view: superiors assign Pendenzen to themselves and their subordinates.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL } from '@shared/types';
import { canAssignPendenz, canViewMilestones } from '@shared/permissions';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, Card, Empty, errMsg, useToast } from '../../components/ui';
import { MilestonesPage } from '../../pages/MilestonesPage';
import { PendenzList } from './Pendenzen';

export function PendenzenPage({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const pendenzen = useQuery({ queryKey: ['pendenzen', wk.id], queryFn: () => api.pendenzen(wk.id) });
  const rapporte = useQuery({ queryKey: ['rapporte', wk.id], queryFn: () => api.rapporte(wk.id) });
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [filter, setFilter] = useState<'offen' | 'meine' | 'alle'>('offen');
  // Who I may assign a Pendenz to: myself first, then the subordinates.
  const people = (org.data?.users ?? [])
    .filter((p) => canAssignPendenz(me, wk, p))
    .sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id) || a.name.localeCompare(b.name));
  const [draft, setDraft] = useState({ text: '', who: me.id as number | null, dueDate: '' });
  const zugName = (id: number | null) => zuege.find((z) => z.id === id)?.name;

  const add = async () => {
    if (!draft.text.trim() || !draft.who) return;
    try {
      await api.createPendenz(wk.id, { rapportId: null, traktandumKey: null, zugId: null, text: draft.text.trim(), responsibleUserId: draft.who, dueDate: draft.dueDate });
      qc.invalidateQueries({ queryKey: ['pendenzen', wk.id] });
      setDraft({ ...draft, text: '' });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const list = (pendenzen.data ?? []).filter((p) => (filter === 'alle' ? true : filter === 'meine' ? p.responsibleUserId === me.id : !p.done));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
        <Card
          title="Pendenzen"
          actions={
            <div className="flex gap-1">
              {(['offen', 'meine', 'alle'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === f ? 'border-zs-blue bg-blue-50 text-zs-blue' : 'border-slate-300 text-slate-600'}`}
                >
                  {f === 'offen' ? 'Offen' : f === 'meine' ? 'Meine' : 'Alle'}
                </button>
              ))}
            </div>
          }
        >
          {people.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
              <input
                className="input min-w-[14rem] flex-1 py-1 text-sm"
                placeholder="Neue Pendenz / Auftrag (Enter)"
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
              <select className="input !w-auto py-1 text-sm" value={draft.who ?? ''} onChange={(e) => setDraft({ ...draft, who: Number(e.target.value) || null })} aria-label="Wer">
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === me.id ? `Ich (${p.name})` : `${p.name} · ${p.funktion || ROLE_LABEL[p.role]}${zugName(p.zugId) ? ` · ${zugName(p.zugId)}` : ''}`}
                  </option>
                ))}
              </select>
              <input type="date" className="input !w-auto py-1 text-sm" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} aria-label="Bis wann" />
              <Button variant="primary" className="py-1 text-sm" disabled={!draft.text.trim() || !draft.who} onClick={add}>
                Zuweisen
              </Button>
            </div>
          )}
          {list.length === 0 && <Empty>Keine Pendenzen.</Empty>}
          <PendenzList wk={wk} items={list} rapporte={rapporte.data ?? []} showSource />
        </Card>
        {canViewMilestones(me, wk) && <MilestonesPage detail={detail} embedded />}
      </div>
    </div>
  );
}
