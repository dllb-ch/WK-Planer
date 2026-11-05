// Übungen: Übungskonzept, Drehbuch (only for the Übungsleitung), Übungsunterlagen for the Beübte, Übungsbesprechung (AAR).
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DrehbuchEintrag, Uebung, UebungInput, Zielerreichung } from '@shared/types';
import { canCreateUebung, canEditUebung } from '@shared/permissions';
import { fmtDate, fmtTime } from '@shared/util';
import { api, ApiError, type WkDetail } from '../../api';
import { Briefkopf, usePrintPage } from '../../components/Briefkopf';
import { useUser } from '../../auth';
import { Button, Card, Empty, errMsg, Field, TextArea, useToast } from '../../components/ui';
import { FileArea } from '../../components/FileArea';
import { RowsEditor } from '../../components/RowsEditor';
import { SwissMap } from '../../components/SwissMap';
import { useAutosave } from '../../components/useAutosave';
import { useKpPeople } from '../rapporte/Pendenzen';
import { useT } from '../../i18n';

const strip = ({ id: _i, wkId: _w, createdBy: _c, createdByName: _n, updatedAt: _u, attachmentCount: _a, drehbuchHidden: _h, ...rest }: Uebung): UebungInput => rest;

export function UebungenPage({ detail }: { detail: WkDetail }) {
  const { t, weekdayShort } = useT();
  const me = useUser();
  const nav = useNavigate();
  const toast = useToast();
  const { wk, zuege, blocks } = detail;
  const q = useQuery({ queryKey: ['uebungen', wk.id], queryFn: () => api.uebungen(wk.id) });
  const list = q.data ?? [];
  const canNew = canCreateUebung(me, wk);
  const names = (ids: number[]) => zuege.filter((z) => ids.includes(z.id)).map((z) => z.name).join(', ');
  // «Übung» blocks in the Arbeitsprogramm without a prepared Übung.
  const planned = blocks
    .filter((b) => b.type === 'UEBUNG' && !list.some((x) => x.blockId === b.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const create = async (b: Partial<UebungInput> & { title: string }) => {
    try {
      const x = await api.createUebung(wk.id, b);
      nav(`${x.id}`);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
        <Card
          title={t('ueb.title')}
          actions={
            canNew && (
              <Button variant="primary" onClick={() => create({ title: t('ueb.new') })}>
                {t('ueb.add')}
              </Button>
            )
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            {t('ueb.intro')}
          </p>
          {q.isLoading ? (
            <Empty>{t('common.loading')}</Empty>
          ) : list.length === 0 ? (
            <Empty>{t('ueb.none')}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((x) => {
                const assessed = x.ziele.filter((z) => z.erreicht).length;
                return (
                  <li key={x.id}>
                    <Link to={`${x.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-slate-50">
                      <span className="w-24 shrink-0 text-sm tabular-nums text-slate-500">{x.datum ? fmtDate(x.datum) : '–'}</span>
                      <span className="min-w-0 flex-1 font-medium text-zs-blue">
                        {x.title}
                        <span className="font-normal text-slate-500"> · {x.art}</span>
                      </span>
                      {x.beuebteZugIds.length > 0 && <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{names(x.beuebteZugIds)}</span>}
                      {!x.drehbuchHidden && <span className="text-xs text-slate-500">{x.drehbuch.length} Einspielungen</span>}
                      {assessed > 0 && <span className="text-xs text-emerald-700">besprochen</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {canNew && planned.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="label">{t('ueb.plannedNotPrepared')}</div>
              <ul className="space-y-1 text-sm">
                {planned.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-3">
                    <span className="w-32 shrink-0 tabular-nums text-slate-500">
                      {weekdayShort(b.date)} {fmtDate(b.date)} {fmtTime(b.startMin)}
                    </span>
                    <span className="flex-1">
                      {b.title} <span className="text-xs text-slate-400">({names(b.zugIds) || t('kdo')})</span>
                    </span>
                    <Button
                      className="py-0.5 text-xs"
                      onClick={() =>
                        create({
                          title: b.title,
                          blockId: b.id,
                          datum: b.date,
                          zeitVon: fmtTime(b.startMin),
                          zeitBis: fmtTime(b.endMin),
                          beuebteZugIds: b.zugIds.filter((z) => z !== 0),
                          ort: detail.locations.find((l) => l.id === b.locationId)?.name ?? '',
                        })
                      }
                    >
                      {t('ueb.prepare')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

type Part = 'konzept' | 'drehbuch' | 'unterlagen' | 'besprechung';
const PARTS: Part[] = ['konzept', 'drehbuch', 'unterlagen', 'besprechung'];

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function UebungPage({ detail }: { detail: WkDetail }) {
  const { t, weekday } = useT();
  const { uid } = useParams();
  const me = useUser();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const id = Number(uid);
  const q = useQuery({ queryKey: ['uebung', wk.id, id], queryFn: () => api.uebung(wk.id, id) });
  const loaded = q.data ? strip(q.data) : undefined;
  const { value: f, update, state, discard } = useAutosave(loaded, async (v: UebungInput) => {
    const saved = await api.updateUebung(wk.id, id, v);
    qc.setQueryData(['uebung', wk.id, id], saved);
    qc.invalidateQueries({ queryKey: ['uebungen', wk.id] });
  });
  const people = useKpPeople(wk.kpId);
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [part, setPart] = useState<Part>('konzept');
  usePrintPage([PARTS.find(([p]) => p === part)?.[1], q.data?.title, wk.title].filter(Boolean).join(' · '));

  if (q.error) return <div className="p-6 text-slate-600">{q.error instanceof ApiError && q.error.status === 404 ? t('ueb.notFound') : errMsg(q.error)}</div>;
  if (!f || !q.data) return <div className="p-6 text-slate-500">{t('common.loading')}</div>;
  const editable = canEditUebung(me, wk, q.data);
  const ro = !editable;
  const hidden = !!q.data.drehbuchHidden;
  const set = (patch: Partial<UebungInput>) => update({ ...f, ...patch });
  const parts = PARTS.filter((p) => p !== 'drehbuch' || !hidden);
  const current = parts.includes(part) ? part : 'konzept';
  const beuebte = zuege.filter((z) => f.beuebteZugIds.includes(z.id)).map((z) => z.name).join(', ');
  const when = [f.datum && `${weekday(f.datum)}, ${fmtDate(f.datum)}`, f.zeitVon && `${f.zeitVon}–${f.zeitBis}`].filter(Boolean).join(', ');
  const text = (key: keyof UebungInput & string, label: string, placeholder = '', rows = 3) => (
    <Field label={label}>
      <TextArea rows={rows} disabled={ro} value={String(f[key] ?? '')} placeholder={ro ? '' : placeholder} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  );
  const remove = async () => {
    if (!confirm(t('ueb.confirmDelete'))) return;
    try {
      discard();
      await api.deleteUebung(wk.id, id);
      qc.invalidateQueries({ queryKey: ['uebungen', wk.id] });
      nav('../uebungen');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const header = (subtitle: string) => (
    <header className="space-y-0.5">
      <Briefkopf printOnly />
      <h1 className="text-2xl font-semibold">
        {subtitle} <span className="text-slate-500 print:text-black">– {f.title}</span>
      </h1>
      <p className="text-sm text-slate-600">{[f.art, when, f.ort, beuebte && t('ueb.beuebte', { names: beuebte })].filter(Boolean).join(' · ')}</p>
    </header>
  );

  return (
    <div className="print-flow min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-6">
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link to="../uebungen" className="text-sm text-slate-500 hover:text-zs-blue">
            ← Übungen
          </Link>
          <div className="flex flex-wrap gap-1">
            {parts.map((p) => (
              <button
                key={p}
                onClick={() => setPart(p)}
                className={`rounded-full border px-3 py-1 text-sm ${current === p ? 'border-zs-blue bg-blue-50 font-medium text-zs-blue' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {t(`ueb.part.${p}`)}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <span className="text-xs text-slate-500">{editable ? t(`save.${state}`) : t('ueb.readOnly')}</span>
          <Button onClick={() => window.print()}>{t('av.printPdf')}</Button>
          {editable && (
            <Button variant="ghost" className="text-red-700" onClick={remove}>
              {t('common.delete')}
            </Button>
          )}
        </div>
        {hidden && (
          <p className="no-print rounded-md bg-blue-50 px-3 py-2 text-xs text-slate-600">{t('ueb.drehbuchHint')}</p>
        )}

        {current === 'konzept' && (
          <>
            {header(t('ueb.part.konzept'))}
            <Block title={t('av.eckdaten')}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('dash.designation')}>
                  <input className="input" disabled={ro} value={f.title} onChange={(e) => set({ title: e.target.value })} />
                </Field>
                <Field label={t('ueb.artLabel')}>
                  <input className="input" list="uebung-arten" disabled={ro} value={f.art} onChange={(e) => set({ art: e.target.value })} />
                  <datalist id="uebung-arten">
                    {([0, 1, 2, 3, 4, 5] as const).map((i) => t(`ueb.art.${i}`)).map((a) => (
                      <option key={a} value={a} />
                    ))}
                  </datalist>
                </Field>
                <Field label={t('ueb.dateTime')}>
                  <div className="flex items-center gap-2">
                    <input type="date" className="input" disabled={ro} value={f.datum} onChange={(e) => set({ datum: e.target.value })} />
                    <input type="time" className="input !w-28" disabled={ro} value={f.zeitVon} onChange={(e) => set({ zeitVon: e.target.value })} aria-label={t('ueb.from')} />
                    <input type="time" className="input !w-28" disabled={ro} value={f.zeitBis} onChange={(e) => set({ zeitBis: e.target.value })} aria-label={t('ueb.to')} />
                  </div>
                </Field>
                <Field label={t('ueb.ort')}>
                  <input className="input" disabled={ro} value={f.ort} onChange={(e) => set({ ort: e.target.value })} />
                </Field>
              </div>
              <div>
                <span className="label">{t('ueb.beuebteLabel')}</span>
                <Chips
                  items={zuege.map((z) => ({ id: z.id, label: z.name }))}
                  value={f.beuebteZugIds}
                  disabled={ro}
                  onChange={(beuebteZugIds) => set({ beuebteZugIds })}
                />
              </div>
              <div>
                <span className="label">{t('ueb.leitungLabel')}</span>
                <Chips
                  items={people.map((p) => ({ id: p.id, label: `${p.name} · ${p.funktion || t(`role.${p.role}`)}` }))}
                  value={f.leitungUserIds}
                  disabled={ro}
                  onChange={(leitungUserIds) => set({ leitungUserIds, leitung: people.filter((p) => leitungUserIds.includes(p.id)).map((p) => p.name).join(', ') })}
                />
              </div>
            </Block>
            <Block title={t('ueb.zweckBlock')} hint={t('ueb.zweckHint')}>
              {text('zweck', t('ueb.zweck'), t('ueb.zweckPh'), 2)}
              <RowsEditor
                rows={f.ziele}
                readOnly={ro}
                onChange={(ziele) => set({ ziele })}
                empty={() => ({ text: '', erreicht: '' as Zielerreichung, bemerkung: '' })}
                addLabel={t('ueb.addZiel')}
                columns={[{ key: 'text', label: t('ueb.ziel'), multiline: true, placeholder: t('ueb.zielPh') }]}
              />
            </Block>
            <Block title={t('ueb.lageBlock')}>
              {text('ausgangslage', t('ueb.ausgangslage'), t('ueb.ausgangslagePh'), 4)}
              {text('anlage', t('ueb.anlage'), t('ueb.anlagePh'), 4)}
            </Block>
            <Block title={t('ueb.mittelBlock')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {text('mittel', t('av.mittel'), t('ueb.mittelPh'))}
                {text('sicherheit', t('ueb.sicherheit'), t('ueb.sicherheitPh'))}
                {text('beobachter', t('ueb.beobachter'), t('ueb.beobachterPh'))}
                {text('verbindungen', t('ueb.verbindungen'), t('ueb.verbindungenPh'))}
              </div>
              {text('besonderes', t('ueb.besonderes'), '', 2)}
            </Block>
            <Block title={t('ueb.mapBlock')}>
              <div className="no-print">
                <SwissMap value={f.area} onChange={ro ? undefined : (area) => set({ area })} height={280} />
              </div>
            </Block>
          </>
        )}

        {current === 'drehbuch' && !hidden && (
          <>
            {header(t('ueb.part.drehbuch'))}
            <Block title={t('ueb.einspielungen')} hint={t('ueb.einspielungenHint')}>
              <RowsEditor<DrehbuchEintrag>
                rows={f.drehbuch}
                readOnly={ro}
                onChange={(drehbuch) => set({ drehbuch })}
                empty={() => ({ zeit: '', von: t('ueb.leitung'), an: '', einspielung: '', erwartet: '', mittel: '', erledigt: false })}
                addLabel="+ Einspielung"
                columns={[
                  {
                    key: 'erledigt',
                    label: '✓',
                    width: '1.5rem',
                    render: (r, s) => <input type="checkbox" className="mt-2" checked={r.erledigt} disabled={ro} onChange={(e) => s({ erledigt: e.target.checked })} aria-label={t('ueb.done')} />,
                  },
                  {
                    key: 'zeit',
                    label: t('common.time'),
                    width: '6rem',
                    render: (r, s, readOnly) =>
                      readOnly ? <div className="px-2 py-1 text-sm tabular-nums">{r.zeit}</div> : <input type="time" className="input text-sm" value={r.zeit} onChange={(e) => s({ zeit: e.target.value })} />,
                  },
                  { key: 'von', label: t('bd.from'), width: '7rem' },
                  { key: 'an', label: t('ueb.an'), width: '7rem' },
                  { key: 'einspielung', label: t('ueb.einspielung'), width: '2fr', multiline: true },
                  { key: 'erwartet', label: t('ueb.erwartet'), width: '2fr', multiline: true },
                  { key: 'mittel', label: t('av.mittel'), width: '6rem', placeholder: t('ueb.mittelColPh') },
                ]}
              />
              {!ro && f.drehbuch.length > 1 && (
                <Button className="no-print text-xs" onClick={() => set({ drehbuch: [...f.drehbuch].sort((a, b) => (a.zeit || '99').localeCompare(b.zeit || '99')) })}>
                  {t('ueb.sortByTime')}
                </Button>
              )}
            </Block>
          </>
        )}

        {current === 'unterlagen' && (
          <>
            {header(t('ueb.part.unterlagen'))}
            <Block title={t('ueb.forTrainees')} hint={t('ueb.forTraineesHint')}>
              {text('unterlagenLage', t('ueb.lage'), t('ueb.lagePh'), 5)}
              {text('unterlagenAuftrag', t('ueb.auftrag'), t('ueb.auftragPh'), 4)}
              {text('unterlagenHinweise', t('ueb.hinweise'), t('ueb.hinweisePh'), 3)}
            </Block>
            <Block title={t('bef.documents')} hint={t('ueb.docsHint')}>
              <FileArea
                queryKey={['uebung-files', id]}
                load={() => api.uebungAttachments(id)}
                upload={(file, pr) => api.uploadUebungAttachment(id, file, pr)}
                canUpload={editable}
                emptyText={t('ueb.noDocs')}
                gallery
              />
            </Block>
          </>
        )}

        {current === 'besprechung' && (
          <>
            {header(t('ueb.part.besprechung'))}
            <Block title={t('ueb.zielerreichung')} hint={t('ueb.zielerreichungHint')}>
              {f.ziele.length === 0 && <Empty>{t('ueb.noZiele')}</Empty>}
              <ul className="space-y-2">
                {f.ziele.map((z, i) => (
                  <li key={i} className="break-inside-avoid rounded-md border border-slate-200 p-2">
                    <div className="text-sm font-medium">
                      {i + 1}. {z.text || '–'}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {(['JA', 'TEILWEISE', 'NEIN'] as Exclude<Zielerreichung, ''>[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          disabled={ro}
                          aria-pressed={z.erreicht === k}
                          onClick={() => set({ ziele: f.ziele.map((x, j) => (j === i ? { ...x, erreicht: x.erreicht === k ? '' : k } : x)) })}
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            z.erreicht === k
                              ? k === 'JA'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                : k === 'TEILWEISE'
                                  ? 'border-amber-500 bg-amber-50 text-amber-800'
                                  : 'border-red-500 bg-red-50 text-red-800'
                              : 'border-slate-200 text-slate-500 print:hidden'
                          }`}
                        >
                          {t(`ueb.ziel.${k}`)}
                        </button>
                      ))}
                      <input
                        className="input min-w-[12rem] flex-1 py-0.5 text-sm"
                        disabled={ro}
                        value={z.bemerkung}
                        placeholder={ro ? '' : t('ueb.begruendung')}
                        onChange={(e) => set({ ziele: f.ziele.map((x, j) => (j === i ? { ...x, bemerkung: e.target.value } : x)) })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Block>
            <Block title={t('ueb.aar')} hint={t('ueb.aarHint')}>
              <Field label={t('ueb.besprechungDate')}>
                <input type="date" className="input !w-48" disabled={ro} value={f.besprechung.datum} onChange={(e) => set({ besprechung: { ...f.besprechung, datum: e.target.value } })} />
              </Field>
              {(
                [
                  ['verlauf', t('ueb.verlauf')],
                  ['positiv', t('ueb.positiv')],
                  ['verbessern', t('ueb.verbessern')],
                  ['massnahmen', t('ueb.massnahmen')],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <TextArea rows={3} disabled={ro} value={f.besprechung[k]} onChange={(e) => set({ besprechung: { ...f.besprechung, [k]: e.target.value } })} />
                </Field>
              ))}
            </Block>
          </>
        )}
      </div>
    </div>
  );
}

function Chips({ items, value, onChange, disabled }: { items: { id: number; label: string }[]; value: number[]; onChange: (v: number[]) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items
        .filter((it) => !disabled || value.includes(it.id))
        .map((it) => {
          const on = value.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== it.id) : [...value, it.id])}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {on ? '✓ ' : ''}
              {it.label}
            </button>
          );
        })}
      {disabled && value.length === 0 && <span className="text-xs text-slate-400">–</span>}
    </div>
  );
}
