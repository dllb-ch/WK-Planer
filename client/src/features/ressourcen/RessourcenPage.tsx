import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Booking, RequestStatus, Resource, ResourceKind, ResourceRequest } from '@shared/types';
import { KDO_ID } from '@shared/types';

const KINDS: ResourceKind[] = ['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE'];
const STATUSES: RequestStatus[] = ['BEANTRAGT', 'BEWILLIGT', 'ABGELEHNT'];
import { canDecideRequest, canEditRequest, canRequestResource } from '@shared/permissions';
import { fmtDate, fmtTime, wkDays } from '@shared/util';

const wd = (d: string) => weekdayShortIn(currentLang(), d);
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, Card, Empty, errMsg, useToast } from '../../components/ui';
import { DaySelector, useDaySelection } from '../../components/DaySelector';
import { SwissMap, type MapShape } from '../../components/SwissMap';
import { columnName, withKdo } from '../arbeitsprogramm/columns';
import { externalClashes, overlapping, requestLabel } from './conflicts';
import { Catalogue, OwnerBadge } from './Catalogue';
import { ResourceTimeline, type TimelineItem, type TimelineRow } from './ResourceTimeline';
import { RequestDialog } from './RequestDialog';
import { DecisionDialog } from './DecisionDialog';
import { useT } from '../../i18n';
import { currentLang, currentT } from '../../lib/lang';
import { weekdayShortIn } from '@shared/i18n';

const STATUS_STYLE: Record<RequestStatus, string> = {
  BEANTRAGT: 'bg-amber-100 text-amber-800',
  BEWILLIGT: 'bg-emerald-100 text-emerald-800',
  ABGELEHNT: 'bg-red-100 text-red-800',
};
export const RequestBadge = ({ status }: { status: RequestStatus }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{currentT(`request.${status}`)}</span>
);

