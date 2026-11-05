import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Block, Location, Zug } from '@shared/types';
import { BLOCK_TYPE_INFO, BLOCK_TYPES } from '@shared/types';
import { fmtDate, fmtTime } from '@shared/util';
import { useT } from '../../i18n';
import { api } from '../../api';
import { Button, errMsg, useToast } from '../../components/ui';
import { Comments } from './Comments';
import type { Hint } from './geometry';
import { ResourceChips, type ResourceChip } from '../ressourcen/BlockResources';

function Section({ title, children, defaultOpen = true, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-slate-200">
      <button className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50" onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2">
          {title} {badge}
        </span>
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

interface Props {
  wkId: number;
  selected: Block | null;
  zuege: Zug[];
  locations: Location[];
  hints: Hint[];
  selectedResources: ResourceChip[];
  canEditSelected: boolean;
  canEditLocations: boolean;
  onOpen: (id: number) => void;
  onSelect: (id: number) => void;
}

export function Sidebar(p: Props) {
  const { t, weekday, weekdayShort } = useT();
  const zugNames = (ids: number[]) => p.zuege.filter((z) => ids.includes(z.id)).map((z) => z.name).join(', ');
  const loc = p.locations.find((l) => l.id === p.selected?.locationId);
  const overlaps = p.hints.filter((h) => h.kind === 'overlap').length;
  return (
    <aside className="no-print flex w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
      <Section title={t('sb.selected')}>
        {p.selected ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: BLOCK_TYPE_INFO[p.selected.type].color }} />
              <div className="min-w-0">
                <div className="font-semibold">{p.selected.title}</div>
                <div className="text-xs text-slate-500">
                  {weekday(p.selected.date)} {fmtDate(p.selected.date)}, {fmtTime(p.selected.startMin)}–{fmtTime(p.selected.endMin)}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-slate-500">{t('bd.type')}</dt>
              <dd>{t(`block.${p.selected.type}`)}</dd>
              <dt className="text-slate-500">{t('bd.zuege')}</dt>
              <dd>{zugNames(p.selected.zugIds)}</dd>
              {loc && (
                <>
                  <dt className="text-slate-500">{t('bd.location')}</dt>
                  <dd>
                    ({loc.nr}) {loc.name}
                  </dd>
                </>
              )}
              {p.selected.verantwortlich && (
                <>
                  <dt className="text-slate-500">{t('sb.respShort')}</dt>
                  <dd>{p.selected.verantwortlich}</dd>
                </>
              )}
              {(p.selected.locked || p.selected.source === 'BAT') && (
                <>
                  <dt className="text-slate-500">{t('common.status')}</dt>
                  <dd>{p.selected.source === 'BAT' ? t('sb.batLocked') : t('sb.locked')}</dd>
                </>
              )}
            </dl>
            {p.selected.notes && <p className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{p.selected.notes}</p>}
            {p.selectedResources.length > 0 && (
              <div>
                <div className="label">{t('sb.resources')}</div>
                <ResourceChips chips={p.selectedResources} />
              </div>
            )}
            <Button className="w-full" onClick={() => p.onOpen(p.selected!.id)}>
              {p.canEditSelected ? t('common.edit') : t('sb.details')}
            </Button>
            <div className="pt-1">
              <div className="label">{t('sb.blockComments')}</div>
              <Comments wkId={p.wkId} blockId={p.selected.id} compact />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">{t('sb.clickHint')}</p>
        )}
      </Section>

      <Section
        title={t('sb.hints')}
        badge={
          <>
            {overlaps > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[10px] text-red-700">{overlaps}</span>}
            {p.hints.length > overlaps && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{p.hints.length - overlaps}</span>}
          </>
        }
      >
        {p.hints.length === 0 ? (
          <p className="text-xs text-emerald-700">{t('sb.noHints')}</p>
        ) : (
          <ul className="space-y-1">
            {[...p.hints].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'overlap' ? -1 : 1)).map((h, i) => (
              <li key={i}>
                <button className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-slate-100" onClick={() => p.onSelect(h.blockIds[0])}>
                  <span className={h.kind === 'overlap' ? 'text-red-700' : 'text-amber-700'}>{h.kind === 'overlap' ? '⚠' : 'ⓘ'}</span>{' '}
                  <span className="text-slate-500">{weekdayShort(h.date)}:</span> {h.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('sb.legend')}>
        <LocationsEditor wkId={p.wkId} locations={p.locations} editable={p.canEditLocations} />
        <div className="mt-3 grid grid-cols-2 gap-1">
          {BLOCK_TYPES.map((x) => (
            <div key={x} className="flex items-center gap-1.5 text-xs">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: BLOCK_TYPE_INFO[x].color }} />
              {t(`block.${x}`)}
            </div>
          ))}
          <div className="col-span-2 mt-1 flex items-center gap-1.5 text-xs">
            <span className="block-bat h-3 w-3 shrink-0 rounded-sm bg-pink-600" /> {t('sb.batPresetLegend')}
          </div>
        </div>
      </Section>

      <Section title={t('sb.wkComments')} defaultOpen={false}>
        <Comments wkId={p.wkId} blockId={null} />
      </Section>
    </aside>
  );
}

function LocationsEditor({ wkId, locations, editable }: { wkId: number; locations: Location[]; editable: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useT();
  const [draft, setDraft] = useState<{ id?: number; nr: number; name: string }[] | null>(null);

  if (!draft) {
    return (
      <div>
        <div className="label">{t('sb.locations')}</div>
        {locations.length === 0 && <p className="text-xs text-slate-400">{t('sb.noLocations')}</p>}
        <ul className="space-y-0.5 text-xs">
          {locations.map((l) => (
            <li key={l.id}>
              <span className="font-semibold">{l.nr}</span> = {l.name}
              {l.resourceId != null && (
                <span className="ml-1 text-slate-400" title={t('sb.fromCatalogue')}>
                  🔗
                </span>
              )}
            </li>
          ))}
          <li className="text-slate-500">{t('sb.moveLegend')}</li>
        </ul>
        {editable && (
          <Button variant="ghost" className="mt-1 !px-1 text-xs" onClick={() => setDraft(locations.map(({ id, nr, name }) => ({ id, nr, name })))}>
            {t('sb.editLocations')}
          </Button>
        )}
      </div>
    );
  }

  const save = async () => {
    try {
      await api.saveLocations(wkId, draft.filter((d) => d.name.trim()));
      await qc.invalidateQueries({ queryKey: ['wk', wkId] });
      setDraft(null);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="label">{t('sb.locations')}</div>
      {draft.map((d, i) => (
        <div key={i} className="flex gap-1">
          <input
            className="input !w-12"
            type="number"
            value={d.nr}
            onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, nr: Number(e.target.value) } : x)))}
          />
          <input className="input" value={d.name} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <button className="px-1 text-slate-400 hover:text-red-600" onClick={() => setDraft(draft.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <Button variant="ghost" className="text-xs" onClick={() => setDraft([...draft, { nr: Math.max(0, ...draft.map((d) => d.nr)) + 1, name: '' }])}>
          {t('sb.addLocation')}
        </Button>
        <span className="flex-1" />
        <Button className="text-xs" onClick={() => setDraft(null)}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" className="text-xs" onClick={save}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
