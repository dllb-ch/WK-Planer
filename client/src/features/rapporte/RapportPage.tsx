// Protocol of a Rapport: header, Traktanden with notes and Pendenzen, saved automatically.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Pendenz, Rapport, RapportInput, Traktandum } from '@shared/types';
import { DIETS } from '@shared/types';
import { canCreateRapport, canEditRapport, canViewPersonnel } from '@shared/permissions';
import { fmtDate, fmtTime, parseTime } from '@shared/util';
import { api, ApiError, type WkDetail } from '../../api';
import { Briefkopf, usePrintPage } from '../../components/Briefkopf';
import { useUser } from '../../auth';
import { Button, errMsg, Field, TextArea, useToast } from '../../components/ui';
import { requestLabel } from '../ressourcen/conflicts';
import { PendenzList, useKpPeople } from './Pendenzen';
import { useT } from '../../i18n';

const strip = ({ id: _i, wkId: _w, createdBy: _c, updatedAt: _u, ...rest }: Rapport): RapportInput => rest;

export function RapportPage({ detail }: { detail: WkDetail }) {
  const { t, weekday } = useT();
  const { rid } = useParams();
  const me = useUser();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const id = Number(rid);
  const q = useQuery({ queryKey: ['rapport', wk.id, id], queryFn: () => api.rapport(wk.id, id) });
  const rapporte = useQuery({ queryKey: ['rapporte', wk.id], queryFn: () => api.rapporte(wk.id) });
  const pendenzen = useQuery({ queryKey: ['pendenzen', wk.id], queryFn: () => api.pendenzen(wk.id) });
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const people = useKpPeople(wk.kpId);
  const [f, setF] = useState<RapportInput | null>(null);
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const latest = useRef<RapportInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (q.data && (!f || state === 'saved')) setF(strip(q.data));
    // Only the first load and external changes while nothing is pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const save = async (body: RapportInput) => {
    setState('saving');
    try {
      const saved = await api.updateRapport(wk.id, id, body);
      qc.setQueryData(['rapport', wk.id, id], saved);
      qc.invalidateQueries({ queryKey: ['rapporte', wk.id] });
      if (latest.current === body) {
        latest.current = null;
        setState('saved');
      } else setState('dirty');
    } catch (e) {
      setState('error');
      toast(errMsg(e), 'error');
    }
  };
  const set = (patch: Partial<RapportInput>) => {
    if (!f) return;
    const next = { ...f, ...patch };
    setF(next);
    latest.current = next;
    setState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 800);
  };
  useEffect(() => {
    if (state !== 'dirty' && state !== 'saving') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);
  // Save what is pending when leaving the page.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (latest.current) api.updateRapport(wk.id, id, latest.current).catch(() => {});
    },
    [wk.id, id],
  );

  if (q.error) return <div className="p-6 text-slate-600">{q.error instanceof ApiError && q.error.status === 404 ? t('rap.notFound') : errMsg(q.error)}</div>;
  if (!f || !q.data) return <div className="p-6 text-slate-500">{t('common.loading')}</div>;

  const rap = q.data;
  const editable = canEditRapport(me, wk, rap);
  const closed = f.status === 'ABGESCHLOSSEN';
  const writable = editable && !closed;
  const mine = (pendenzen.data ?? []).filter((p) => p.rapportId === rap.id);
  // Open Pendenzen of earlier Rapporte (same Zug, or all for the Kp) – reviewed under «Stand».
  const earlier = (pendenzen.data ?? []).filter(
    (p) => p.rapportId !== rap.id && !p.done && (rap.zugId === null || p.zugId === rap.zugId) && (rapporte.data ?? []).some((r) => r.id === p.rapportId && r.date <= rap.date),
  );
  const zugName = rap.zugId === null ? t('common.kompanie') : (zuege.find((z) => z.id === rap.zugId)?.name ?? '');
  const name = (uid: number | null) => people.find((p) => p.id === uid)?.name ?? '';

  const setT = (i: number, patch: Partial<Traktandum>) => set({ traktanden: f.traktanden.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const move = (i: number, d: -1 | 1) => {
    const t = [...f.traktanden];
    [t[i], t[i + d]] = [t[i + d], t[i]];
    set({ traktanden: t });
  };
  const addT = () => set({ traktanden: [...f.traktanden, { key: `t${Date.now().toString(36)}`, title: t('rap.newTraktandum'), hint: '', notes: '' }] });
  const removeT = (i: number) => {
    const x = f.traktanden[i];
    if (mine.some((p) => p.traktandumKey === x.key)) return toast(t('rap.traktandumHasPendenzen'), 'error');
    if ((!x.notes.trim() || confirm(t('rap.confirmRemoveT', { title: x.title }))) && true) set({ traktanden: f.traktanden.filter((_, j) => j !== i) });
  };

  const followUp = async () => {
    try {
      const r = await api.createRapport(wk.id, { zugId: rap.zugId, fromRapportId: rap.id, title: rap.title, date: rap.date });
      nav(`../rapporte/${r.id}`);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const remove = async () => {
    if (!confirm(t('rap.confirmDelete'))) return;
    try {
      latest.current = null;
      clearTimeout(timer.current);
      await api.deleteRapport(wk.id, id);
      qc.invalidateQueries({ queryKey: ['rapporte', wk.id] });
      nav('../rapporte');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="print-flow min-h-0 flex-1 overflow-y-auto">
      <div className="no-print mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="../rapporte" className="text-sm text-slate-500 hover:text-zs-blue">
            ← Rapporte
          </Link>
          <span className="flex-1" />
          <span className="text-xs text-slate-500">
            {state !== 'saved' || editable ? t(`save.${state}`) : t('ueb.readOnly')}
          </span>
          <Button onClick={() => window.print()}>{t('av.printPdf')}</Button>
          {canCreateRapport(me, wk, rap.zugId) && <Button onClick={followUp}>{t('rap.followUp')}</Button>}
          {editable && (
            <Button variant={closed ? 'secondary' : 'primary'} onClick={() => set({ status: closed ? 'OFFEN' : 'ABGESCHLOSSEN' })}>
              {closed ? t('wk.reopen') : t('rap.close')}
            </Button>
          )}
        </div>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">
            {t(`rap.schema.${f.schema}.label`)} · {zugName}
            {closed && <span className="ml-2 rounded bg-emerald-100 px-1.5 text-emerald-800">abgeschlossen</span>}
          </div>
          <input
            className="input text-lg font-semibold"
            value={f.title}
            disabled={!writable}
            onChange={(e) => set({ title: e.target.value })}
            aria-label={t('common.title')}
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label={t('common.date')}>
              <input type="date" className="input" value={f.date} disabled={!writable} onChange={(e) => e.target.value && set({ date: e.target.value })} />
            </Field>
            <Field label={t('common.time')}>
              <input
                type="time"
                className="input"
                disabled={!writable}
                value={f.startMin === null ? '' : fmtTime(f.startMin)}
                onChange={(e) => set({ startMin: e.target.value ? parseTime(e.target.value) : null })}
              />
            </Field>
            <Field label={t('rap.ort')} className="sm:col-span-2">
              <input className="input" value={f.ort} disabled={!writable} onChange={(e) => set({ ort: e.target.value })} />
            </Field>
            {(['leitungUserId', 'protokollUserId'] as const).map((k) => (
              <Field key={k} label={k === 'leitungUserId' ? t('rap.leitung') : t('rap.protokoll')} className="sm:col-span-2">
                <select className="input" value={f[k] ?? ''} disabled={!writable} onChange={(e) => set({ [k]: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">–</option>
                  {people.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.funktion || t(`role.${u.role}`)})
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div>
            <span className="label">{t('rap.participants')}</span>
            <div className="flex flex-wrap gap-1.5">
              {people
                .filter((u) => writable || f.teilnehmerIds.includes(u.id))
                .filter((u) => rap.zugId === null || u.zugId === rap.zugId || u.role === 'KPKDT' || f.teilnehmerIds.includes(u.id))
                .map((u) => {
                  const on = f.teilnehmerIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={!writable}
                      aria-pressed={on}
                      onClick={() => set({ teilnehmerIds: on ? f.teilnehmerIds.filter((x) => x !== u.id) : [...f.teilnehmerIds, u.id] })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                      {on ? '✓ ' : ''}
                      {u.name}
                      <span className={on ? 'text-blue-100' : 'text-slate-400'}> · {u.funktion || t(`role.${u.role}`)}</span>
                    </button>
                  );
                })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('rap.absent')}>
              <input className="input" value={f.abwesend} disabled={!writable} onChange={(e) => set({ abwesend: e.target.value })} />
            </Field>
            <Field label={t('rap.guests')}>
              <input className="input" value={f.gaeste} disabled={!writable} onChange={(e) => set({ gaeste: e.target.value })} />
            </Field>
          </div>
        </section>

        <ol className="space-y-3">
          {f.traktanden.map((tk, i) => (
            <li key={tk.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zs-blue text-xs font-semibold text-white">{i + 1}</span>
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 font-semibold focus:ring-0 disabled:text-slate-900"
                  value={tk.title}
                  disabled={!writable}
                  onChange={(e) => setT(i, { title: e.target.value })}
                  aria-label={t('rap.traktandum')}
                />
                {writable && (
                  <span className="flex gap-0.5 text-slate-400">
                    <button disabled={i === 0} onClick={() => move(i, -1)} className="px-1 hover:text-zs-blue disabled:opacity-30" aria-label={t('tpl.up')}>
                      ↑
                    </button>
                    <button disabled={i === f.traktanden.length - 1} onClick={() => move(i, 1)} className="px-1 hover:text-zs-blue disabled:opacity-30" aria-label={t('tpl.down')}>
                      ↓
                    </button>
                    <button onClick={() => removeT(i)} className="px-1 hover:text-red-600" aria-label={t('common.remove')}>
                      ✕
                    </button>
                  </span>
                )}
              </div>
              {tk.hint && <p className="ml-8 text-xs text-slate-500">{tk.hint}</p>}
              <div className="ml-8 mt-2 space-y-2">
                <Facts detail={detail} rap={rap} t={tk} earlier={earlier} />
                <TextArea
                  rows={Math.min(14, Math.max(2, tk.notes.split('\n').length + 1))}
                  value={tk.notes}
                  disabled={!writable}
                  placeholder={writable ? t('rap.notes') : ''}
                  onChange={(e) => setT(i, { notes: e.target.value })}
                />
                <PendenzList
                  wk={wk}
                  items={mine.filter((p) => p.traktandumKey === tk.key)}
                  rapporte={rapporte.data ?? [rap]}
                  newFor={writable ? { rapportId: rap.id, traktandumKey: tk.key, zugId: rap.zugId } : undefined}
                />
              </div>
            </li>
          ))}
        </ol>
        {writable && (
          <div className="flex justify-between">
            <Button onClick={addT}>{t('rap.addT')}</Button>
            <Button variant="ghost" className="text-red-700" onClick={remove}>
              {t('rap.delete')}
            </Button>
          </div>
        )}
      </div>

      <PrintProtocol
        detail={detail}
        f={f}
        zugName={zugName}
        region={org.data?.bataillon?.regionName ?? ''}
        name={name}
        pendenzen={mine}
      />
    </div>
  );
}

/** Data from the planner for some Traktanden: open Pendenzen, presence, meals, transports of the day. */
function Facts({ detail, rap, t, earlier }: { detail: WkDetail; rap: Rapport; t: Traktandum; earlier: Pendenz[] }) {
  const { t: tr } = useT();
  const me = useUser();
  const { wk } = detail;
  const personnel = canViewPersonnel(me, wk) && (t.key === 'stand' || t.key === 'logistik');
  const checkins = useQuery({ queryKey: ['checkins', wk.id], queryFn: () => api.checkins(wk.id), enabled: personnel });
  const strength = useQuery({ queryKey: ['strength', wk.id], queryFn: () => api.strength(wk.id), enabled: t.key === 'stand' });
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id), enabled: t.key === 'logistik' });
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId), enabled: t.key === 'logistik' });
  const rapporte = useQuery({ queryKey: ['rapporte', wk.id], queryFn: () => api.rapporte(wk.id) });
  const ofDay = (checkins.data ?? []).filter((c) => c.date === rap.date && (rap.zugId === null || c.zugId === rap.zugId));
  const planned = (strength.data ?? []).filter((s) => s.date === rap.date && (rap.zugId === null || s.zugId === rap.zugId)).reduce((a, s) => a + s.planned, 0);
  const box = 'rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 no-print';

  if (t.key === 'stand') {
    return (
      <>
        {earlier.length > 0 && (
          <div className={box}>
            <div className="mb-1 font-medium">{tr('rap.openEarlier')}</div>
            <PendenzList wk={wk} items={earlier} rapporte={rapporte.data ?? []} showSource />
          </div>
        )}
        {personnel && (planned > 0 || ofDay.length > 0) && (
          <div className={box}>
            {tr('rap.personnel', { date: fmtDate(rap.date), n: ofDay.length })}{planned > 0 && tr('rap.ofPlanned', { n: planned })} ·{' '}
            <Link className="text-zs-blue hover:underline" to="../personal">
              {tr('pers.tab.praesenz')}
            </Link>
          </div>
        )}
      </>
    );
  }
  if (t.key === 'logistik') {
    const transports = (requests.data ?? []).filter(
      (q) => q.date === rap.date && q.status === 'BEWILLIGT' && (q.kind === 'FAHRZEUG' || q.kind === 'ANHAENGER') && (rap.zugId === null || q.zugId === rap.zugId),
    );
    const meals = DIETS
      .map((d) => [d, ofDay.filter((c) => c.diet === d).length] as const)
      .filter(([, n]) => n > 0);
    const special = ofDay.filter((c) => c.intolerances.trim());
    if (!transports.length && !meals.length) return null;
    return (
      <div className={`${box} space-y-0.5`}>
        {meals.length > 0 && (
          <div>
            {tr('rap.food', { list: meals.map(([d, n]) => `${n} ${tr(`diet.${d}`)}`).join(', ') })}
            {special.length > 0 && tr('rap.intol', { list: special.map((c) => `${c.vorname} ${c.nachname} (${c.intolerances})`).join(', ') })}
          </div>
        )}
        {transports.length > 0 && (
          <div>
            {tr('rap.transports')}{' '}
            {transports
              .map((q) => `${fmtTime(q.startMin)}–${fmtTime(q.endMin)} ${requestLabel(q, resources.data ?? [])}${q.zweck ? ` (${q.zweck})` : ''}`)
              .join(' · ')}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function PrintProtocol({
  detail,
  f,
  zugName,
  region,
  name,
  pendenzen,
}: {
  detail: WkDetail;
  f: RapportInput;
  zugName: string;
  region: string;
  name: (id: number | null) => string;
  pendenzen: Pendenz[];
}) {
  const { t, weekday } = useT();
  const people = useKpPeople(detail.wk.kpId);
  const teilnehmer = people.filter((p) => f.teilnehmerIds.includes(p.id)).map((p) => p.name);
  const nr = new Map(pendenzen.map((p, i) => [p.id, i + 1]));
  usePrintPage([t('rap.protocolDoc'), f.title, zugName, detail.wk.title].filter(Boolean).join(' · '));
  void region;
  return (
    <div className="print-only text-[10pt] leading-snug" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <Briefkopf title={`Protokoll – ${f.title}`} subtitle={[zugName, detail.wk.title].filter(Boolean).join(' · ')} />
      <table className="mt-2 w-full text-[9pt]">
        <tbody>
          <tr>
            <td className="w-32 align-top font-semibold">{t('rap.dateTimePlace')}</td>
            <td>
              {weekday(f.date)}, {fmtDate(f.date)}
              {f.startMin !== null && `, ${fmtTime(f.startMin)}`}
              {f.ort && `, ${f.ort}`}
            </td>
          </tr>
          <tr>
            <td className="align-top font-semibold">{t('rap.leitungProtokoll')}</td>
            <td>
              {name(f.leitungUserId) || '–'} / {name(f.protokollUserId) || '–'}
            </td>
          </tr>
          <tr>
            <td className="align-top font-semibold">{t('rap.participants')}</td>
            <td>{teilnehmer.join(', ') || '–'}</td>
          </tr>
          {f.abwesend && (
            <tr>
              <td className="align-top font-semibold">{t('rap.absentShort')}</td>
              <td>{f.abwesend}</td>
            </tr>
          )}
          {f.gaeste && (
            <tr>
              <td className="align-top font-semibold">{t('rap.guestsShort')}</td>
              <td>{f.gaeste}</td>
            </tr>
          )}
        </tbody>
      </table>
      {f.traktanden.map((tk, i) => {
        const ps = pendenzen.filter((p) => p.traktandumKey === tk.key);
        return (
          <section key={tk.key} className="mt-3 break-inside-avoid">
            <h2 className="border-b border-slate-400 text-[11pt] font-semibold">
              {i + 1}. {tk.title}
            </h2>
            {tk.notes ? <p className="mt-1 whitespace-pre-wrap">{tk.notes}</p> : <p className="mt-1 text-slate-500">–</p>}
            {ps.length > 0 && (
              <ul className="mt-1">
                {ps.map((p) => (
                  <li key={p.id}>
                    → <b>P{nr.get(p.id)}</b> {p.text} ({p.responsibleName || 'offen'}
                    {p.dueDate && `, bis ${fmtDate(p.dueDate)}`})
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {pendenzen.length > 0 && (
        <section className="mt-4 break-inside-avoid">
          <h2 className="text-[11pt] font-semibold">{t('rap.pendenzList')}</h2>
          <table className="mt-1 w-full border-collapse text-[9pt]">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="w-10 py-0.5">{t('rap.nr')}</th>
                <th>{t('res.what')}</th>
                <th className="w-36">{t('rap.who')}</th>
                <th className="w-24">{t('rap.until')}</th>
                <th className="w-20">{t('rap.done')}</th>
              </tr>
            </thead>
            <tbody>
              {pendenzen.map((p) => (
                <tr key={p.id} className="border-b border-slate-300 align-top">
                  <td className="py-0.5">P{nr.get(p.id)}</td>
                  <td>{p.text}</td>
                  <td>{p.responsibleName}</td>
                  <td>{p.dueDate ? fmtDate(p.dueDate) : ''}</td>
                  <td>{p.done ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
