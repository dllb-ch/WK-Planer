// Start page per role: what Kader, Zugführer and Kp Kdt need to look at next for the upcoming WK.
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Milestone, Role } from '@shared/types';
import { KDO_ID, PLANNING_ROLES } from '@shared/types';
import { fmtDate, fmtTime, wkDays } from '@shared/util';
import { canViewPersonnel } from '@shared/permissions';
import { api, type WkSummary } from '../api';
import { useUser } from '../auth';
import { Card, Empty, StatusBadge } from '../components/ui';
import { AusbildungCard } from './AusbildungenPage';
import { useT } from '../i18n';

const today = () => new Date().toISOString().slice(0, 10);
const TRAINING = ['AUSBILDUNG', 'UEBUNG'];

const doneByMe = (m: Milestone, id: number) => m.doneBy.some((d) => d.userId === id);
const complete = (m: Milestone) => m.responsible.length > 0 && m.responsible.every((p) => m.doneBy.some((d) => d.userId === p.userId));

/** Open Pendenzen from Rapporten assigned to me. */
function MyPendenzen({ wk }: { wk: WkSummary }) {
  const { t } = useT();
  const me = useUser();
  const q = useQuery({ queryKey: ['pendenzen', wk.id], queryFn: () => api.pendenzen(wk.id) });
  const open = (q.data ?? []).filter((p) => p.responsibleUserId === me.id && !p.done);
  if (!open.length) return null;
  return (
    <Card
      title={t('ov.myPendenzen', { n: open.length })}
      actions={
        <Link className="text-sm text-zs-blue hover:underline" to={`/wk/${wk.id}/pendenzen`}>
          {t('ov.allPendenzen')}
        </Link>
      }
    >
      <ul className="space-y-1 text-sm">
        {open.slice(0, 6).map((p) => (
          <li key={p.id} className="flex gap-3">
            <span className={`w-20 shrink-0 tabular-nums ${p.dueDate && p.dueDate < today() ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
              {p.dueDate ? fmtDate(p.dueDate) : '–'}
            </span>
            <span>{p.text}</span>
          </li>
        ))}
        {open.length > 6 && <li className="text-xs text-slate-500">{t('ov.more', { n: open.length - 6 })}</li>}
      </ul>
    </Card>
  );
}

function MyTasks({ wk }: { wk: WkSummary }) {
  const { t } = useT();
  const me = useUser();
  const q = useQuery({ queryKey: ['milestones', wk.id], queryFn: () => api.milestones(wk.id) });
  const open = (q.data ?? []).filter((m) => m.ownerRole === me.role && !doneByMe(m, me.id));
  return (
    <Card
      title={t('ov.myTasks')}
      actions={
        <Link className="text-sm text-zs-blue hover:underline" to={`/wk/${wk.id}/meilensteine`}>
          {t('ov.all')}
        </Link>
      }
    >
      {open.length === 0 ? (
        <Empty>{t('ov.allDone')}</Empty>
      ) : (
        <ul className="space-y-1 text-sm">
          {open.slice(0, 5).map((m) => (
            <li key={m.id} className="flex gap-3">
              <span className={`w-20 shrink-0 tabular-nums ${m.dueDate < today() ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{fmtDate(m.dueDate)}</span>
              <span>{m.title}</span>
            </li>
          ))}
          {open.length > 5 && <li className="text-xs text-slate-500">{t('ov.more', { n: open.length - 5 })}</li>}
        </ul>
      )}
    </Card>
  );
}

/**
 * Planned and present people per Zug for today (or the first WK day before the WK).
 * Kp Kdt sees all Züge, Zfhr the own one.
 */
