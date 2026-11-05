import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Booking, Resource, ResourceKind } from '@shared/types';

const KINDS: ResourceKind[] = ['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE'];
import { addDays, dateRange, fmtDate, fmtTime } from '@shared/util';

const wd = (d: string) => weekdayShortIn(currentLang(), d);
import { api } from '../../api';
import { Button, Card, Empty } from '../../components/ui';
import { Catalogue, OwnerBadge } from './Catalogue';
import { ResourceTimeline } from './ResourceTimeline';
import { RequestBadge } from './RessourcenPage';
import { useT } from '../../i18n';
import { weekdayShortIn } from '@shared/i18n';
import { currentLang } from '../../lib/lang';

const today = () => new Date().toISOString().slice(0, 10);

/** Bookings that overlap another open or approved booking of the same resource. */
function doubleBooked(list: Booking[]) {
  const ids = new Set<number>();
  const active = list.filter((b) => b.status !== 'ABGELEHNT');
  for (const a of active)
    for (const b of active)
      if (a.requestId < b.requestId && a.resourceId !== null && a.resourceId === b.resourceId && a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin) {
        ids.add(a.requestId).add(b.requestId);
      }
  return ids;
}

/** Org Admin / Bat Kdo: the Bataillon's material and who uses it when, across all Kompanien and WKs. */
export function MaterialOverview({ batId }: { batId: number }) {
  const { t } = useT();
  const resources = useQuery({ queryKey: ['bat-resources', batId], queryFn: () => api.batResources(batId) });
  const bookings = useQuery({ queryKey: ['bat-bookings', batId], queryFn: () => api.batBookings(batId), refetchInterval: 30000 });
  const [kind, setKind] = useState<ResourceKind | ''>('FAHRZEUG');
  const [onlyShared, setOnlyShared] = useState(true);
  const [fromToday, setFromToday] = useState(true);
  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  const [weekStart, setWeekStart] = useState<string | null>(null);

  const all = bookings.data ?? [];
  const clashes = useMemo(() => doubleBooked(all), [all]);
  const shown = (resources.data ?? []).filter((r) => (!kind || r.kind === kind) && (!onlyShared || r.kpId === null));
  const bookingsOf = (r: Resource) => all.filter((b) => b.resourceId === r.id && (!fromToday || b.date >= today()));
  const openDemand = all.filter((b) => b.resourceId === null && b.status === 'BEANTRAGT' && b.date >= today() && (!kind || shown.some((r) => r.category === b.category)));
  const openClashes = all.filter((b) => clashes.has(b.requestId) && b.date >= today()).length;

  return (
    <div className="space-y-4">
      <Catalogue batId={batId} kpId={null} resources={resources.data ?? []} />
      <Card
        title={t('mat.title')}
        actions={
          <>
            {openClashes > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{openClashes} Doppelbelegungen</span>}
            <div className="flex rounded-md border border-slate-300 p-0.5">
              {(['timeline', 'list'] as const).map((v) => (
                <button
                  key={v}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${view === v ? 'bg-zs-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  onClick={() => setView(v)}
                >
                  {v === 'timeline' ? t('mat.timeline') : t('ap.list')}
                </button>
              ))}
            </div>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind | '')} aria-label={t('bd.type')}>
            <option value="">{t('res.allKinds')}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`resource.${k}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} /> nur Material des Bataillons
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={fromToday} onChange={(e) => setFromToday(e.target.checked)} /> ab heute
          </label>
        </div>
        {openDemand.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <b>{t('mat.notAssigned')}</b>
            <ul className="mt-1 space-y-0.5">
              {openDemand.map((b) => (
                <li key={b.requestId}>
                  {b.persons ? t('res.transportN', { n: b.persons, cat: b.category ? ` (${b.category})` : '' }) : `${b.quantity}× ${b.category}`} · {wd(b.date)} {fmtDate(b.date).slice(0, 6)} {fmtTime(b.startMin)}–{fmtTime(b.endMin)} · {b.kpName} ({b.zugName}) ·{' '}
                  {b.zweck}
                </li>
              ))}
            </ul>
          </div>
        )}
        {shown.length === 0 ? (
          <Empty>{t('mat.none')}</Empty>
        ) : view === 'timeline' ? (
          <WeekTimeline resources={shown} bookings={all} start={weekStart ?? firstWeek(all)} onStart={setWeekStart} />
        ) : (
          <div className="space-y-3">
            {shown.map((r) => {
              const list = bookingsOf(r);
              return (
                <section key={r.id} className="rounded-md border border-slate-200">
                  <h3 className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-1.5 text-sm font-semibold">
                    {r.name} <OwnerBadge r={r} />
                    {r.capacity && <span className="font-normal text-slate-500">{r.capacity}</span>}
                    <span className="ml-auto text-xs font-normal text-slate-500">{list.length} Anfragen</span>
                  </h3>
                  {list.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">{t('mat.free')}</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {list.map((b) => (
                        <li key={b.requestId} className={`flex flex-wrap items-start gap-x-3 gap-y-0.5 px-3 py-1.5 ${clashes.has(b.requestId) ? 'bg-red-50' : ''}`}>
                          <span className="w-36 shrink-0 tabular-nums">
                            {wd(b.date)} {fmtDate(b.date).slice(0, 6)} {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                          </span>
                          <span className="w-40 shrink-0 font-medium">
                            {b.kpName} · {b.zugName}
                          </span>
                          <span className="min-w-0 flex-1">
                            {b.zweck}
                            <span className="text-xs text-slate-500">
                              {' '}
                              · {b.wkTitle} · {b.requestedByName}
                            </span>
                            {clashes.has(b.requestId) && <span className="ml-1 text-xs font-semibold text-red-700">{t('mat.double')}</span>}
                          </span>
                          <RequestBadge status={b.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Monday of the week of the next upcoming booking (or of today). */
function firstWeek(bookings: Booking[]) {
  const next = bookings.filter((b) => b.date >= today() && b.status !== 'ABGELEHNT').map((b) => b.date).sort()[0] ?? today();
  const d = new Date(next + 'T00:00:00Z');
  return addDays(next, -((d.getUTCDay() + 6) % 7));
}

function WeekTimeline({ resources, bookings, start, onStart }: { resources: Resource[]; bookings: Booking[]; start: string; onStart: (d: string) => void }) {
  const { t } = useT();
  const days = dateRange(start, addDays(start, 6));
  const inWeek = bookings.filter((b) => b.date >= days[0] && b.date <= days[6]);
  const nextBooking = bookings.filter((b) => b.date > days[6] && b.status !== 'ABGELEHNT').map((b) => b.date).sort()[0];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button onClick={() => onStart(addDays(start, -7))} aria-label={t('mat.prevWeek')}>
          ‹
        </Button>
        <span className="font-medium">
          {fmtDate(days[0])} – {fmtDate(days[6])}
        </span>
        <Button onClick={() => onStart(addDays(start, 7))} aria-label={t('mat.nextWeek')}>
          ›
        </Button>
        <Button variant="ghost" onClick={() => onStart(firstWeek(bookings))}>
          {t('mat.nextBooking')}
        </Button>
        {inWeek.length === 0 && nextBooking && (
          <span className="text-xs text-slate-500">Keine Belegung in dieser Woche – nächste am {fmtDate(nextBooking)}.</span>
        )}
      </div>
      <ResourceTimeline
        rows={resources.map((r) => ({ id: String(r.id), label: r.name, sub: r.description, badge: r.kpId === null ? 'Bat' : undefined }))}
        items={inWeek.map((b) => ({
          key: String(b.requestId),
          rowId: String(b.resourceId),
          date: b.date,
          startMin: b.startMin,
          endMin: b.endMin,
          label: `${b.kpName} · ${b.zugName}`,
          title: `${b.kpName} (${b.wkTitle}), ${b.zugName}: ${b.zweck} – ${b.requestedByName}`,
          status: b.status,
        }))}
        days={days}
        dayStart={6 * 60}
        dayEnd={20 * 60}
      />
    </div>
  );
}
