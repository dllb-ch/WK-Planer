import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Ausbildungsstufe, Fachbereich, LibraryEntry } from '@shared/types';
import { AUSBILDUNGSSTUFEN, FACHBEREICHE } from '@shared/types';
import { FachbereichTags } from '../components/FachbereichTags';
import { avProgress } from '@shared/av';
import { fmtDate, fmtTime, wkDays } from '@shared/util';
import { weekdayShortIn } from '@shared/i18n';
import { currentLang } from '../lib/lang';
import { api } from '../api';
import { useUser } from '../auth';
import { Button, Card, Empty, errMsg, Field, Modal, useToast } from '../components/ui';
import { DOC_CSS, docContext, docHtml, downloadJson, downloadWord } from '../features/av/avDocument';
import { FileArea } from '../components/FileArea';
import { useT } from '../i18n';

type Status = '' | 'complete' | 'progress' | 'open';
const statusOf = (done: number, total: number): Exclude<Status, ''> => (done === total ? 'complete' : done <= 1 ? 'open' : 'progress');
const STATUS_KEYS = ['complete', 'progress', 'open'] as const;
const barColor = (pct: number) => (pct >= 100 ? 'bg-emerald-500' : pct >= 55 ? 'bg-amber-400' : 'bg-red-400');

/** All Ausbildungsvorbereitungen of the Bataillon: progress, search, preview and reuse as template. */
export function BibliothekPage() {
  const { t } = useT();
  const q = useQuery({ queryKey: ['library'], queryFn: api.library });
  const [text, setText] = useState('');
  const [stufe, setStufe] = useState<Ausbildungsstufe | ''>('');
  const [kp, setKp] = useState<number | ''>('');
  const [status, setStatus] = useState<Status>('');
  const [fb, setFb] = useState<Fachbereich | ''>('');
  const [preview, setPreview] = useState<LibraryEntry | null>(null);
  const [reuse, setReuse] = useState<LibraryEntry | null>(null);

  const all = q.data ?? [];
  const withProgress = useMemo(() => all.map((e) => ({ e, p: avProgress(e.av) })), [all]);
  const needle = text.trim().toLowerCase();
  const list = withProgress.filter(({ e, p }) => {
    if (stufe && e.av.stufe !== stufe) return false;
    if (fb && !e.av.fachbereiche.includes(fb)) return false;
    if (kp && e.kpId !== kp) return false;
    if (status && statusOf(p.done, p.total) !== status) return false;
    if (!needle) return true;
    const hay = [e.av.thema, e.av.grundlagen, e.av.material, e.av.ausbildungsart, e.av.leiter, e.zugName, ...e.av.zielsetzungen, ...e.av.ablauf.map((r) => r.text)]
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
  const kompanien = [...new Map(all.map((e) => [e.kpId, e.kpName])).entries()];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold">{t('nav.library')}</h1>
          <p className="text-sm text-slate-500">{t('lib.intro')}</p>
        </div>

        {q.isLoading ? (
          <Empty>{t('common.loading')}</Empty>
        ) : (
          <>
            <ProgressOverview entries={withProgress} />
            <Card title={t('lib.byFachbereich')}>
              <FachbereichOverview entries={withProgress} />
            </Card>
          </>
        )}

        <Card>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('common.search')} className="min-w-[14rem] flex-1">
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('lib.searchPh')} />
            </Field>
            <Field label={t('av.fachbereich')}>
              <select className="input" value={fb} onChange={(e) => setFb(e.target.value as Fachbereich | '')}>
                <option value="">{t('lib.all')}</option>
                {(Object.keys(FACHBEREICHE) as Fachbereich[]).map((k) => (
                  <option key={k} value={k}>
                    {t(`fachbereich.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('lib.stufe')}>
              <select className="input" value={stufe} onChange={(e) => setStufe(e.target.value as Ausbildungsstufe | '')}>
                <option value="">{t('lib.all')}</option>
                {(Object.keys(AUSBILDUNGSSTUFEN) as Ausbildungsstufe[]).map((k) => (
                  <option key={k} value={k}>
                    {t(`stufe.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            {kompanien.length > 1 && (
              <Field label={t('common.kompanie')}>
                <select className="input" value={kp} onChange={(e) => setKp(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">{t('lib.all')}</option>
                  {kompanien.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t('lib.stand')}>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                <option value="">{t('lib.all')}</option>
                {STATUS_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`lib.status.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <p className="text-sm text-slate-500">
          {list.length} von {all.length} Lektionen
        </p>
        {list.length === 0 && !q.isLoading ? (
          <Card>
            <Empty>{t('lib.noMatch')}</Empty>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map(({ e, p }) => (
              <LibraryCard key={e.av.id} e={e} done={p.done} total={p.total} onPreview={() => setPreview(e)} onReuse={() => setReuse(e)} />
            ))}
          </div>
        )}
      </div>
      {preview && <PreviewDialog e={preview} onClose={() => setPreview(null)} onReuse={() => (setReuse(preview), setPreview(null))} />}
      {reuse && <ReuseDialog e={reuse} onClose={() => setReuse(null)} />}
    </div>
  );
}

function ProgressOverview({ entries }: { entries: { e: LibraryEntry; p: { done: number; total: number } }[] }) {
  const { t } = useT();
  const total = entries.length;
  const complete = entries.filter(({ p }) => p.done === p.total).length;
  const avg = total ? Math.round((entries.reduce((a, { p }) => a + p.done / p.total, 0) / total) * 100) : 0;
  const counts = { complete: 0, progress: 0, open: 0 };
  for (const { p } of entries) counts[statusOf(p.done, p.total)]++;
  // Per Kompanie and Zug.
  const groups = new Map<string, { kp: string; zug: string; n: number; sum: number; complete: number }>();
  for (const { e, p } of entries) {
    const k = `${e.kpName}|${e.zugName}`;
    const g = groups.get(k) ?? { kp: e.kpName, zug: e.zugName, n: 0, sum: 0, complete: 0 };
    g.n++;
    g.sum += p.done / p.total;
    if (p.done === p.total) g.complete++;
    groups.set(k, g);
  }
  return (
    <div className="grid gap-4 md:grid-cols-[18rem,1fr]">
      <Card title={t('lib.total')}>
        <div className="text-4xl font-semibold tabular-nums">{avg}%</div>
        <div className="mt-2 h-2.5 overflow-hidden rounded bg-slate-200">
          <div className={`h-full ${barColor(avg)}`} style={{ width: `${avg}%` }} />
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          <li className="flex justify-between">
            <span>{t('lib.lessons')}</span> <b>{total}</b>
          </li>
          <li className="flex justify-between text-emerald-700">
            <span>{t('lib.complete77')}</span> <b>{counts.complete}</b>
          </li>
          <li className="flex justify-between text-amber-700">
            <span>{t('lib.status.progress')}</span> <b>{counts.progress}</b>
          </li>
          <li className="flex justify-between text-red-700">
            <span>{t('lib.status.open')}</span> <b>{counts.open}</b>
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">{complete === total && total > 0 ? t('lib.allComplete') : t('lib.progressHint')}</p>
      </Card>
      <Card title={t('lib.byKpZug')}>
        {groups.size === 0 ? (
          <Empty>{t('lek.none')}</Empty>
        ) : (
          <ul className="space-y-2">
            {[...groups.values()]
              .sort((a, b) => a.kp.localeCompare(b.kp) || a.zug.localeCompare(b.zug))
              .map((g) => {
                const pct = Math.round((g.sum / g.n) * 100);
                return (
                  <li key={`${g.kp}|${g.zug}`} className="grid grid-cols-[1fr,8rem] items-center gap-3 text-sm sm:grid-cols-[12rem,1fr,9rem]">
                    <span className="truncate">
                      <span className="text-slate-500">{g.kp} · </span>
                      <b>{g.zug}</b>
                    </span>
                    <span className="h-2 overflow-hidden rounded bg-slate-200 max-sm:col-span-2 max-sm:row-start-2">
                      <span className={`block h-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-right text-xs tabular-nums text-slate-600">
                      {t('lib.pctComplete', { pct, done: g.complete, n: g.n })}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LibraryCard({ e, done, total, onPreview, onReuse }: { e: LibraryEntry; done: number; total: number; onPreview: () => void; onReuse: () => void }) {
  const { t } = useT();
  const me = useUser();
  const pct = Math.round((done / total) * 100);
  const canReuse = (me.role === 'ZFHR' || me.role === 'KADER' || me.role === 'LOGOF') && me.zugId !== null;
  const steps = avProgress(e.av).sections;
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 font-semibold">
            {e.av.thema || t('lib.noTheme')} <FachbereichTags list={e.av.fachbereiche} />
            {!!e.av.attachmentCount && (
              <span className="text-xs font-normal text-slate-500" title={t('av.attachments')}>
                📎 {e.av.attachmentCount}
              </span>
            )}
          </div>
          <div className="text-sm text-slate-500">
            {[e.kpName, e.zugName, e.av.stufe && t(`stufe.${e.av.stufe}`), e.av.ausbildungsart].filter(Boolean).join(' · ')}
          </div>
          <div className="text-xs text-slate-500">
            {e.av.datum ? `${weekdayShortIn(currentLang(), e.av.datum)} ${fmtDate(e.av.datum)}` : e.wkTitle}
            {e.av.zeitVon && ` · ${e.av.zeitVon}–${e.av.zeitBis}`}
            {e.av.leiter && ` · ${e.av.leiter}`}
          </div>
        </div>
        <div className="w-24 shrink-0 text-right">
          <div className="text-xs font-medium text-slate-600">
            {done}/{total} Schritte
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200">
            <div className={`h-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-end gap-0.5" aria-label={t('lib.filledSteps')}>
            {Object.entries(steps).map(([k, ok], i) => (
              <span key={k} title={t(`lib.step.${i as 0 | 1 | 2 | 3 | 4 | 5 | 6}`)} className={`h-2 w-2 rounded-sm ${ok ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>
      </div>
      {e.av.zielsetzungen.some((z) => z.trim()) && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-600">Ziel: {e.av.zielsetzungen.filter((z) => z.trim()).join(' · ')}</p>
      )}
      <div className="mt-auto flex justify-end gap-2 pt-2">
        <Button variant="ghost" className="text-xs" onClick={onPreview}>
          {t('lib.view')}
        </Button>
        {canReuse && (
          <Button className="text-xs" onClick={onReuse}>
            {t('lib.useAsTemplate')}
          </Button>
        )}
      </div>
    </div>
  );
}

function FachbereichOverview({ entries }: { entries: { e: LibraryEntry; p: { done: number; total: number } }[] }) {
  const { t } = useT();
  const keys = [...(Object.keys(FACHBEREICHE) as Fachbereich[]), null];
  return (
    <ul className="grid gap-2 sm:grid-cols-5">
      {keys.map((k) => {
        const list = entries.filter(({ e }) => (k ? e.av.fachbereiche.includes(k) : e.av.fachbereiche.length === 0));
        if (!k && list.length === 0) return null;
        const pct = list.length ? Math.round((list.reduce((a, { p }) => a + p.done / p.total, 0) / list.length) * 100) : 0;
        return (
          <li key={k ?? 'none'} className="rounded-md border border-slate-200 p-2">
            <div className="flex items-center justify-between gap-1 text-xs">
              {k ? <FachbereichTags list={[k]} /> : <span className="text-slate-500">{t('lib.noFachbereich')}</span>}
              <span className="text-slate-500">{list.length} Lektionen</span>
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{list.length ? `${pct}%` : '–'}</div>
            <div className="h-1.5 overflow-hidden rounded bg-slate-200">
              <div className={`h-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}


function PreviewDialog({ e, onClose, onReuse }: { e: LibraryEntry; onClose: () => void; onReuse: () => void }) {
  const { t } = useT();
  const me = useUser();
  const bat = useQuery({ queryKey: ['org'], queryFn: api.org }).data?.bataillon;
  const ctx = docContext(bat, [e.kpName, e.zugName, e.wkTitle].join('\n'));
  return (
    <Modal
      title={e.av.thema || t('av.doc')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => downloadJson(e.av)}>
            JSON
          </Button>
          <Button variant="ghost" onClick={() => downloadWord(e.av, ctx)}>
            Word
          </Button>
          <span className="flex-1" />
          <Button onClick={onClose}>{t('common.close')}</Button>
          {(me.role === 'ZFHR' || me.role === 'KADER' || me.role === 'LOGOF') && me.zugId !== null && (
            <Button variant="primary" onClick={onReuse}>
              {t('lib.useAsTemplate')}
            </Button>
          )}
        </>
      }
    >
      <div className="overflow-x-auto rounded border border-slate-200 bg-white p-4">
        <div dangerouslySetInnerHTML={{ __html: `<style>${DOC_CSS}</style>${docHtml(e.av, ctx)}` }} />
      </div>
      {!!e.av.attachmentCount && (
        <div>
          <span className="label">{t('av.attachments')}</span>
          <FileArea queryKey={['av-files', e.av.id]} load={() => api.avAttachments(e.av.id)} upload={() => Promise.resolve()} canUpload={false} compact />
        </div>
      )}
    </Modal>
  );
}

/** Copies the content into a new Ausbildungsvorbereitung for a time slot of the own Zug. */
function ReuseDialog({ e, onClose }: { e: LibraryEntry; onClose: () => void }) {
  const { t } = useT();
  const me = useUser();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const wks = useQuery({ queryKey: ['wks'], queryFn: api.wks });
  const today = new Date().toISOString().slice(0, 10);
  const options = (wks.data ?? []).filter((w) => w.kpId === me.kpId).sort((a, b) => (a.endDate >= today ? 0 : 1) - (b.endDate >= today ? 0 : 1) || a.startDate.localeCompare(b.startDate));
  const [wkId, setWkId] = useState<number | null>(null);
  const activeWk = wkId ?? options[0]?.id ?? null;
  const detail = useQuery({ queryKey: ['wk', activeWk], queryFn: () => api.wk(activeWk!), enabled: !!activeWk });
  const [blockId, setBlockId] = useState<number | ''>('');
  const slots = (detail.data?.blocks ?? [])
    .filter((b) => b.zugIds.includes(me.zugId!) && ['AUSBILDUNG', 'UEBUNG'].includes(b.type))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);

  const create = async () => {
    if (!activeWk || !detail.data) return;
    const b = slots.find((x) => x.id === blockId);
    const loc = detail.data.locations.find((l) => l.id === b?.locationId);
    const { id: _i, wkId: _w, createdBy: _c, createdByName: _n, updatedAt: _u, ...content } = e.av;
    try {
      const created = await api.createAv(activeWk, {
        ...content,
        zugId: me.zugId!,
        blockId: b?.id ?? null,
        datum: b?.date ?? '',
        zeitVon: b ? fmtTime(b.startMin) : content.zeitVon,
        zeitBis: b ? fmtTime(b.endMin) : content.zeitBis,
        arbeitsplatz: loc?.name ?? content.arbeitsplatz,
        leiter: me.name,
        leiterUserIds: [me.id],
        teilnehmer: '',
        controlling: '',
      });
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['avs', activeWk] });
      if (e.av.attachmentCount) await api.copyAvAttachments(created.id, e.av.id);
      toast(t('lib.templateTaken'));
      nav(`/wk/${activeWk}/av/${created.id}`);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <Modal
      title={t('lib.useAsTemplate')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!activeWk || !detail.data} onClick={create}>
            {t('lib.take')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        {t('lib.reuseHint', { thema: e.av.thema })}
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-red-700">{t('lib.noWks')}</p>
      ) : (
        <>
          <Field label={t('dash.col.wk')}>
            <select
              className="input"
              value={activeWk ?? ''}
              onChange={(ev) => {
                setWkId(Number(ev.target.value));
                setBlockId('');
              }}
            >
              {options.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title} ({fmtDate(w.startDate)})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('av.slot')}>
            <select className="input" value={blockId} onChange={(ev) => setBlockId(ev.target.value ? Number(ev.target.value) : '')}>
              <option value="">{t('av.noSlot')}</option>
              {slots.map((b) => (
                <option key={b.id} value={b.id}>
                  {weekdayShortIn(currentLang(), b.date)} {fmtDate(b.date).slice(0, 6)} {fmtTime(b.startMin)}–{fmtTime(b.endMin)} {b.title}
                </option>
              ))}
            </select>
          </Field>
          {detail.data && slots.length === 0 && <p className="text-xs text-slate-500">{t('lib.noSlots', { n: wkDays(detail.data.wk).length })}</p>}
        </>
      )}
    </Modal>
  );
}
