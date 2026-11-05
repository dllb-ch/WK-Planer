import { useEffect, useState } from 'react';
import { FileLink } from '../components/FileArea';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Ausbildungsbefehl, AuftragKp, WkSync } from '@shared/types';
import { canEditBefehl } from '@shared/permissions';
import { fmtDate, wkDays } from '@shared/util';
import { api, type WkSummary } from '../api';
import { useUser } from '../auth';
import { Button, Card, Empty, errMsg, Field, TextArea, useToast } from '../components/ui';
import { useT } from '../i18n';
import { currentT } from '../lib/lang';

type Draft = Omit<Ausbildungsbefehl, 'id' | 'batId' | 'year'>;
const empty = (): Draft => ({ dienstart: 'Wiederholungskurse nach Art. 53 BZG', leitziel: '', absicht: '', organisation: '', besonderes: '', auftraege: [], files: [] });

export function BefehlPage() {
  const { t } = useT();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const editable = canEditBefehl(me);
  const years = useQuery({ queryKey: ['befehle'], queryFn: api.befehlYears });
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const wks = useQuery({ queryKey: ['wks'], queryFn: api.wks });
  const [year, setYear] = useState<number | null>(null);
  const [newYears, setNewYears] = useState<number[]>([]);
  const activeYear = year ?? years.data?.[0] ?? new Date().getFullYear() + 1;
  const q = useQuery({ queryKey: ['befehl', activeYear], queryFn: () => api.befehl(activeYear), enabled: years.isSuccess });
  const [d, setD] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.isSuccess && !dirty) setD(q.data ? { ...q.data } : editable ? empty() : null);
  }, [q.isSuccess, q.data, dirty, editable]);

  const set = (patch: Partial<Draft>) => {
    setD({ ...d!, ...patch });
    setDirty(true);
  };
  const kompanien = org.data?.kompanien ?? [];
  const auftrag = (kpId: number): AuftragKp =>
    d?.auftraege.find((a) => a.kpId === kpId) ?? { kpId, richtziele: '', teilnehmende: '', kvkDates: [], wkFrom: '', wkTo: '' };
  const setAuftrag = (kpId: number, patch: Partial<AuftragKp>) =>
    set({ auftraege: [...d!.auftraege.filter((a) => a.kpId !== kpId), { ...auftrag(kpId), ...patch }] });

  const save = async () => {
    try {
      // The dates are planned in the Jahresplanung (the WKs themselves); old dates of the Auftrag would move them back.
      const saved = await api.saveBefehl(activeYear, { ...d!, auftraege: d!.auftraege.map((a) => ({ ...a, kvkDates: [], wkFrom: '', wkTo: '' })) });
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['befehl', activeYear] });
      qc.invalidateQueries({ queryKey: ['befehle'] });
      qc.invalidateQueries({ queryKey: ['wks'] });
      toast([t('bef.saved'), ...saved.wks.map(syncText).filter(Boolean)].join(' · '));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const yearOptions = Array.from(new Set([...(years.data ?? []), activeYear, ...newYears])).sort((a, b) => b - a);
  const switchYear = (y: number) => {
    if (dirty && !confirm(t('bef.discard'))) return;
    setYear(y);
    setDirty(false);
    setD(null);
  };
  const addYear = () => {
    const proposal = Math.max(new Date().getFullYear(), ...yearOptions) + 1;
    const input = prompt(t('bef.whichYear'), String(proposal));
    const y = Number(input);
    if (!input || !Number.isInteger(y) || y < 2000 || y > 2100) return;
    setNewYears([...newYears, y]);
    switchYear(y);
  };
  const files = q.data?.files ?? [];
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await api.uploadBefehlFile(activeYear, file);
      qc.invalidateQueries({ queryKey: ['befehl', activeYear] });
      qc.invalidateQueries({ queryKey: ['befehle'] });
      toast(t('bef.attached', { name: file.name }));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const wksOf = (kpId: number) =>
    (wks.data ?? [])
      .filter((w) => w.kpId === kpId && !w.archived && wkDays(w).some((x) => x.startsWith(String(activeYear))))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const shownKps = editable ? kompanien : kompanien.filter((k) => d?.auftraege.some((a) => a.kpId === k.id));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{t('bef.title')}</h1>
          <select
            className="input no-print !w-auto"
            value={activeYear}
            onChange={(e) => switchYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          {editable && (
            <Button className="no-print" onClick={addYear}>
              {t('bef.newYear')}
            </Button>
          )}
          <span className="flex-1" />
          <Button className="no-print" onClick={() => window.print()}>
            {t('common.print')}
          </Button>
          {editable && (
            <Button className="no-print" variant="primary" disabled={!dirty} onClick={save}>
              {t('common.save')}
            </Button>
          )}
        </div>
        {!editable && <p className="text-sm text-slate-500">{t('bef.readOnly')}</p>}

        {!d ? (
          <Card>
            <Empty>{t('bef.noneForYear', { year: activeYear })}</Empty>
          </Card>
        ) : (
          <>
            <Card
              title={t('bef.documents')}
              actions={
                editable && (
                  <label className="no-print cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    {t('bef.attachPdf')}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      onChange={(e) => upload(e.target.files?.[0]).then(() => (e.target.value = ''))}
                    />
                  </label>
                )
              }
            >
              {files.length === 0 ? (
                <p className="text-sm text-slate-400">{editable ? t('bef.attachHint') : t('bef.noDocs')}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <span aria-hidden>📄</span>
                      <FileLink url={api.befehlFileUrl(activeYear, f.id)} className="text-zs-blue hover:underline">
                        {f.name}
                      </FileLink>
                      <span className="text-xs text-slate-500">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                      {editable && (
                        <button
                          className="no-print ml-auto text-xs text-slate-400 hover:text-red-600"
                          onClick={async () => {
                            if (!confirm(`«${f.name}» entfernen?`)) return;
                            await api.deleteBefehlFile(activeYear, f.id);
                            qc.invalidateQueries({ queryKey: ['befehl', activeYear] });
                          }}
                        >
                          {t('common.remove')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={t('bef.s1')}>
              <Text value={d.dienstart} editable={editable} onChange={(v) => set({ dienstart: v })} rows={1} />
            </Card>
            <Card title={t('bef.s2')}>
              <Text value={d.leitziel} editable={editable} onChange={(v) => set({ leitziel: v })} />
            </Card>
            <Card title={t('bef.s3')}>
              <Text value={d.absicht} editable={editable} onChange={(v) => set({ absicht: v })} />
            </Card>
            <Card title={t('bef.s4')}>
              {shownKps.length === 0 && <Empty>{t('bef.noTasks')}</Empty>}
              <div className="space-y-4">
                {shownKps.map((k) => {
                  const a = auftrag(k.id);
                  return (
                    <div key={k.id} className="rounded-md border border-slate-200 p-3">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold">{k.name}</h3>
                        {editable && (
                          <Link to="/jahresplanung" className="no-print text-sm text-zs-blue hover:underline">
                            {t('bef.datesInYearPlan')}
                          </Link>
                        )}
                      </div>
                      {editable ? (
                        <div className="space-y-2">
                          <Field label={t('bef.richtziele')}>
                            <TextArea value={a.richtziele} onChange={(e) => setAuftrag(k.id, { richtziele: e.target.value })} />
                          </Field>
                          <Field label={t('bef.teilnehmende')}>
                            <input className="input" value={a.teilnehmende} onChange={(e) => setAuftrag(k.id, { teilnehmende: e.target.value })} />
                          </Field>
                          <Dienste wks={wksOf(k.id)} />
                        </div>
                      ) : (
                        <div className="space-y-1 text-sm">
                          <p className="whitespace-pre-wrap">{a.richtziele}</p>
                          <p className="text-slate-600">
                            <b>{t('bef.teilnehmendeBold')}</b> {a.teilnehmende || '–'}
                          </p>
                          <Dienste wks={wksOf(k.id)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title={t('bef.s5')}>
              <Text value={d.organisation} editable={editable} onChange={(v) => set({ organisation: v })} />
            </Card>
            <Card title={t('bef.s6')}>
              <Text value={d.besonderes} editable={editable} onChange={(v) => set({ besonderes: v })} />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Text({ value, editable, onChange, rows = 3 }: { value: string; editable: boolean; onChange: (v: string) => void; rows?: number }) {
  return editable ? (
    <TextArea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <p className="whitespace-pre-wrap text-sm">{value || '–'}</p>
  );
}

/** The Dienstleistungen of a Kp in the year, as planned in the Jahresplanung. */
function Dienste({ wks }: { wks: WkSummary[] }) {
  const { t } = useT();
  if (wks.length === 0) return <p className="text-sm text-slate-500">{t('bef.noWkYet')}</p>;
  return (
    <ul className="space-y-0.5 text-sm text-slate-600">
      {wks.map((w) => (
        <li key={w.id}>
          <Link to={`/wk/${w.id}`} className="font-medium text-zs-blue hover:underline print:text-black">
            {w.title}
          </Link>
          {w.avorDays.length > 0 && <> · <b>{t('duty.AVOR')}:</b> {w.avorDays.map(fmtDate).join(', ')}</>}
          {w.kvkDays.length > 0 && <> · <b>{t('duty.KVK')}:</b> {w.kvkDays.map(fmtDate).join(', ')}</>} · <b>{t('duty.WK')}:</b> {fmtDate(w.startDate)} – {fmtDate(w.endDate)}
        </li>
      ))}
    </ul>
  );
}

const syncText = (w: WkSync) =>
  w.action === 'created'
    ? currentT('bef.sync.created', { kp: w.kpName })
    : w.action === 'linked'
      ? currentT('bef.sync.linked', { kp: w.kpName })
      : w.action === 'updated'
        ? currentT('bef.sync.updated', { kp: w.kpName })
        : w.action === 'locked'
          ? currentT('bef.sync.locked', { kp: w.kpName })
          : '';
