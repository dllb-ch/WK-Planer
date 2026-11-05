import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { canArchiveWk, canCreateWk } from '@shared/permissions';
import { fmtDate, fmtTime, parseTime } from '@shared/util';
import { useT } from '../i18n';
import { api, type WkSummary } from '../api';
import { useUser } from '../auth';
import { Button, Card, Empty, errMsg, Field, Modal, StatusBadge, useToast } from '../components/ui';
import { KaderOverview, KpKdtOverview, ZfhrOverview } from './RoleOverview';

const today = () => new Date().toISOString().slice(0, 10);

export function DashboardPage() {
  const me = useUser();
  const { t } = useT();
  const wks = useQuery({ queryKey: ['wks'], queryFn: api.wks });
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [creating, setCreating] = useState(false);
  const all = wks.data ?? [];
  const list = all.filter((w) => !w.archived);
  const archived = all.filter((w) => w.archived);
  const kpName = org.data?.kompanien.find((k) => k.id === me.kpId)?.name;
  const zugName = org.data?.zuege.find((z) => z.id === me.zugId)?.name;
  const upcoming = list.filter((w) => w.endDate >= today()).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = list.filter((w) => w.endDate < today());


  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 overflow-y-auto p-3 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('dash.hello', { name: me.name })}</h1>
          <p className="text-sm text-slate-500">
            {t(`role.${me.role}`)}
            {kpName && ` · ${kpName}`}
            {zugName && ` · ${zugName}`}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{t(`dash.intro.${me.role}`)}</p>
        </div>
        {canCreateWk(me) && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('dash.newWk')}
          </Button>
        )}
      </div>

      {me.role === 'BAT' && <BatOverview list={list} />}
      {me.role === 'BAT' && list.some((w) => w.status === 'EINGEREICHT') && (
        <Card title={t('dash.toApprove')}>
          <ul className="divide-y">
            {list
              .filter((w) => w.status === 'EINGEREICHT')
              .map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <b>{w.kpName}</b> – {w.title}
                  </span>
                  <Link className="text-zs-blue hover:underline" to={`/wk/${w.id}`}>
                    {t('dash.review')}
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {wks.isSuccess && me.role === 'KADER' && <KaderOverview wk={upcoming[0]} />}
      {wks.isSuccess && me.role === 'ZFHR' && <ZfhrOverview wk={upcoming[0]} />}
      {wks.isSuccess && (me.role === 'KPKDT' || me.role === 'LOGOF') && <KpKdtOverview wk={upcoming[0]} />}
      {(me.role === 'KADER' || me.role === 'ZFHR') && upcoming[0] && <MyNext wk={upcoming[0]} zugId={me.zugId} />}

      <Card title={t('dash.wks')} actions={<ArchivePast past={past} />}>
        {wks.isLoading ? <Empty>{t('common.loading')}</Empty> : list.length === 0 ? <Empty>{t('dash.noWks')}</Empty> : <WkTable list={[...upcoming, ...past]} />}
      </Card>

      {archived.length > 0 && (
        <Card title={t('dash.archive', { n: archived.length })}>
          <details>
            <summary className="cursor-pointer text-sm text-zs-blue">{t('dash.showArchived')}</summary>
            <div className="mt-2">
              <WkTable list={archived} />
            </div>
          </details>
        </Card>
      )}

      {creating && <CreateWkDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function BatOverview({ list }: { list: WkSummary[] }) {
  const { t } = useT();
  const counts = (s: WkSummary['status']) => list.filter((w) => w.status === s).length;
  const tiles = [
    { label: t('dash.tile.total'), value: list.length },
    { label: t('status.ENTWURF'), value: counts('ENTWURF') + counts('ZURUECKGEWIESEN') },
    { label: t('status.EINGEREICHT'), value: counts('EINGEREICHT') },
    { label: t('status.FREIGEGEBEN'), value: counts('FREIGEGEBEN') },
    { label: t('dash.tile.prepOverdue'), value: list.reduce((n, w) => n + w.overdueMilestones, 0) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map((x) => (
        <div key={x.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-2xl font-semibold tabular-nums">{x.value}</div>
          <div className="text-xs text-slate-500">{x.label}</div>
        </div>
      ))}
    </div>
  );
}

function WkTable({ list }: { list: WkSummary[] }) {
  const me = useUser();
  const { t } = useT();
  const ops = useWkOps();
  const actions = list.some((w) => canArchiveWk(me, w));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3">{t('dash.col.wk')}</th>
            <th className="py-2 pr-3 max-sm:hidden">{t('common.kompanie')}</th>
            <th className="py-2 pr-3">{t('common.date')}</th>
            <th className="py-2 pr-3">{t('common.status')}</th>
            <th className="py-2 pr-3 text-right max-sm:hidden">{t('dash.col.blocks')}</th>
            <th className="py-2 text-right">{t('dash.col.prepOpen')}</th>
            {actions && <th className="py-2 pl-3" />}
          </tr>
        </thead>
        <tbody>
          {list.map((w) => (
            <tr key={w.id} className={`border-t border-slate-100 ${w.endDate < today() ? 'text-slate-400' : ''}`}>
              <td className="py-2 pr-3">
                <Link to={`/wk/${w.id}${me.role === 'ZFHR' || me.role === 'KADER' ? '/zug' : ''}`} className="font-medium text-zs-blue hover:underline">
                  {w.title}
                </Link>
              </td>
              <td className="py-2 pr-3 max-sm:hidden">{w.kpName}</td>
              <td className="py-2 pr-3 sm:whitespace-nowrap">
                {fmtDate(w.startDate)} – {fmtDate(w.endDate)}
              </td>
              <td className="py-2 pr-3">
                <StatusBadge status={w.status} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums max-sm:hidden">{w.blockCount}</td>
              <td className="py-2 text-right tabular-nums">
                <Link to={`/wk/${w.id}/meilensteine`} className="hover:underline">
                  {w.openMilestones}
                  {w.overdueMilestones > 0 && <span className="ml-1 text-red-600">({t('common.overdue', { n: w.overdueMilestones })})</span>}
                </Link>
              </td>
              {actions && (
                <td className="whitespace-nowrap py-2 pl-3 text-right">
                  {canArchiveWk(me, w) && (
                    <>
                      <Button variant="ghost" className="!px-2 !py-0.5 text-xs" onClick={() => ops.archive([w], !w.archived)}>
                        {w.archived ? t('dash.restore') : t('dash.archiveOne')}
                      </Button>
                      <Button variant="ghost" className="!px-2 !py-0.5 text-xs !text-red-600" onClick={() => ops.remove(w)}>
                        {t('common.delete')}
                      </Button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Archive / restore and delete WKs (Bat Kdo). */
function useWkOps() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useT();
  const refresh = () => qc.invalidateQueries({ queryKey: ['wks'] });
  return {
    archive: async (list: WkSummary[], archived: boolean) => {
      try {
        for (const w of list) await api.archiveWk(w.id, archived);
        toast(list.length === 1 ? t(archived ? 'dash.archived' : 'dash.restored', { title: list[0].title }) : t('dash.archivedN', { n: list.length }));
      } catch (e) {
        toast(errMsg(e), 'error');
      }
      await refresh();
    },
    remove: async (w: WkSummary) => {
      if (!confirm(t('dash.confirmDelete', { title: w.title, kp: w.kpName }))) return;
      try {
        await api.deleteWk(w.id);
        toast(t('dash.deleted', { title: w.title }));
      } catch (e) {
        toast(errMsg(e), 'error');
      }
      await refresh();
    },
  };
}

/** «Vergangene archivieren»: all finished WKs at once. */
function ArchivePast({ past }: { past: WkSummary[] }) {
  const me = useUser();
  const { t } = useT();
  const ops = useWkOps();
  const mine = past.filter((w) => canArchiveWk(me, w));
  if (mine.length === 0) return null;
  return (
    <Button
      variant="ghost"
      className="!py-0.5 text-xs"
      onClick={() => confirm(t('dash.confirmArchivePast', { n: mine.length })) && ops.archive(mine, true)}
    >
      {t('dash.archivePast', { n: mine.length })}
    </Button>
  );
}

/** Next WK programme of the own Zug (Zfhr and Kader). */
function MyNext({ wk, zugId }: { wk: WkSummary; zugId: number | null }) {
  const detail = useQuery({ queryKey: ['wk', wk.id], queryFn: () => api.wk(wk.id) });
  const { t, weekday } = useT();
  if (!detail.data || !zugId) return null;
  const blocks = detail.data.blocks.filter((b) => b.zugIds.includes(zugId)).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const firstDay = blocks[0]?.date;
  const locs = detail.data.locations;
  return (
    <Card
      title={t('dash.myNext', { title: wk.title })}
      actions={
        <Link className="text-sm text-zs-blue hover:underline" to={`/wk/${wk.id}/zug`}>
          {t('dash.zugView')}
        </Link>
      }
    >
      {blocks.length === 0 ? (
        <Empty>{t('dash.noEntries')}</Empty>
      ) : (
        <>
          <p className="mb-2 text-sm font-medium">
            {weekday(firstDay)}, {fmtDate(firstDay)}
          </p>
          <ul className="space-y-1 text-sm">
            {blocks
              .filter((b) => b.date === firstDay)
              .map((b) => (
                <li key={b.id} className="flex gap-3">
                  <span className="w-24 shrink-0 tabular-nums text-slate-500">
                    {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                  </span>
                  <span>
                    {b.title}
                    {b.locationId && <span className="text-slate-500"> · {locs.find((l) => l.id === b.locationId)?.name}</span>}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function CreateWkDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useT();
  const nav = useNavigate();
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [f, setF] = useState({ kpId: 0, title: '', startDate: '', endDate: '', dayStart: '07:30', dayEnd: '17:00', snapMin: 15 });
  const create = useMutation({
    mutationFn: () => api.createWk({ ...f, dayStart: parseTime(f.dayStart), dayEnd: parseTime(f.dayEnd) }),
    onSuccess: (wk) => {
      qc.invalidateQueries({ queryKey: ['wks'] });
      nav(`/wk/${wk.id}`);
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const valid = f.kpId && f.title && f.startDate && f.endDate && f.endDate >= f.startDate;
  return (
    <Modal
      title={t('dash.createTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <Field label={t('common.kompanie')}>
        <select className="input" value={f.kpId} onChange={(e) => setF({ ...f, kpId: Number(e.target.value) })}>
          <option value={0}>{t('common.choose')}</option>
          {org.data?.kompanien.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('dash.designation')}>
        <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('dash.designationPh')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('dash.firstDay')}>
          <input type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate || e.target.value })} />
        </Field>
        <Field label={t('dash.lastDay')}>
          <input type="date" className="input" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </Field>
        <Field label={t('dash.dayStart')}>
          <input type="time" className="input" value={f.dayStart} onChange={(e) => setF({ ...f, dayStart: e.target.value })} />
        </Field>
        <Field label={t('dash.dayEnd')}>
          <input type="time" className="input" value={f.dayEnd} onChange={(e) => setF({ ...f, dayEnd: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        {t('dash.autoPlan')}
      </p>
    </Modal>
  );
}
