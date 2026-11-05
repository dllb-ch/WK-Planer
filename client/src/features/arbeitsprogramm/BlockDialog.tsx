import { useState } from 'react';
import type { BlockInput, Location, Zug } from '@shared/types';
import { BLOCK_TYPES } from '@shared/types';
import { fmtDate, fmtTime, parseTime } from '@shared/util';
import { useT } from '../../i18n';
import { Button, Field, Modal, TextArea } from '../../components/ui';
import { PersonSelect } from '../../components/PersonSelect';

interface Props {
  title: string;
  initial: BlockInput;
  days: string[];
  zuege: Zug[];
  locations: Location[];
  readOnly: boolean;
  canSpan: boolean; // may choose several / other Züge
  canLock: boolean;
  lockedByBat: boolean;
  onSave?: (b: BlockInput) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onClose: () => void;
  /** Rooms and terrain of the catalogue as Standort (Kp Kdt): picking one adds it to the legend, linked, if needed. */
  catalogue?: { id: number; name: string; kind: 'RAUM' | 'GELAENDE' }[];
  onAddLocation?: (name: string, resourceId: number) => Promise<number | null>;
  /** Below the Standort: its reservation and the other requests of the block (gets the unsaved state). */
  resources?: (b: BlockInput) => React.ReactNode;
}

export function BlockDialog(p: Props) {
  const [b, setB] = useState<BlockInput>(p.initial);
  const set = <K extends keyof BlockInput>(k: K, v: BlockInput[K]) => setB((x) => ({ ...x, [k]: v }));
  const ro = p.readOnly;
  const { t, weekdayShort } = useT();

  const toggleZug = (id: number) => {
    const has = b.zugIds.includes(id);
    const next = has ? b.zugIds.filter((z) => z !== id) : [...b.zugIds, id];
    if (next.length) set('zugIds', next);
  };
  const order = p.zuege.map((z) => z.id);
  const idx = b.zugIds.map((id) => order.indexOf(id)).sort((x, y) => x - y);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const valid = b.title.trim() && b.endMin > b.startMin && contiguous;
  const save = () => p.onSave?.({ ...b, title: b.title.trim() });
  const linked = new Set(p.locations.filter((l) => l.resourceId != null).map((l) => l.resourceId));

  return (
    <Modal
      title={p.title}
      onClose={p.onClose}
      footer={
        <>
          {p.onDelete && !ro && (
            <Button variant="danger" className="mr-auto" onClick={p.onDelete}>
              {t('common.delete')}
            </Button>
          )}
          {p.onDuplicate && !ro && <Button onClick={p.onDuplicate}>{t('bd.duplicate')}</Button>}
          <Button onClick={p.onClose}>{ro ? t('common.close') : t('common.cancel')}</Button>
          {!ro && (
            <Button variant="primary" disabled={!valid} onClick={save}>
              {t('common.save')}
            </Button>
          )}
        </>
      }
    >
      {p.lockedByBat && <p className="rounded bg-pink-50 px-3 py-2 text-sm text-pink-800">{t('bd.batPreset')}</p>}
      <Field label={t('bd.titleTopic')}>
        <input className="input" autoFocus={!ro} disabled={ro} value={b.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field label={t('bd.type')}>
        <select className="input" disabled={ro} value={b.type} onChange={(e) => set('type', e.target.value as BlockInput['type'])}>
          {BLOCK_TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`block.${x}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('ap.day')}>
          <select className="input" disabled={ro} value={b.date} onChange={(e) => set('date', e.target.value)}>
            {p.days.map((d) => (
              <option key={d} value={d}>
                {weekdayShort(d)} {fmtDate(d)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('bd.from')}>
          <input type="time" step={300} className="input" disabled={ro} value={fmtTime(b.startMin)} onChange={(e) => e.target.value && set('startMin', parseTime(e.target.value))} />
        </Field>
        <Field label={t('bd.to')}>
          <input type="time" step={300} className="input" disabled={ro} value={fmtTime(b.endMin)} onChange={(e) => e.target.value && set('endMin', parseTime(e.target.value))} />
        </Field>
      </div>
      <div>
        <span className="label">{t('bd.zuege')}</span>
        <div className="flex flex-wrap gap-2">
          {p.zuege.map((z) => (
            <label key={z.id} className={`flex items-center gap-1.5 rounded border px-2 py-1 text-sm ${b.zugIds.includes(z.id) ? 'border-zs-blue bg-blue-50' : 'border-slate-200'}`}>
              <input type="checkbox" disabled={ro || !p.canSpan} checked={b.zugIds.includes(z.id)} onChange={() => toggleZug(z.id)} />
              {z.name}
            </label>
          ))}
        </div>
        {!contiguous && !ro && <p className="mt-1 text-xs text-red-600">{t('bd.adjacent')}</p>}
      </div>
      <Field label={t('bd.responsible')}>
        {ro ? (
          <input className="input" disabled value={b.verantwortlich} />
        ) : (
          <PersonSelect kpId={p.zuege[0]?.kpId ?? 0} zugId={b.zugIds} value={b.verantwortlich} onChange={(v) => set('verantwortlich', v)} />
        )}
      </Field>
      <section className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
        <h3 className="label !mb-0">{t('bd.locationResources')}</h3>
        <Field label={t('bd.location')}>
          <select
            className="input"
            disabled={ro}
            value={b.locationId ?? ''}
            onChange={async (e) => {
              const v = e.target.value;
              if (v.startsWith('cat:')) {
                const c = p.catalogue?.find((x) => x.id === Number(v.slice(4)));
                const id = c && (await p.onAddLocation?.(c.name, c.id));
                if (id) set('locationId', id);
                return;
              }
              set('locationId', v ? Number(v) : null);
            }}
          >
            <option value="">–</option>
            <optgroup label={t('bd.locationsLegend')}>
              {p.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nr} = {l.name}
                  {l.resourceId != null ? ' 🔗' : ''}
                </option>
              ))}
            </optgroup>
            {(['RAUM', 'GELAENDE'] as const).map((kind) => {
              const list = (p.catalogue ?? []).filter((c) => c.kind === kind && !linked.has(c.id));
              return list.length > 0 && p.onAddLocation ? (
                <optgroup key={kind} label={kind === 'RAUM' ? t('bd.roomsCatalogue') : t('bd.sitesCatalogue')}>
                  {list.map((c) => (
                    <option key={c.id} value={`cat:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </Field>
        {p.resources?.(b)}
      </section>
      <Field label={t('common.notes')}>
        <TextArea disabled={ro} value={b.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('bd.notesPh')} />
      </Field>
      {p.canLock && !ro && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={b.locked} onChange={(e) => set('locked', e.target.checked)} />
          {t('bd.lock')}
        </label>
      )}
      {b.endMin <= b.startMin && <p className="text-xs text-red-600">{t('bd.endAfterStart')}</p>}
    </Modal>
  );
}
