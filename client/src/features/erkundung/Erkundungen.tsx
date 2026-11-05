// Erkundungsprotokoll (Anhänge S. 33–38): list of a WK and the protocol itself.
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckState, Erkundung, ErkundungInput, RiskLevel } from '@shared/types';
import { canCreateErkundung, canEditErkundung } from '@shared/permissions';
import { ERKUNDUNG_CHECKLISTE, erkundungProgress } from '@shared/einsatz';
import { fmtDate } from '@shared/util';
import { api, ApiError, type WkDetail } from '../../api';
import { Briefkopf, usePrintPage } from '../../components/Briefkopf';
import { useUser } from '../../auth';
import { Button, Card, Empty, errMsg, Field, Modal, TextArea, useToast } from '../../components/ui';
import { FileArea } from '../../components/FileArea';
import { RowsEditor } from '../../components/RowsEditor';
import { SwissMap } from '../../components/SwissMap';
import { useAutosave } from '../../components/useAutosave';
import { useT } from '../../i18n';
import { currentT } from '../../lib/lang';
import { isKey, type Key } from '@shared/i18n';

const strip = ({ id: _i, wkId: _w, createdBy: _c, createdByName: _n, updatedAt: _u, attachmentCount: _a, ...rest }: Erkundung): ErkundungInput => rest;