export function PersonnelOverview({ wk }: { wk: WkSummary }) {
  const { t, weekday } = useT();
  const me = useUser();
  const detail = useQuery({ queryKey: ['wk', wk.id], queryFn: () => api.wk(wk.id) });
  const strength = useQuery({ queryKey: ['strength', wk.id], queryFn: () => api.strength(wk.id) });
  const allowed = !!detail.data && canViewPersonnel(me, detail.data.wk);
  const participants = useQuery({ queryKey: ['participants', wk.id], queryFn: () => api.participants(wk.id), enabled: allowed });
  const checkins = useQuery({ queryKey: ['checkins', wk.id], queryFn: () => api.checkins(wk.id), enabled: allowed, refetchInterval: 30_000 });
  if (!detail.data || !allowed) return null;
  const days = wkDays(detail.data.wk);
  const now = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(new Date());
  // Before the WK: its first day (not the KVK).
  const date = days.includes(now) ? now : now < days[0] ? (days.find((d) => d >= wk.startDate) ?? days[0]) : days[days.length - 1];
  const running = days.includes(now);
  const zuege = detail.data.zuege.filter((z) => me.role !== 'ZFHR' || z.id === me.zugId);
  const planned = (zugId: number) => strength.data?.find((s) => s.zugId === zugId && s.date === date)?.planned ?? 0;
  const ofDay = (checkins.data ?? []).filter((c) => c.date === date);
  const present = new Set(ofDay.map((c) => c.participantId).filter((x): x is number => x !== null));
  const listed = (participants.data ?? []).filter((p) => p.days.length === 0 || p.days.includes(date));
  const rows = [
    ...(me.role !== 'ZFHR' && planned(KDO_ID) > 0 ? [{ id: KDO_ID, name: t('kdo') }] : []),
    ...zuege,
  ].map((z) => {
    const list = listed.filter((p) => p.zugId === z.id);
    return { ...z, planned: planned(z.id), list: list.length, present: list.filter((p) => present.has(p.id)).length };
  });
  const sum = (k: 'planned' | 'list' | 'present') => rows.reduce((a, r) => a + r[k], 0);
  const unmatched = ofDay.filter((c) => c.participantId === null).length;
  return (
    <Card
      title={t(running ? 'ov.personnelToday' : 'ov.personnel', { day: `${weekday(date)}, ${fmtDate(date)}` })}
      actions={
        <Link className="text-sm text-zs-blue hover:underline" to={`/wk/${wk.id}/personal`}>
          {t('ov.praesenz')}
        </Link>
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-1 pr-2">{t('common.zug')}</th>
            <th className="py-1 pr-2 text-right">{t('ov.planned')}</th>
            <th className="py-1 pr-2 text-right">{t('ov.onList')}</th>
            <th className="py-1 pr-2 text-right">{t('pres.present')}</th>
            <th className="w-1/3 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const target = r.planned || r.list;
            return (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap py-1 pr-2">{r.name}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.planned || '–'}</td>
                <td className={`py-1 pr-2 text-right tabular-nums ${r.planned && r.list < r.planned ? 'text-amber-700' : ''}`}>{r.list || '–'}</td>
                <td className="py-1 pr-2 text-right font-semibold tabular-nums">{r.present}</td>
                <td className="py-1">
                  <span className="block h-1.5 overflow-hidden rounded bg-slate-200">
                    <span className="block h-full bg-emerald-500" style={{ width: `${target ? Math.min(100, (r.present / target) * 100) : 0}%` }} />
                  </span>
                </td>
              </tr>
            );
          })}
          {rows.length > 1 && (
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-1 pr-2">{t('yp.total')}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{sum('planned')}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{sum('list')}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{sum('present')}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      {unmatched > 0 && me.role === 'KPKDT' && (
        <Link to={`/wk/${wk.id}/personal`} className="mt-2 block text-xs font-medium text-amber-700 hover:underline">
          {unmatched > 1 ? t('ov.unmatched', { n: unmatched }) : t('ov.unmatchedOne')}
        </Link>
      )}
      {!running && <p className="mt-2 text-xs text-slate-500">{t('ov.notStarted')}</p>}
    </Card>
  );
}

