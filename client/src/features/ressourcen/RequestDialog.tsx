import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Area, RequestInput, ResourceKind, ResourceRequest, Zug } from '@shared/types';
import { KDO_ID } from '@shared/types';
import { canRequestResource } from '@shared/permissions';
import { fmtDate, fmtTime, parseTime, wkDays } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, errMsg, Field, Modal, TextArea, useToast } from '../../components/ui';
import { SwissMap, type MapShape } from '../../components/SwissMap';
import { columnName, withKdo } from '../arbeitsprogramm/columns';
import { externalClashes, overlapping } from './conflicts';
import { OwnerBadge } from './Catalogue';
import { useT } from '../../i18n';

interface Props {
  detail: WkDetail;
  initial: Partial<RequestInput> & { zugId: number };
  existing?: ResourceRequest;
  onClose: () => void;
}

export function RequestDialog({ detail, initial, existing, onClose }: Props) {
  const { t, weekdayShort } = useT();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId) });
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id) });
  const bookings = useQuery({ queryKey: ['bookings', wk.id], queryFn: () => api.bookings(wk.id) });
  const strength = useQuery({ queryKey: ['strength', wk.id], queryFn: () => api.strength(wk.id) });
  const days = wkDays(wk);
  const [f, setF] = useState<RequestInput>({
    blockId: null,
    resourceId: null,
    kind: 'FAHRZEUG',
    category: '',
    quantity: 1,
    persons: 0,
    date: days[0],
    startMin: wk.dayStart,
    endMin: Math.min(wk.dayStart + 60, wk.dayEnd),
    zweck: '',
    note: '',
    area: null,
    ...initial,
  });
  const set = (patch: Partial<RequestInput>) => setF((x) => ({ ...x, ...patch }));
  const columns: Zug[] = withKdo(wk.kpId, zuege).filter((z) => canRequestResource(me, wk, z.id) || z.id === f.zugId);

  const catalogue = (resources.data ?? []).filter((r) => r.kind === f.kind);
  // Vehicles are requested by number of people, rooms by type and amount, unless a specific one is needed.
  const [mode, setMode] = useState<'persons' | 'amount' | 'specific'>(
    initial.resourceId != null ? 'specific' : (initial.persons ?? 0) > 0 || (!existing && (initial.kind ?? 'FAHRZEUG') === 'FAHRZEUG') ? 'persons' : 'amount',
  );
  const effMode = f.kind === 'GELAENDE' ? 'specific' : f.kind !== 'FAHRZEUG' && mode === 'persons' ? 'amount' : mode;
  const byAmount = effMode === 'amount';
  const byPersons = effMode === 'persons';
  const specific = effMode === 'specific';
  const types = [...new Set(catalogue.map((r) => r.category).filter(Boolean))].sort();
  // By persons, '' means any vehicle with seats.
  const category = byPersons ? f.category : f.category || types[0] || '';
  const avail = useQuery({
    queryKey: ['availability', wk.id, f.kind, category, f.date, f.startMin, f.endMin, existing?.id],
    queryFn: () => api.availability(wk.id, { kind: f.kind, category, date: f.date, startMin: f.startMin, endMin: f.endMin, exclude: existing?.id }),
    enabled: (byPersons || (byAmount && !!category)) && f.endMin > f.startMin,
  });
  const freeSeats = (avail.data?.free ?? []).reduce((a, r) => a + r.seats, 0);
  // Planned headcount of the Zug on that day, as a suggestion.
  const planned = strength.data?.find((s) => s.zugId === f.zugId && s.date === f.date)?.planned ?? 0;
  const [touched, setTouched] = useState(!!existing);
  useEffect(() => {
    if (!touched && byPersons && planned > 0 && f.persons !== planned) setF((x) => ({ ...x, persons: planned }));
  }, [touched, byPersons, planned, f.persons]);
  const chosen = catalogue.find((r) => r.id === f.resourceId);
  const clashes = overlapping(requests.data ?? [], { ...f, id: existing?.id ?? -1 });
  const otherKp = externalClashes(bookings.data ?? [], { ...f, id: existing?.id ?? -1 });
  const terrainShapes: MapShape[] = useMemo(
    () => [
      ...(resources.data ?? [])
        .filter((r) => r.kind === 'GELAENDE' && r.area && r.id !== f.resourceId)
        .map((r) => ({ area: r.area!, color: '#1e3a8a', label: r.name })),
      ...(chosen?.area ? [{ area: chosen.area, color: '#f97316', label: chosen.name }] : []),
      ...(requests.data ?? [])
        .filter((q) => q.area && q.date === f.date && q.id !== existing?.id && q.status !== 'ABGELEHNT')
        .map((q) => ({ area: q.area!, color: q.status === 'BEWILLIGT' ? '#16a34a' : '#ca8a04', label: `${columnName(zuege, q.zugId)}: ${q.zweck}` })),
    ],
    [resources.data, requests.data, chosen, f.resourceId, f.date, existing?.id, zuege],
  );

  const valid =
    f.zweck.trim() &&
    f.endMin > f.startMin &&
    (byPersons ? f.persons >= 1 : byAmount ? !!category && f.quantity >= 1 : f.resourceId != null || (f.kind === 'GELAENDE' && (f.area?.length ?? 0) >= 3));

  const save = async () => {
    try {
      const body = byPersons
        ? { ...f, resourceId: null, category, quantity: 1, area: null }
        : byAmount
          ? { ...f, resourceId: null, category, persons: 0, area: null }
          : { ...f, quantity: 1, persons: 0, area: f.resourceId != null ? null : f.area };
      if (existing) await api.updateRequest(wk.id, existing.id, body);
      else await api.createRequest(wk.id, body);
      qc.invalidateQueries({ queryKey: ['requests', wk.id] });
      toast(existing ? t('req.changed') : t('req.sent'));
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Modal
      title={existing ? t('req.edit') : t('req.new')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {existing ? t('common.save') : t('req.send')}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {(['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE'] as ResourceKind[]).map((k) => (
          <button
            key={k}
            className={`rounded-md border px-3 py-1.5 text-sm ${f.kind === k ? 'border-zs-blue bg-blue-50 font-medium text-zs-blue' : 'border-slate-300 hover:bg-slate-50'}`}
            onClick={() => set({ kind: k, resourceId: null, area: null, category: '' })}
          >
            {t(`resource.${k}`)}
          </button>
        ))}
      </div>
      {f.kind !== 'GELAENDE' && (
        <div className="flex flex-wrap gap-4 text-sm">
          {f.kind === 'FAHRZEUG' && (
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={byPersons} onChange={() => setMode('persons')} /> {t('req.byPersons')}
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={byAmount} onChange={() => setMode('amount')} /> {t('req.byAmount')}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={specific} onChange={() => setMode('specific')} />
            {f.kind === 'FAHRZEUG' ? t('req.specificVehicle') : f.kind === 'ANHAENGER' ? t('req.specificTrailer') : t('req.specificRoom')} {t('req.specificHint')}
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {byPersons ? (
          <div className="grid grid-cols-[5rem,1fr] gap-2">
            <Field label={t('req.persons')}>
              <input
                type="number"
                min={1}
                max={500}
                className="input"
                value={f.persons || ''}
                onChange={(e) => {
                  setTouched(true);
                  set({ persons: Math.max(0, Math.min(500, Number(e.target.value) || 0)) });
                }}
              />
            </Field>
            <Field label={t('req.vehicleType')}>
              <select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">{t('req.any')}</option>
                {types.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </Field>
            {planned > 0 && planned !== f.persons && (
              <button type="button" className="col-span-2 -mt-1 text-left text-xs text-zs-blue hover:underline" onClick={() => set({ persons: planned })}>
                {t('req.takePlanned', { n: planned })}
              </button>
            )}
            {avail.data && (
              <p className={`col-span-2 -mt-1 text-xs ${freeSeats >= f.persons ? 'text-emerald-700' : 'text-red-700'}`}>
                {t('req.freeSeats', { n: avail.data.free.length, seats: freeSeats })}
                {freeSeats < f.persons && t('req.notFully')}
              </p>
            )}
          </div>
        ) : byAmount ? (
          <div className="grid grid-cols-[1fr,5rem] gap-2">
            <Field label={t('setup.type')}>
              <select className="input" value={category} onChange={(e) => set({ category: e.target.value })}>
                {types.map((x) => (
                  <option key={x} value={x}>
                    {t('req.inCatalogue', { type: x, n: catalogue.filter((r) => r.category === x).length })}
                  </option>
                ))}
                {types.length === 0 && <option value="">{t('req.noneInCatalogue')}</option>}
              </select>
            </Field>
            <Field label={t('req.amount')}>
              <input type="number" min={1} max={20} className="input" value={f.quantity} onChange={(e) => set({ quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
            </Field>
            {avail.data && (
              <p className={`col-span-2 -mt-1 text-xs ${avail.data.free.length >= f.quantity ? 'text-emerald-700' : 'text-red-700'}`}>
                {t('req.freeOf', { n: avail.data.free.length, total: avail.data.total })}
                {avail.data.free.length < f.quantity && t('req.notFully')}
              </p>
            )}
          </div>
        ) : (
        <Field label={f.kind === 'GELAENDE' ? t('req.siteSection') : t(`resource.${f.kind}`)}>
          <select className="input" value={f.resourceId ?? ''} onChange={(e) => set({ resourceId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{f.kind === 'GELAENDE' ? t('req.ownArea') : t('common.choose')}</option>
            {[
              [t('req.batMaterial'), catalogue.filter((r) => r.kpId === null)],
              [t('req.kpMaterial'), catalogue.filter((r) => r.kpId !== null)],
            ].map(([label, list]) =>
              (list as typeof catalogue).length ? (
                <optgroup key={label as string} label={label as string}>
                  {(list as typeof catalogue).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.capacity && ` (${r.capacity})`}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </select>
        </Field>
        )}
        <Field label={t('std.for')}>
          <select className="input" value={f.zugId} disabled={columns.length < 2} onChange={(e) => set({ zugId: Number(e.target.value), blockId: null })}>
            {columns.map((z) => (
              <option key={z.id} value={z.id}>
                {z.id === KDO_ID ? t('kdo') : z.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('ap.day')}>
          <select className="input" value={f.date} onChange={(e) => set({ date: e.target.value })}>
            {days.map((d) => (
              <option key={d} value={d}>
                {weekdayShort(d)} {fmtDate(d)}
                {wk.avorDays.includes(d) ? ' (AVOR)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('bd.from')}>
            <input type="time" className="input" value={fmtTime(f.startMin)} onChange={(e) => e.target.value && set({ startMin: parseTime(e.target.value) })} />
          </Field>
          <Field label={t('bd.to')}>
            <input type="time" className="input" value={fmtTime(f.endMin)} onChange={(e) => e.target.value && set({ endMin: parseTime(e.target.value) })} />
          </Field>
        </div>
      </div>
      <Field label={t('res.zweck')}>
        <input className="input" value={f.zweck} onChange={(e) => set({ zweck: e.target.value })} placeholder={t('req.zweckPh')} />
      </Field>
      <Field label={t('common.notes')}>
        <TextArea rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder={t('req.notePh')} />
      </Field>
      {clashes.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>{t('req.attention')}</b> {t('req.alreadyRequested', { kind: t(`resource.${f.kind}`) })}
          <ul className="ml-4 list-disc">
            {clashes.map((q) => (
              <li key={q.id}>
                {columnName(zuege, q.zugId)} {fmtTime(q.startMin)}–{fmtTime(q.endMin)} ({q.status === 'BEWILLIGT' ? t('res.approvedLower') : t('res.requestedLower')}): {q.zweck}
              </li>
            ))}
          </ul>
        </div>
      )}
      {chosen && chosen.kpId === null && (
        <p className="text-xs text-slate-500">
          <OwnerBadge r={chosen} /> {t('req.shared')}
        </p>
      )}
      {otherKp.length > 0 && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          <b>{t('req.otherKp')}</b>
          <ul className="ml-4 list-disc">
            {otherKp.map((b) => (
              <li key={b.requestId}>
                {b.kpName} ({b.zugName}) {fmtTime(b.startMin)}–{fmtTime(b.endMin)}, {b.status === 'BEWILLIGT' ? t('res.approvedLower') : t('res.requestedLower')}: {b.zweck}
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.kind === 'GELAENDE' && (
        <SwissMap
          shapes={terrainShapes}
          value={f.resourceId != null ? null : f.area}
          onChange={f.resourceId != null ? undefined : (area: Area | null) => set({ area })}
          height={320}
        />
      )}
    </Modal>
  );
}
