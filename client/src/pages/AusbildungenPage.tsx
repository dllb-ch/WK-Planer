import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { MyAusbildung } from '@shared/types';
import { avProgress } from '@shared/av';
import { fmtDate } from '@shared/util';
import { api } from '../api';
import { useUser } from '../auth';
import { Card, Empty } from '../components/ui';
import { FachbereichTags } from '../components/FachbereichTags';
import { useT } from '../i18n';

const today = () => new Date().toISOString().slice(0, 10);

/** Kader (and Zugführer): every lesson I lead, across all WKs, with how far its preparation is. */
export function AusbildungenPage() {
  const { t, weekday } = useT();
  const me = useUser();
  const q = useQuery({ queryKey: ['my-ausbildungen'], queryFn: api.myAusbildungen });
  const [scope, setScope] = useState<'mine' | 'zug'>('mine');
  const [past, setPast] = useState(false);
  const list = (q.data ?? []).filter((x) => (scope === 'mine' ? x.mine : true)).filter((x) => past || !x.av.datum || x.av.datum >= today());
  const byDay = new Map<string, MyAusbildung[]>();
  for (const x of list) byDay.set(x.av.datum, [...(byDay.get(x.av.datum) ?? []), x]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold">{t('my.title')}</h1>
            <p className="text-sm text-slate-500">{t('my.intro')}</p>
          </div>
          {me.role === 'ZFHR' && (
            <div className="flex rounded-md border border-slate-300 p-0.5">
              {(['mine', 'zug'] as const).map((v) => (
                <button key={v} className={`rounded px-2.5 py-1 text-xs font-medium ${scope === v ? 'bg-zs-blue text-white' : 'text-slate-600'}`} onClick={() => setScope(v)}>
                  {v === 'mine' ? t('my.mine') : t('my.zug')}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> vergangene anzeigen
          </label>
        </div>
        {q.isLoading ? (
          <Empty>{t('common.loading')}</Empty>
        ) : list.length === 0 ? (
          <Card>
            <Empty>
              {t('my.none')}
            </Empty>
          </Card>
        ) : (
          [...byDay.entries()].map(([day, items]) => (
            <section key={day || 'none'}>
              <h2 className="mb-1.5 text-sm font-semibold text-slate-600">{day ? `${weekday(day)}, ${fmtDate(day)}` : t('my.noDate')}</h2>
              <div className="space-y-2">
                {items.map((x) => (
                  <AusbildungCard key={x.av.id} x={x} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

export function AusbildungCard({ x, compact }: { x: MyAusbildung; compact?: boolean }) {
  const { t } = useT();
  const p = avProgress(x.av);
  const color = p.done === p.total ? 'bg-emerald-500' : p.done >= 4 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <Link to={`/wk/${x.av.wkId}/av/${x.av.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-zs-blue">
      <div className="flex items-start gap-3">
        <div className="w-24 shrink-0 text-sm font-semibold tabular-nums text-slate-600">
          {x.av.zeitVon ? `${x.av.zeitVon}–${x.av.zeitBis}` : '–'}
          {compact && x.av.datum && <div className="text-xs font-normal">{fmtDate(x.av.datum).slice(0, 6)}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 font-semibold">
            {x.av.thema} <FachbereichTags list={x.av.fachbereiche} />
            {!!x.av.attachmentCount && <span className="text-xs font-normal text-slate-500">📎 {x.av.attachmentCount}</span>}
          </div>
          <div className="text-sm text-slate-500">
            {[x.zugName, x.av.arbeitsplatz, x.av.stufe && t(`stufe.${x.av.stufe}`)].filter(Boolean).join(' · ')}
          </div>
          {!compact && (
            <div className="mt-0.5 text-xs text-slate-500">
              {x.av.leiter ? t('my.lead', { name: x.av.leiter }) : t('my.nobody')} · {x.wkTitle}
            </div>
          )}
        </div>
        <div className="w-24 shrink-0 text-right">
          <div className="text-xs text-slate-500">
            {t('my.prep', { done: p.done, total: p.total })}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200">
            <div className={`h-full ${color}`} style={{ width: `${(p.done / p.total) * 100}%` }} />
          </div>
        </div>
      </div>
    </Link>
  );
}