/** Kader: the lessons I lead come first. */
export function KaderOverview({ wk }: { wk: WkSummary | undefined }) {
  const { t } = useT();
  const q = useQuery({ queryKey: ['my-ausbildungen'], queryFn: api.myAusbildungen });
  const next = (q.data ?? []).filter((x) => x.mine && (!x.av.datum || x.av.datum >= today()));
  return (
    <>
      <Card
        title={t('ov.myTraining')}
        actions={
          <Link className="text-sm text-zs-blue hover:underline" to="/ausbildungen">
            {t('ov.all')}
          </Link>
        }
      >
        {next.length === 0 ? (
          <Empty>{t('ov.noTraining')}</Empty>
        ) : (
          <div className="space-y-2">
            {next.slice(0, 5).map((x) => (
              <AusbildungCard key={x.av.id} x={x} compact />
            ))}
          </div>
        )}
      </Card>
      {wk && <MyPendenzen wk={wk} />}
      {wk && <MyTasks wk={wk} />}
    </>
  );
}

/** Zugführer: preparation of the own Zug – which training slots still lack an Ausbildungsvorbereitung, requests, tasks. */
export function ZfhrOverview({ wk }: { wk: WkSummary | undefined }) {
  const { t, weekdayShort } = useT();
  const me = useUser();
  const detail = useQuery({ queryKey: ['wk', wk?.id], queryFn: () => api.wk(wk!.id), enabled: !!wk });
  const avs = useQuery({ queryKey: ['avs', wk?.id], queryFn: () => api.avs(wk!.id), enabled: !!wk });
  const requests = useQuery({ queryKey: ['requests', wk?.id], queryFn: () => api.requests(wk!.id), enabled: !!wk });
  if (!wk || !me.zugId) return <KaderOverview wk={wk} />;
  const slots = (detail.data?.blocks ?? [])
    .filter((b) => b.zugIds.includes(me.zugId!) && TRAINING.includes(b.type))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const avsOf = (blockId: number) => (avs.data ?? []).filter((a) => a.blockId === blockId && a.zugId === me.zugId);
  const missing = slots.filter((b) => avsOf(b.id).length === 0).length;
  const own = (requests.data ?? []).filter((r) => r.zugId === me.zugId);
  const count = (s: string) => own.filter((r) => r.status === s).length;
  return (
    <>
      <Card
        title={t('ov.zugPreps', { ready: slots.length - missing, total: slots.length })}
        actions={
          <Link className="text-sm text-zs-blue hover:underline" to={`/wk/${wk.id}/zug`}>
            {t('dash.zugView')}
          </Link>
        }
      >
        {slots.length === 0 ? (
          <Empty>{t('ov.noTrainingBlocks')}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {slots.map((b) => {
              const list = avsOf(b.id);
              return (
                <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                  <span className="w-32 shrink-0 tabular-nums text-slate-500">
                    {weekdayShort(b.date)} {fmtDate(b.date).slice(0, 6)} {fmtTime(b.startMin)}
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{b.title}</span>
                  {list.length === 0 ? (
                    <span className="text-xs font-medium text-red-600">{t('ov.noPrep')}</span>
                  ) : (
                    <span className="text-xs text-slate-600">
                      {list.map((a) => (
                        <Link key={a.id} to={`/wk/${wk.id}/av/${a.id}`} className="mr-2 text-zs-blue hover:underline">
                          {a.thema}
                          {a.leiter && ` (${a.leiter})`}
                        </Link>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <PersonnelOverview wk={wk} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title={t('ov.requests')}
          actions={
            <Link className="text-sm text-zs-blue hover:underline" to={`/wk/${wk.id}/ressourcen`}>
              {t('ov.resources')}
            </Link>
          }
        >
          <div className="flex gap-4 text-sm">
            <span>
              <b className="text-lg text-amber-600">{count('BEANTRAGT')}</b> {t('res.requestedLower')}
            </span>
            <span>
              <b className="text-lg text-emerald-600">{count('BEWILLIGT')}</b> {t('res.approvedLower')}
            </span>
            <span>
              <b className="text-lg text-red-600">{count('ABGELEHNT')}</b> {t('request.ABGELEHNT').toLowerCase()}
            </span>
          </div>
        </Card>
        <MyTasks wk={wk} />
      </div>
      <MyPendenzen wk={wk} />
    </>
  );
}

/** Kp Kdt (and Log Of): decisions waiting, preparation by role, Ausbildungsvorbereitungen per Zug. */
export function KpKdtOverview({ wk }: { wk: WkSummary | undefined }) {
  const { t } = useT();
  const me = useUser();
  const detail = useQuery({ queryKey: ['wk', wk?.id], queryFn: () => api.wk(wk!.id), enabled: !!wk });
  const avs = useQuery({ queryKey: ['avs', wk?.id], queryFn: () => api.avs(wk!.id), enabled: !!wk });
  const requests = useQuery({ queryKey: ['requests', wk?.id], queryFn: () => api.requests(wk!.id), enabled: !!wk });
  const milestones = useQuery({ queryKey: ['milestones', wk?.id], queryFn: () => api.milestones(wk!.id), enabled: !!wk && me.role === 'KPKDT' });
  if (!wk) return null;
  const pending = (requests.data ?? []).filter((r) => r.status === 'BEANTRAGT');
  const zuege = detail.data?.zuege ?? [];
  const byRole = (r: Role) => (milestones.data ?? []).filter((m) => m.ownerRole === r);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title={wk.title}>
          <div className="space-y-1 text-sm">
            <div>
              <StatusBadge status={wk.status} /> <span className="text-slate-500">{t('ap.title')}</span>
            </div>
            <div className="text-slate-500">
              {fmtDate(wk.startDate)} – {fmtDate(wk.endDate)}
            </div>
            <Link className="text-zs-blue hover:underline" to={`/wk/${wk.id}`}>
              {t('ov.openAp')}
            </Link>
          </div>
        </Card>
        <Card title={t('ov.toDecide')}>
          <Link to={`/wk/${wk.id}/ressourcen`} className="block hover:underline">
            <b className={`text-2xl ${pending.length ? 'text-amber-600' : 'text-slate-400'}`}>{pending.length}</b>{' '}
            <span className="text-sm">{t('ov.openRequests')}</span>
          </Link>
          {pending.slice(0, 3).map((r) => (
            <div key={r.id} className="truncate text-xs text-slate-500">
              {fmtDate(r.date).slice(0, 6)} · {r.resourceId == null && r.kind !== 'GELAENDE' ? (r.persons ? t('ov.transportShort', { n: r.persons }) : `${r.quantity}× ${r.category}`) : r.zweck}
            </div>
          ))}
        </Card>
        <Card title={t('ov.preps')}>
          <ul className="space-y-1 text-sm">
            {zuege.map((z) => {
              const slots = (detail.data?.blocks ?? []).filter((b) => b.zugIds.includes(z.id) && TRAINING.includes(b.type));
              const ready = slots.filter((b) => (avs.data ?? []).some((a) => a.blockId === b.id && a.zugId === z.id)).length;
              return (
                <li key={z.id} className="flex items-center gap-2">
                  <span className="w-20 truncate">{z.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-slate-200">
                    <span className="block h-full bg-emerald-500" style={{ width: `${slots.length ? (ready / slots.length) * 100 : 0}%` }} />
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                    {ready}/{slots.length}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <PersonnelOverview wk={wk} />
      <MyPendenzen wk={wk} />
      {me.role === 'KPKDT' && (
        <Card
          title={t('ov.prepByRole')}
          actions={
            <Link className="text-sm text-zs-blue hover:underline" to={`/wk/${wk.id}/meilensteine`}>
              {t('ov.details')}
            </Link>
          }
        >
          <ul className="grid gap-2 text-sm sm:grid-cols-5">
            {PLANNING_ROLES.map((r) => {
              const list = byRole(r);
              const done = list.filter(complete).length;
              const overdue = list.filter((m) => !complete(m) && m.dueDate < today()).length;
              return (
                <li key={r} className="rounded-md border border-slate-200 p-2">
                  <div className="text-xs text-slate-500">{t(`role.${r}`)}</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {done}/{list.length}
                  </div>
                  {overdue > 0 && <div className="text-xs font-medium text-red-600">{t('common.overdue', { n: overdue })}</div>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
