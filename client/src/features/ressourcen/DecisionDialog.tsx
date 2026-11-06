import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RequestStatus, ResourceRequest } from '@shared/types';
import { fmtDate, fmtTime, pickVehicles } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { Button, Modal, TextArea, errMsg, useToast } from '../../components/ui';
import { SwissMap, type MapShape } from '../../components/SwissMap';
import { columnName } from '../arbeitsprogramm/columns';
import { OwnerBadge } from './Catalogue';
import { requestLabel } from './conflicts';
import { useT } from '../../i18n';

/** Approve or decline a request; a requested site (Gelände) is shown on the map before deciding. */
export function DecisionDialog({ detail, q, status, onClose }: { detail: WkDetail; q: ResourceRequest; status: RequestStatus; onClose: () => void }) {
  const { t } = useT();
  const wkId = detail.wk.id;
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  // Requests by amount get concrete vehicles/rooms on approval; the first free ones are suggested.
  const assigning = status === 'BEWILLIGT' && q.resourceId == null && q.kind !== 'GELAENDE';
  const avail = useQuery({
    queryKey: ['availability', wkId, q.kind, q.category, q.date, q.startMin, q.endMin, q.id],
    queryFn: () => api.availability(wkId, { kind: q.kind, category: q.category, date: q.date, startMin: q.startMin, endMin: q.endMin, exclude: q.id }),
    enabled: assigning,
  });
  const [picked, setPicked] = useState<number[] | null>(null);
  const free = avail.data?.free ?? [];
  const byPersons = q.persons > 0;
  const chosen = picked ?? (byPersons ? pickVehicles(free, q.persons) : free.slice(0, q.quantity).map((r) => r.id));
  const seats = chosen.reduce((a, id) => a + (free.find((r) => r.id === id)?.seats ?? 0), 0);
  const freeSeats = free.reduce((a, r) => a + r.seats, 0);
  const enough = byPersons ? seats >= q.persons : chosen.length === q.quantity;
  const toggle = (id: number) => setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const go = async () => {
    try {
      await api.decideRequest(wkId, q.id, status, note, assigning ? chosen : undefined);
      qc.invalidateQueries({ queryKey: ['requests', wkId] });
      qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === 'availability' || x.queryKey[0] === 'bat-bookings' });
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <Modal
      title={status === 'BEWILLIGT' ? t('res.approveTitle') : t('res.declineTitle')}
      onClose={onClose}
      wide={q.kind === 'GELAENDE'}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant={status === 'BEWILLIGT' ? 'primary' : 'danger'}
            disabled={(status === 'ABGELEHNT' && !note.trim()) || (assigning && !enough)}
            onClick={go}
          >
            {status === 'BEWILLIGT' ? t('res.approve') : t('res.decline')}
          </Button>
        </>
      }
    >
      <p className="text-sm">
        {q.zweck} – {fmtDate(q.date)} {fmtTime(q.startMin)}–{fmtTime(q.endMin)}
      </p>
      {q.kind === 'GELAENDE' && <RequestedSite detail={detail} q={q} />}
      {assigning && (
        <div className="space-y-1.5">
          <div className="label">
            {byPersons
              ? t('res.assignVehicles', { n: q.persons, cat: q.category ? ` (${q.category})` : '', seats })
              : t('res.assignN', { q: q.quantity, cat: q.category, n: chosen.length })}
          </div>
          {q.note && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Anforderung: {q.note}</p>}
          {avail.isLoading ? (
            <p className="text-sm text-slate-500">{t('res.searching')}</p>
          ) : byPersons ? (
            freeSeats < q.persons && (
              <p className="rounded bg-red-50 px-2 py-1 text-sm text-red-800">
                {t('res.onlySeats', { free: freeSeats, n: q.persons })}
              </p>
            )
          ) : free.length < q.quantity ? (
            <p className="rounded bg-red-50 px-2 py-1 text-sm text-red-800">
              {t('res.onlyN', { free: free.length, n: q.quantity, cat: q.category })}
            </p>
          ) : null}
          <div className="grid gap-1 sm:grid-cols-2">
            {free.map((r) => (
              <label key={r.id} className={`flex items-start gap-2 rounded border px-2 py-1 text-sm ${chosen.includes(r.id) ? 'border-zs-blue bg-blue-50' : 'border-slate-200'}`}>
                <input type="checkbox" className="mt-1" checked={chosen.includes(r.id)} onChange={() => toggle(r.id)} />
                <span>
                  {r.name} {r.seats > 0 && <span className="text-xs text-slate-500">{t('res.seatsShort', { n: r.seats })}</span>} <OwnerBadge r={r} />
                  {r.description && <span className="block text-xs text-slate-500">{r.description}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'BEWILLIGT' ? t('res.noteApprove') : t('res.noteDecline')} />
    </Modal>
  );
}

/** The requested site (area and points) among the other site requests of that day. */
export function RequestedSite({ detail, q }: { detail: WkDetail; q: ResourceRequest }) {
  const { t, tn } = useT();
  const { wk, zuege } = detail;
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId) });
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id) });
  const site = resources.data?.find((r) => r.id === q.resourceId);
  const area = q.area ?? site?.area ?? null;
  const points = site?.points ?? [];
  const shapes: MapShape[] = useMemo(
    () => [
      ...(requests.data ?? [])
        .filter((x) => x.kind === 'GELAENDE' && x.id !== q.id && x.date === q.date && x.status !== 'ABGELEHNT')
        .map((x): MapShape | null => {
          const other = resources.data?.find((r) => r.id === x.resourceId);
          const a = x.area ?? other?.area ?? null;
          return a || other?.points.length
            ? {
                area: a,
                points: other?.points,
                color: x.status === 'BEWILLIGT' ? '#16a34a' : '#ca8a04',
                label: `${columnName(zuege, x.zugId)} ${fmtTime(x.startMin)}–${fmtTime(x.endMin)}: ${x.zweck}`,
              }
            : null;
        })
        .filter((x): x is MapShape => !!x),
      ...(area || points.length ? [{ area, points, color: '#f97316', label: requestLabel(q, resources.data ?? []), focus: true }] : []),
    ],
    [requests.data, resources.data, q, area, points, zuege],
  );
  if (resources.isLoading) return null;
  return (
    <div className="space-y-1.5">
      <div className="label">
        {t('site.requested')}: {requestLabel(q, resources.data ?? [])}
      </div>
      {area || points.length ? (
        <>
          <SwissMap shapes={shapes} height={300} />
          <p className="text-xs text-slate-500">
            {tn('site.decideLegend', { a: <span className="text-orange-500">■</span>, b: <span className="text-emerald-600">■</span>, c: <span className="text-amber-600">■</span> })}
          </p>
          {points.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {points.map((p, i) => (
                <li key={i}>
                  <span className="mr-1 inline-grid h-4 w-4 place-items-center rounded-full bg-orange-500 text-[9px] font-semibold text-white">{i + 1}</span>
                  {p.label || t('site.pointN', { n: i + 1 })}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500">{t('site.noShape')}</p>
      )}
    </div>
  );
}
