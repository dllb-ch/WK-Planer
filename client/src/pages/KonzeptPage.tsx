import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { WkKonzept, Zielsetzung, Zug } from '@shared/types';
import { canEditKonzept } from '@shared/permissions';
import { fmtDate } from '@shared/util';
import { api, type WkDetail } from '../api';
import { Briefkopf, usePrintPage } from '../components/Briefkopf';
import { useUser } from '../auth';
import { Button, Card, errMsg, TextArea, useToast } from '../components/ui';
import { useT } from '../i18n';

/** Sections of the WK-Konzept; titles and hints: konz.s.<key>, konz.h.<key>. */
const SECTIONS: { key: Exclude<keyof WkKonzept, 'wkId' | 'zielsetzungen'> }[] = [
  { key: 'orientierung' },
  { key: 'organisation' },
  { key: 'absicht' },
  { key: 'verpflegung' },
  { key: 'material' },
  { key: 'standorte' },
];

export function KonzeptPage({ detail }: { detail: WkDetail }) {
  const { t } = useT();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk } = detail;
  const q = useQuery({ queryKey: ['konzept', wk.id], queryFn: () => api.konzept(wk.id) });
  const [k, setK] = useState<WkKonzept | null>(null);
  const [dirty, setDirty] = useState(false);
  const editable = canEditKonzept(me, wk);
  usePrintPage(`WK-Konzept · ${wk.title}`);

  useEffect(() => {
    if (q.data && !dirty) setK(q.data);
  }, [q.data, dirty]);

  if (!k) return <div className="p-6 text-slate-500">{t('common.loading')}</div>;
  const set = (patch: Partial<WkKonzept>) => {
    setK({ ...k, ...patch });
    setDirty(true);
  };
  const save = async () => {
    try {
      const { wkId: _w, ...data } = k;
      await api.saveKonzept(wk.id, data);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['konzept', wk.id] });
      toast('WK-Konzept gespeichert');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Briefkopf printOnly />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('konz.title')}</h2>
            <p className="text-sm text-slate-500">
              {wk.title}, {fmtDate(wk.startDate)} – {fmtDate(wk.endDate)}
              {!editable && ' · nur lesen'}
            </p>
          </div>
          <div className="no-print flex gap-2">
            <Button onClick={() => window.print()}>{t('common.print')}</Button>
            {editable && (
              <Button variant="primary" disabled={!dirty} onClick={save}>
                {t('common.save')}
              </Button>
            )}
          </div>
        </div>
        {SECTIONS.slice(0, 3).map((s) => (
          <Section key={s.key} title={t(`konz.s.${s.key}`)} hint={t(`konz.h.${s.key}`)} value={k[s.key]} editable={editable} onChange={(v) => set({ [s.key]: v })} />
        ))}
        <Card title={t('konz.s3')}>
          <p className="no-print mb-2 text-xs text-slate-500">{t('konz.s3hint')}</p>
          <ZieleEditor items={k.zielsetzungen} zuege={detail.zuege} onChange={(v) => set({ zielsetzungen: v })} readOnly={!editable} />
        </Card>
        {SECTIONS.slice(3).map((s) => (
          <Section key={s.key} title={t(`konz.s.${s.key}`)} hint={t(`konz.h.${s.key}`)} value={k[s.key]} editable={editable} onChange={(v) => set({ [s.key]: v })} />
        ))}
      </div>
    </div>
  );
}

function Section({ title, hint, value, editable, onChange }: { title: string; hint: string; value: string; editable: boolean; onChange: (v: string) => void }) {
  const { t } = useT();
  return (
    <Card title={title}>
      {editable ? (
        <TextArea rows={4} value={value} placeholder={hint} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p className="whitespace-pre-wrap text-sm">{value || <span className="text-slate-400">–</span>}</p>
      )}
    </Card>
  );
}

/** Zielsetzungen, each for all Züge or for selected ones. */
function ZieleEditor({ items, zuege, onChange, readOnly }: { items: Zielsetzung[]; zuege: Zug[]; onChange: (v: Zielsetzung[]) => void; readOnly: boolean }) {
  const { t } = useT();
  const forWhom = (z: Zielsetzung) => (z.zugIds.length ? zuege.filter((x) => z.zugIds.includes(x.id)).map((x) => x.name).join(', ') : t('konz.allZuege'));
  if (readOnly) {
    return items.length ? (
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {items.map((z, i) => (
          <li key={i} className="whitespace-pre-wrap">
            {z.text} <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{forWhom(z)}</span>
          </li>
        ))}
      </ol>
    ) : (
      <p className="text-sm text-slate-400">–</p>
    );
  }
  const setItem = (i: number, patch: Partial<Zielsetzung>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-3">
      {items.map((z, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 w-5 text-right text-sm text-slate-500">{i + 1}.</span>
          <div className="min-w-0 flex-1 space-y-1">
            <TextArea rows={2} value={z.text} placeholder={t('konz.zielPh')} onChange={(e) => setItem(i, { text: e.target.value })} />
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-slate-500">{t('konz.for')}</span>
              <button
                type="button"
                aria-pressed={z.zugIds.length === 0}
                onClick={() => setItem(i, { zugIds: [] })}
                className={`rounded-full border px-2 py-0.5 ${z.zugIds.length === 0 ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              >
                {t('konz.allZuege')}
              </button>
              {zuege.map((x) => {
                const on = z.zugIds.includes(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setItem(i, { zugIds: on ? z.zugIds.filter((id) => id !== x.id) : [...z.zugIds, x.id] })}
                    className={`rounded-full border px-2 py-0.5 ${on ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {on ? '✓ ' : ''}
                    {x.name}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="mt-2 text-slate-400 hover:text-red-600" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
            ✕
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...items, { text: '', zugIds: [] }])}>
        {t('konz.addZiel')}
      </Button>
    </div>
  );
}