export function RessourcenPage({ detail }: { detail: WkDetail }) {
  const { t, tn } = useT();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id), refetchInterval: 15000 });
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId) });
  const bookings = useQuery({ queryKey: ['bookings', wk.id], queryFn: () => api.bookings(wk.id), refetchInterval: 30000 });
  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('');
  const [view, setView] = useState<'list' | 'plan'>('plan');
  const [kindFilter, setKindFilter] = useState<ResourceKind | ''>('');
  const [dialog, setDialog] = useState<{ existing?: ResourceRequest } | null>(null);
  const [decision, setDecision] = useState<{ q: ResourceRequest; status: RequestStatus } | null>(null);
  const [mapDay, setMapDay] = useState(wkDays(wk).find((d) => !wk.avorDays.includes(d)) ?? wk.startDate);

  const decider = canDecideRequest(me, wk);
  const ownColumn = withKdo(wk.kpId, zuege).find((z) => canRequestResource(me, wk, z.id));
  const all = requests.data ?? [];
  const list = all.filter((q) => (!statusFilter || q.status === statusFilter) && (!kindFilter || q.kind === kindFilter));
  const resName = (q: ResourceRequest) => requestLabel(q, resources.data ?? []);

  const dayShapes: MapShape[] = useMemo(
    () => [
      ...(resources.data ?? [])
        .filter((r) => r.kind === 'GELAENDE' && (r.area || r.points.length))
        .map((r) => ({ area: r.area, points: r.points, color: '#1e3a8a', label: r.name })),
      ...all
        .filter((q) => q.date === mapDay && q.kind === 'GELAENDE' && q.status !== 'ABGELEHNT')
        .map((q): MapShape | null => {
          const area = q.area ?? resources.data?.find((r) => r.id === q.resourceId)?.area;
          return area
            ? {
                area,
                color: q.status === 'BEWILLIGT' ? '#16a34a' : '#ca8a04',
                label: `${columnName(zuege, q.zugId)} ${fmtTime(q.startMin)}–${fmtTime(q.endMin)}: ${q.zweck}`,
              }
            : null;
        })
        .filter((x): x is MapShape => !!x),
    ],
    [resources.data, all, mapDay, zuege],
  );

  const remove = async (q: ResourceRequest) => {
    if (!confirm(t('res.confirmDelete'))) return;
    try {
      await api.deleteRequest(wk.id, q.id);
      qc.invalidateQueries({ queryKey: ['requests', wk.id] });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">{t('res.title')}</h2>
          <div className="flex rounded-md border border-slate-300 p-0.5">
            {(['list', 'plan'] as const).map((v) => (
              <button
                key={v}
                className={`rounded px-2.5 py-1 text-xs font-medium ${view === v ? 'bg-zs-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setView(v)}
              >
                {v === 'list' ? t('ap.list') : t('res.plan')}
              </button>
            ))}
          </div>
          <select className="input !w-auto" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as ResourceKind | '')} aria-label={t('bd.type')}>
            <option value="">{t('res.allKinds')}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`resource.${k}`)}
              </option>
            ))}
          </select>
          <select className="input !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RequestStatus | '')} aria-label={t('common.status')}>
            <option value="">{t('res.allStatus')}</option>
            {STATUSES.map((k) => (
              <option key={k} value={k}>
                {t(`request.${k}`)}
              </option>
            ))}
          </select>
          {ownColumn && (
            <Button variant="primary" onClick={() => setDialog({})}>
              {t('res.addRequest')}
            </Button>
          )}
        </div>

        {view === 'plan' ? (
          <Belegungsplan detail={detail} requests={list} bookings={bookings.data ?? []} resources={resources.data ?? []} kind={kindFilter} onOpen={(q) => canEditRequest(me, wk, q) && setDialog({ existing: q })} />
        ) : (
        <Card title={`Anfragen (${list.length})`}>
          {list.length === 0 ? (
            <Empty>{t('res.none')}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-3">{t('res.when')}</th>
                    <th className="py-1 pr-3">{t('std.for')}</th>
                    <th className="py-1 pr-3">{t('res.what')}</th>
                    <th className="py-1 pr-3">{t('res.zweck')}</th>
                    <th className="py-1 pr-3">{t('common.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((q) => {
                    const clash = q.status !== 'ABGELEHNT' ? overlapping(all, q) : [];
                    const otherKp = q.status !== 'ABGELEHNT' ? externalClashes(bookings.data ?? [], q) : [];
                    const res = resources.data?.find((x) => x.id === q.resourceId);
                    return (
                      <tr key={q.id} className="border-t border-slate-100 align-top">
                        <td className="whitespace-nowrap py-2 pr-3">
                          {wd(q.date)} {fmtDate(q.date).slice(0, 6)}
                          <div className="text-xs text-slate-500">
                            {fmtTime(q.startMin)}–{fmtTime(q.endMin)}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          {columnName(zuege, q.zugId)}
                          <div className="text-xs text-slate-500">{q.requestedByName}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="text-xs text-slate-500">{t(`resource.${q.kind}`)}</span>
                          <div className="font-medium">
                            {resName(q)} {res && <OwnerBadge r={res} />}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          {q.zweck}
                          {q.note && <div className="text-xs text-slate-500">{q.note}</div>}
                          {otherKp.length > 0 && (
                            <div className="mt-1 text-xs font-medium text-red-700">
                              {t('res.alsoBy', { list: otherKp.map((b) => `${b.kpName} ${fmtTime(b.startMin)}–${fmtTime(b.endMin)} (${b.status === 'BEWILLIGT' ? t('res.approvedLower') : t('res.requestedLower')})`).join(', ') })}
                            </div>
                          )}
                          {clash.length > 0 && (
                            <div className="mt-1 text-xs font-medium text-red-700">
                              {t('res.overlap', { list: clash.map((c) => `${columnName(zuege, c.zugId)} ${fmtTime(c.startMin)}–${fmtTime(c.endMin)}`).join(', ') })}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <RequestBadge status={q.status} />
                          {q.decisionNote && <div className="mt-1 text-xs text-slate-500">{q.decisionNote}</div>}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right">
                          {decider && q.status !== 'BEWILLIGT' && (
                            <Button variant="ghost" className="text-xs text-emerald-700" onClick={() => setDecision({ q, status: 'BEWILLIGT' })}>
                              {t('res.approve')}
                            </Button>
                          )}
                          {decider && q.status !== 'ABGELEHNT' && (
                            <Button variant="ghost" className="text-xs text-red-700" onClick={() => setDecision({ q, status: 'ABGELEHNT' })}>
                              {t('res.decline')}
                            </Button>
                          )}
                          {canEditRequest(me, wk, q) && (
                            <>
                              <Button variant="ghost" className="text-xs" onClick={() => setDialog({ existing: q })}>
                                {t('common.edit')}
                              </Button>
                              <Button variant="ghost" className="text-xs" onClick={() => remove(q)}>
                                {t('common.delete')}
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        )}

        <Card
          title={t('res.siteTitle')}
          actions={
            <select className="input !w-auto" value={mapDay} onChange={(e) => setMapDay(e.target.value)} aria-label={t('ap.day')}>
              {wkDays(wk).map((d) => (
                <option key={d} value={d}>
                  {wd(d)} {fmtDate(d)}
                </option>
              ))}
            </select>
          }
        >
          <SwissMap shapes={dayShapes} height={380} />
          <p className="mt-2 text-xs text-slate-500">
            {tn('res.siteLegend', { a: <span className="text-zs-blue">■</span>, b: <span className="text-amber-600">■</span>, c: <span className="text-emerald-600">■</span> })}
          </p>
        </Card>

        <Catalogue batId={wk.batId} kpId={wk.kpId} resources={resources.data ?? []} />
      </div>

      {dialog && (
        <RequestDialog
          detail={detail}
          existing={dialog.existing}
          initial={dialog.existing ?? { zugId: ownColumn?.id ?? KDO_ID }}
          onClose={() => setDialog(null)}
        />
      )}
      {decision && <DecisionDialog detail={detail} {...decision} onClose={() => setDecision(null)} />}
    </div>
  );
}

/** Resources of the Kp (own and shared) over the days of the WK. */
function Belegungsplan({
  detail,
  requests,
  bookings,
  resources,
  kind,
  onOpen,
}: {
  detail: WkDetail;
  requests: ResourceRequest[];
  bookings: Booking[];
  resources: Resource[];
  kind: ResourceKind | '';
  onOpen: (q: ResourceRequest) => void;
}) {
  const { t } = useT();
  const me = useUser();
  const { wk, zuege } = detail;
  const daySel = useDaySelection(wk, 'res');
  const [onlyMine, setOnlyMine] = useState(false);
  const myZug = me.zugId !== null && zuege.some((z) => z.id === me.zugId) ? me.zugId : null;

  const rows: TimelineRow[] = [
    ...resources
      .filter((r) => !kind || r.kind === kind)
      .map((r) => ({ id: String(r.id), label: r.name, sub: [t(`resource.${r.kind}`), r.capacity, r.description].filter(Boolean).join(' · '), badge: r.kpId === null ? 'Bat' : undefined })),
    ...((!kind || kind === 'GELAENDE') && requests.some((q) => q.resourceId === null && q.kind === 'GELAENDE') ? [{ id: 'area', label: t('res.ownAreas') }] : []),
  ];
  const visible = requests.filter((q) => !onlyMine || q.zugId === myZug);
  // Requests by amount without assignment yet: one row per type showing the open demand.
  const openTypes = [...new Set(visible.filter((q) => q.kind !== 'GELAENDE' && q.resourceId === null && !q.assignedIds.length && (!kind || q.kind === kind)).map((q) => q.category))];
  rows.splice(0, 0, ...openTypes.map((x) => ({ id: `cat:${x}`, label: t('res.notAssigned', { label: x || t('res.transport') }), badge: t('res.open') })));
  const items: TimelineItem[] = [
    ...visible.flatMap((q) => {
      const rowIds =
        q.resourceId !== null ? [String(q.resourceId)] : q.kind === 'GELAENDE' ? ['area'] : q.assignedIds.length ? q.assignedIds.map(String) : [`cat:${q.category}`];
      const amount =
        q.resourceId === null && q.kind !== 'GELAENDE' && !q.assignedIds.length ? (q.persons ? `${q.persons} Pers. · ` : `${q.quantity}× `) : '';
      return rowIds.map((rowId) => ({
        key: `q${q.id}:${rowId}`,
        rowId,
        date: q.date,
        startMin: q.startMin,
        endMin: q.endMin,
        label: `${amount}${columnName(zuege, q.zugId)} · ${q.zweck}`,
        title: `${columnName(zuege, q.zugId)}: ${amount}${q.zweck} (${t(`request.${q.status}`)}, ${q.requestedByName})`,
        status: q.status,
        mine: myZug === null || onlyMine ? undefined : q.zugId === myZug,
      }));
    }),
    ...bookings.map((b) => ({
      key: `b${b.requestId}`,
      rowId: String(b.resourceId),
      date: b.date,
      startMin: b.startMin,
      endMin: b.endMin,
      label: `${b.kpName} · ${b.zugName}`,
      title: `${b.kpName} (${b.wkTitle}), ${b.zugName}: ${b.zweck} (${t(`request.${b.status}`)})`,
      status: b.status,
      foreign: true,
    })),
  ];
  return (
    <Card
      title={t('res.plan')}
      actions={
        <>
          {myZug !== null && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> {t('res.onlyMine')}
            </label>
          )}
          <DaySelector wk={wk} all={daySel.all} days={daySel.days} onChange={daySel.set} />
        </>
      }
    >
      <ResourceTimeline
        rows={rows}
        items={items}
        days={daySel.days}
        dayStart={wk.dayStart}
        dayEnd={wk.dayEnd}
        highlightDays={wk.avorDays}
        onItemClick={(key) => {
          const q = requests.find((x) => key.startsWith(`q${x.id}:`));
          if (q) onOpen(q);
        }}
      />
    </Card>
  );
}