export function ErkundungenPage({ detail }: { detail: WkDetail }) {
  const { t } = useT();
  const me = useUser();
  const { wk, zuege } = detail;
  const q = useQuery({ queryKey: ['erkundungen', wk.id], queryFn: () => api.erkundungen(wk.id) });
  const [creating, setCreating] = useState(false);
  const scopes = [
    ...(canCreateErkundung(me, wk, null) ? [{ id: null as number | null, name: t('common.kompanie') }] : []),
    ...zuege.filter((z) => canCreateErkundung(me, wk, z.id)).map((z) => ({ id: z.id as number | null, name: z.name })),
  ];
  const zugName = (id: number | null) => (id === null ? t('common.kompanie') : (zuege.find((z) => z.id === id)?.name ?? ''));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
        <Card
          title={t('erk.title')}
          actions={
            scopes.length > 0 && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('erk.add')}
              </Button>
            )
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            {t('erk.intro')}
          </p>
          {q.isLoading ? (
            <Empty>{t('common.loading')}</Empty>
          ) : !q.data?.length ? (
            <Empty>{t('erk.none')}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {q.data.map((e) => {
                const p = erkundungProgress(e);
                return (
                  <li key={e.id}>
                    <Link to={`${e.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-slate-50">
                      <span className="w-24 shrink-0 text-sm tabular-nums text-slate-500">{e.datum ? fmtDate(e.datum) : '–'}</span>
                      <span className="min-w-0 flex-1 font-medium text-zs-blue">
                        {e.title}
                        {e.ort && <span className="font-normal text-slate-500"> · {e.ort}</span>}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{zugName(e.zugId)}</span>
                      {e.beurteilung && <RiskBadge level={e.beurteilung} />}
                      {!!e.attachmentCount && <span className="text-xs text-slate-500">📎 {e.attachmentCount}</span>}
                      <span className="w-16 text-right text-xs tabular-nums text-slate-500">
                        {p.done}/{p.total}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      {creating && <NewErkundung detail={detail} scopes={scopes} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewErkundung({ detail, scopes, onClose }: { detail: WkDetail; scopes: { id: number | null; name: string }[]; onClose: () => void }) {
  const { t } = useT();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ title: '', zugId: scopes[0]?.id ?? null, datum: '' });
  const create = async () => {
    try {
      const e = await api.createErkundung(detail.wk.id, { ...f, title: f.title.trim() });
      nav(`${e.id}`);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };
  return (
    <Modal
      title={t('erk.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!f.title.trim()} onClick={create}>
            {t('erk.create')}
          </Button>
        </>
      }
    >
      <Field label={t('dash.designation')}>
        <input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('erk.titlePh')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('std.for')}>
          <select className="input" value={f.zugId ?? ''} disabled={scopes.length < 2} onChange={(e) => setF({ ...f, zugId: e.target.value ? Number(e.target.value) : null })}>
            {scopes.map((s) => (
              <option key={s.id ?? 'kp'} value={s.id ?? ''}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('erk.date')}>
          <input type="date" className="input" value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

const RISK_COLOR: Record<Exclude<RiskLevel, ''>, string> = { HOCH: 'bg-red-100 text-red-800', MITTEL: 'bg-amber-100 text-amber-800', TIEF: 'bg-emerald-100 text-emerald-800' };
const RISK_LEVELS: Exclude<RiskLevel, ''>[] = ['HOCH', 'MITTEL', 'TIEF'];
const RiskBadge = ({ level }: { level: Exclude<RiskLevel, ''> }) => (
  <span className={`rounded px-1.5 text-xs font-medium ${RISK_COLOR[level]}`}>{currentT('erk.riskOf', { level: currentT(`erk.level.${level}`) })}</span>
);

function RiskSelect({ value, onChange, disabled }: { value: RiskLevel; onChange: (v: RiskLevel) => void; disabled: boolean }) {
  const { t } = useT();
  return (
    <select className="input text-sm" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as RiskLevel)} aria-label={t('erk.risk')}>
      <option value="">–</option>
      {RISK_LEVELS.map((k) => (
        <option key={k} value={k}>
          {t(`erk.level.${k}`)}
        </option>
      ))}
    </select>
  );
}

const CHECK: { v: Exclude<CheckState, ''>; cls: string }[] = [
  { v: 'OK', cls: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { v: 'OFFEN', cls: 'border-amber-500 bg-amber-50 text-amber-800' },
  { v: 'NA', cls: 'border-slate-400 bg-slate-100 text-slate-600' },
];

function Section({ n, title, hint, children }: { n: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold">
        {n} {title}
      </h2>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function ErkundungPage({ detail }: { detail: WkDetail }) {
  const { t } = useT();
  const { eid } = useParams();
  const me = useUser();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const id = Number(eid);
  const q = useQuery({ queryKey: ['erkundung', wk.id, id], queryFn: () => api.erkundung(wk.id, id) });
  const loaded = q.data ? strip(q.data) : undefined;
  const { value: f, update, state, discard } = useAutosave(loaded, async (v: ErkundungInput) => {
    const saved = await api.updateErkundung(wk.id, id, v);
    qc.setQueryData(['erkundung', wk.id, id], saved);
    qc.invalidateQueries({ queryKey: ['erkundungen', wk.id] });
  });
  usePrintPage([t('erk.protocol'), q.data?.title, wk.title].filter(Boolean).join(' · '));

  if (q.error) return <div className="p-6 text-slate-600">{q.error instanceof ApiError && q.error.status === 404 ? t('erk.notFound') : errMsg(q.error)}</div>;
  if (!f || !q.data) return <div className="p-6 text-slate-500">{t('common.loading')}</div>;
  const editable = canEditErkundung(me, wk, q.data);
  const ro = !editable;
  const set = (patch: Partial<ErkundungInput>) => update({ ...f, ...patch });
  const p = erkundungProgress(f);
  const zugName = f.zugId === null ? t('common.kompanie') : (zuege.find((z) => z.id === f.zugId)?.name ?? '');
  const text = (key: 'auftraege' | 'logistik' | 'notizen', placeholder: string, rows = 4) => (
    <TextArea rows={rows} value={f[key]} disabled={ro} placeholder={ro ? '' : placeholder} onChange={(e) => set({ [key]: e.target.value })} />
  );
  const remove = async () => {
    if (!confirm(t('erk.confirmDelete'))) return;
    try {
      discard();
      await api.deleteErkundung(wk.id, id);
      qc.invalidateQueries({ queryKey: ['erkundungen', wk.id] });
      nav('../erkundungen');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="print-flow min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link to="../erkundungen" className="text-sm text-slate-500 hover:text-zs-blue">
            ← Erkundungen
          </Link>
          <span className="flex-1" />
          <span className="text-xs text-slate-500">{editable ? t(`save.${state}`) : t('ueb.readOnly')}</span>
          <span className="text-xs tabular-nums text-slate-500">
            {p.done}/{p.total} Abschnitte
          </span>
          <Button onClick={() => window.print()}>{t('av.printPdf')}</Button>
          {editable && (
            <Button variant="ghost" className="text-red-700" onClick={remove}>
              {t('common.delete')}
            </Button>
          )}
        </div>

        <header className="space-y-1">
          <Briefkopf printOnly />
          <h1 className="text-2xl font-semibold">
            {t('erk.protocol')} <span className="text-slate-500 print:text-black">– {f.title}</span>
          </h1>
          {!ro && (
            <input className="input no-print" value={f.title} onChange={(e) => set({ title: e.target.value })} aria-label={t('dash.designation')} />
          )}
        </header>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
          <Field label={t('erk.date')}>
            <div className="flex gap-2">
              <input type="date" className="input" disabled={ro} value={f.datum} onChange={(e) => set({ datum: e.target.value })} />
              <input type="time" className="input !w-28" disabled={ro} value={f.zeit} onChange={(e) => set({ zeit: e.target.value })} aria-label={t('common.time')} />
            </div>
          </Field>
          <Field label={t('erk.formation')}>
            <input className="input" disabled={ro} value={f.formation} onChange={(e) => set({ formation: e.target.value })} placeholder={t('erk.formationPh')} />
          </Field>
          <Field label={t('erk.ort')}>
            <input className="input" disabled={ro} value={f.ort} onChange={(e) => set({ ort: e.target.value })} />
          </Field>
          <Field label={t('erk.coords')}>
            <input className="input" disabled={ro} value={f.koordinaten} onChange={(e) => set({ koordinaten: e.target.value })} placeholder="2'600'000 / 1'200'000" />
          </Field>
          <Field label={t('erk.dauer')}>
            <div className="flex items-center gap-2">
              <input type="date" className="input" disabled={ro} value={f.dauerVon} onChange={(e) => set({ dauerVon: e.target.value })} aria-label={t('ueb.from')} />
              <span className="text-slate-400">bis</span>
              <input type="date" className="input" disabled={ro} value={f.dauerBis} onChange={(e) => set({ dauerBis: e.target.value })} aria-label={t('ueb.to')} />
            </div>
          </Field>
          <Field label={t('erk.author')}>
            <input className="input" disabled={ro} value={f.verfasser} onChange={(e) => set({ verfasser: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <span className="label">{t('erk.institution')}</span>
            <RowsEditor
              rows={f.kontakte}
              readOnly={ro}
              onChange={(kontakte) => set({ kontakte })}
              empty={() => ({ institution: '', telefon: '', email: '' })}
              addLabel={t('erk.addContact')}
              columns={[
                { key: 'institution', label: t('erk.institution'), width: '2fr', placeholder: t('erk.institutionPh') },
                { key: 'telefon', label: t('erk.telefonPikett'), placeholder: '+41 …' },
                { key: 'email', label: t('login.email') },
              ]}
            />
          </div>
        </section>

        <Section n="1" title={t('erk.s1')}>
          {text('auftraege', t('erk.s1Ph'))}
        </Section>

        <Section n="2" title={t('erk.s2')} hint={t('erk.s2Hint')}>
          <FileArea
            queryKey={['erkundung-files', id]}
            load={() => api.erkundungAttachments(id)}
            upload={(file, pr) => api.uploadErkundungAttachment(id, file, pr)}
            canUpload={editable}
            emptyText={t('erk.noSketch')}
            gallery
          />
          <div className="no-print">
            <SwissMap value={f.area} onChange={ro ? undefined : (area) => set({ area })} height={300} />
          </div>
        </Section>

        <Section n="3" title={t('erk.s3')}>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['mensch', t('erk.mensch')],
                ['material', t('av.material')],
                ['methode', t('erk.methode')],
                ['mitwelt', t('erk.mitwelt')],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <TextArea rows={3} disabled={ro} value={f.gefahren[k]} onChange={(e) => set({ gefahren: { ...f.gefahren, [k]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </Section>

        <Section n="4" title={t('erk.s4')} hint={t('erk.s4Hint')}>
          <RowsEditor
            rows={f.risiken}
            readOnly={ro}
            onChange={(risiken) => set({ risiken })}
            empty={() => ({ risiko: '', massnahmen: '', wer: '', restrisiko: '' as RiskLevel })}
            addLabel={t('erk.addRisk')}
            columns={[
              { key: 'risiko', label: t('erk.risk'), width: '2fr', multiline: true },
              { key: 'massnahmen', label: t('erk.massnahmen'), width: '2fr', multiline: true },
              { key: 'wer', label: t('erk.wer'), width: '6rem' },
              {
                key: 'restrisiko',
                label: t('erk.restrisiko'),
                width: '7rem',
                render: (r, s, readOnly) => <RiskSelect value={r.restrisiko} disabled={readOnly} onChange={(restrisiko) => s({ restrisiko })} />,
              },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{t('erk.beurteilung')}</span>
            {RISK_LEVELS.map((k) => (
              <label key={k} className={`flex items-center gap-1 rounded-md border px-2 py-1 ${f.beurteilung === k ? RISK_COLOR[k] : 'border-slate-300'}`}>
                <input type="radio" disabled={ro} checked={f.beurteilung === k} onChange={() => set({ beurteilung: k })} /> {t(`erk.level.${k}`)}
              </label>
            ))}
          </div>
        </Section>

        <Section n="5" title={t('erk.s5')}>
          <Field label={t('erk.sammelplatz')}>
            <input className="input" disabled={ro} value={f.notfall.ort} onChange={(e) => set({ notfall: { ...f.notfall, ort: e.target.value } })} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-[1fr,10rem]">
            {(
              [
                ['spital', 'spitalTel', t('erk.spital')],
                ['ambulanz', 'ambulanzTel', t('erk.ambulanz')],
                ['luftrettung', 'luftrettungTel', t('erk.luftrettung')],
              ] as const
            ).map(([k, tel, label]) => (
              <div key={k} className="contents">
                <Field label={t('erk.placeOf', { label })}>
                  <input className="input" disabled={ro} value={f.notfall[k]} onChange={(e) => set({ notfall: { ...f.notfall, [k]: e.target.value } })} />
                </Field>
                <Field label={t('erk.contactNo')}>
                  <input className="input" disabled={ro} value={f.notfall[tel]} onChange={(e) => set({ notfall: { ...f.notfall, [tel]: e.target.value } })} />
                </Field>
              </div>
            ))}
          </div>
          <Field label={t('erk.extra')}>
            <TextArea rows={2} disabled={ro} value={f.notfall.massnahmen} onChange={(e) => set({ notfall: { ...f.notfall, massnahmen: e.target.value } })} />
          </Field>
        </Section>

        <Section n="6" title={t('erk.s6')}>
          <RowsEditor
            rows={f.arbeiten}
            readOnly={ro}
            onChange={(arbeiten) => set({ arbeiten })}
            empty={() => ({ was: '', personal: '', verantwortung: '', mittel: '' })}
            addLabel="+ Arbeit"
            columns={[
              { key: 'was', label: t('erk.was'), width: '2fr', multiline: true },
              { key: 'personal', label: t('erk.personal'), width: '6rem' },
              { key: 'verantwortung', label: t('erk.verantwortung'), width: '8rem' },
              { key: 'mittel', label: t('erk.mittelQ'), width: '2fr', multiline: true },
            ]}
          />
        </Section>

        <Section n="7" title={t('erk.s7')} hint={t('erk.s7Hint')}>
          {text('logistik', '')}
        </Section>

        <Section n="8" title={t('erk.s8')}>
          {ERKUNDUNG_CHECKLISTE.map((g, gi) => (
            <div key={g.group} className="break-inside-avoid">
              <h3 className="mb-1 mt-2 text-sm font-semibold text-slate-700">{t(`erk.g.${gi as 0 | 1 | 2 | 3}`)}</h3>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {g.items.map((it) => {
                  const c = f.checkliste[it.key] ?? { state: '' as CheckState, note: '' };
                  const setC = (patch: Partial<typeof c>) => set({ checkliste: { ...f.checkliste, [it.key]: { ...c, ...patch } } });
                  return (
                    <li key={it.key} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                      <span className="min-w-[12rem] flex-1">{isKey(`erk.i.${it.key}`) ? t(`erk.i.${it.key}` as Key) : it.text}</span>
                      <span className="flex gap-1">
                        {CHECK.map((o) => (
                          <button
                            key={o.v}
                            type="button"
                            disabled={ro}
                            aria-pressed={c.state === o.v}
                            onClick={() => setC({ state: c.state === o.v ? '' : o.v })}
                            className={`rounded-full border px-2 py-0.5 text-xs ${c.state === o.v ? o.cls : 'border-slate-200 text-slate-400 print:hidden'}`}
                          >
                            {t(`erk.check.${o.v}`)}
                          </button>
                        ))}
                      </span>
                      {(!ro || c.note) && (
                        <input
                          className="input w-full py-0.5 text-xs sm:w-56"
                          disabled={ro}
                          value={c.note}
                          placeholder={ro ? '' : t('erk.note')}
                          onChange={(e) => setC({ note: e.target.value })}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </Section>

        <Section n="9" title={t('erk.s9')}>{text('notizen', '')}</Section>

        <p className="pt-6 text-sm">
          Der Zugführer: <span className="inline-block min-w-[12rem] border-b border-slate-400">{f.verfasser}</span>
        </p>
      </div>
    </div>
  );
}
