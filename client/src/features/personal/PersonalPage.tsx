// Personal: planned headcount per Zug and day, participant list, QR check-in and presence.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Participant, Strength, Zug } from '@shared/types';
import { BESTAND_KEYS, bestandTotal, sumBestand } from '@shared/types';
import { canEditStrength, canManagePersonnel, canViewPersonnel } from '@shared/permissions';
import { fmtDate, wkDays, servesOnDay, dutyOf } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Briefkopf, usePrintPage } from '../../components/Briefkopf';
import { Button, Card, errMsg, useToast } from '../../components/ui';
import { withKdo } from '../arbeitsprogramm/columns';
import { Participants } from './Participants';
import { Presence } from './Presence';
import { Eintrittsbefragung } from './Eintrittsbefragung';
import { QrCodes } from './QrCodes';
import { useT } from '../../i18n';
import { weekdayShortIn } from '@shared/i18n';
import { currentLang } from '../../lib/lang';

type Tab = 'praesenz' | 'eintritt' | 'bestand' | 'liste' | 'qr';

export function PersonalPage({ detail }: { detail: WkDetail }) {
  const { t } = useT();
  const me = useUser();
  const { wk } = detail;
  const manage = canManagePersonnel(me, wk);
  const tabs: [Tab, string][] = [
    ['praesenz', t('pers.tab.praesenz')],
    ['eintritt', t('pers.tab.eintritt')],
    ['bestand', t('pers.tab.bestand')],
    ['liste', t('pers.tab.liste')],
    ...(manage ? ([['qr', t('pers.tab.qr')]] as [Tab, string][]) : []),
  ];
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('zs-personal-tab') as Tab) || 'praesenz');
  useEffect(() => {
    try {
      sessionStorage.setItem('zs-personal-tab', tab);
    } catch {
      // ignore
    }
  }, [tab]);
  const current = tabs.some(([x]) => x === tab) ? tab : 'praesenz';
  usePrintPage(`${tabs.find(([x]) => x === current)?.[1] ?? t('pers.personal')} · ${wk.title}`);
  if (!canViewPersonnel(me, wk)) return <div className="p-6 text-slate-600">{t('yp.noAccess')}</div>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-6">
        {/* The QR sheet prints its own letterhead. */}
        {current !== 'qr' && <Briefkopf printOnly title={current === 'praesenz' ? t('pers.praesenzliste') : undefined} subtitle={wk.title} />}
        <div className="no-print flex flex-wrap gap-1.5">
          {tabs.map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full border px-3 py-1 text-sm ${current === t ? 'border-zs-blue bg-blue-50 font-medium text-zs-blue' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {current === 'praesenz' && <Presence detail={detail} />}
        {current === 'eintritt' && <Eintrittsbefragung detail={detail} />}
        {current === 'bestand' && (
          <>
            <ZugBestand zuege={detail.zuege} />
            <StrengthMatrix detail={detail} />
          </>
        )}
        {current === 'liste' && <Participants detail={detail} />}
        {current === 'qr' && <QrCodes detail={detail} />}
      </div>
    </div>
  );
}

/** People of the list serving on a day (no days given = the whole WK). */
export const servesOn = (p: Participant, date: string) => p.days.length === 0 || p.days.includes(date);

const key = (zugId: number, date: string) => `${zugId}|${date}`;

/** Planned people per Zug and day. Kp Kdt edits all rows, Zfhr the own Zug. */
function StrengthMatrix({ detail }: { detail: WkDetail }) {
  const { t } = useT();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const days = wkDays(wk);
  const rows = withKdo(wk.kpId, zuege);
  const strength = useQuery({ queryKey: ['strength', wk.id], queryFn: () => api.strength(wk.id) });
  const participants = useQuery({ queryKey: ['participants', wk.id], queryFn: () => api.participants(wk.id) });
  const [edits, setEdits] = useState<Record<string, number>>({});
  const saved = useMemo(() => new Map((strength.data ?? []).map((s) => [key(s.zugId, s.date), s.planned])), [strength.data]);
  const value = (zugId: number, date: string) => edits[key(zugId, date)] ?? saved.get(key(zugId, date)) ?? 0;
  const onList = (zugId: number, date: string) => (participants.data ?? []).filter((p) => p.zugId === zugId && servesOn(p, date)).length;
  const editable = (zugId: number) => canEditStrength(me, wk, zugId);
  const dirty = Object.keys(edits).length > 0;

  const fromIst = () => {
    const next = { ...edits };
    for (const z of zuege.filter((r) => editable(r.id))) for (const d of days.filter((x) => servesOnDay(wk, x, z.id))) next[key(z.id, d)] = bestandTotal(z.ist);
    setEdits(next);
  };
  const fromList = () => {
    const next = { ...edits };
    for (const z of rows.filter((r) => editable(r.id) && r.id !== 0)) for (const d of days.filter((x) => servesOnDay(wk, x, z.id))) next[key(z.id, d)] = onList(z.id, d);
    setEdits(next);
  };
  const save = async () => {
    const entries: Strength[] = Object.entries(edits).map(([k, planned]) => {
      const [zugId, date] = k.split('|');
      return { zugId: Number(zugId), date, planned };
    });
    try {
      await api.saveStrength(wk.id, entries);
      await qc.invalidateQueries({ queryKey: ['strength', wk.id] });
      setEdits({});
      toast(t('pers.sollSaved'));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Card
      title={t('pers.matrixTitle')}
      actions={
        rows.some((r) => editable(r.id)) && (
          <>
            {zuege.some((z) => bestandTotal(z.ist) > 0) && (
              <Button onClick={fromIst} title={t('pers.fromIstHint')}>
                {t('pers.fromIst')}
              </Button>
            )}
            {participants.data && participants.data.length > 0 && <Button onClick={fromList}>{t('pers.fromList')}</Button>}
            <Button variant="primary" disabled={!dirty} onClick={save}>
              {t('common.save')}
            </Button>
          </>
        )
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        {t('pers.matrixHint')}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3">Zug</th>
              {days.map((d) => (
                <th key={d} className="px-1 py-1 text-center font-medium">
                  {weekdayShortIn(currentLang(), d)} {fmtDate(d).slice(0, 6)}
                  {wk.avorDays.includes(d) && <div className="text-[10px] text-amber-600">AVOR</div>}
                  {wk.kvkDays.includes(d) && <div className="text-[10px] text-sky-600">KVK</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => (
              <tr key={z.id} className="border-t border-slate-100">
                <td className="py-1 pr-3 font-medium">{z.name}</td>
                {days.map((d) => {
                  const n = onList(z.id, d);
                  return (
                    <td key={d} className={`px-1 py-1 text-center ${servesOnDay(wk, d, z.id) ? '' : 'col-off'}`}>
                      {!servesOnDay(wk, d, z.id) ? (
                        <span className="text-xs text-slate-400" title={t('pers.noServiceDay')}>
                          –
                        </span>
                      ) : editable(z.id) ? (
                        <>
                          {dutyOf(wk, d, z.id) !== 'WK' && <div className="text-[9px] font-semibold text-sky-700">{dutyOf(wk, d, z.id)}</div>}
                        <input
                          type="number"
                          min={0}
                          max={999}
                          aria-label={`${z.name} ${fmtDate(d)}`}
                          className={`input w-16 text-center tabular-nums ${edits[key(z.id, d)] !== undefined ? 'border-amber-400 bg-amber-50' : ''}`}
                          value={value(z.id, d) || ''}
                          placeholder="0"
                          onChange={(e) => setEdits({ ...edits, [key(z.id, d)]: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })}
                        />
                        </>
                      ) : (
                        <span className="tabular-nums">{value(z.id, d) || '–'}</span>
                      )}
                      {n > 0 && n !== value(z.id, d) && <div className="text-[10px] text-slate-400">{t('pers.list', { n })}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-1 pr-3">{t('yp.total')}</td>
              {days.map((d) => (
                <td key={d} className="px-1 py-1 text-center tabular-nums">
                  {rows.reduce((a, z) => a + value(z.id, d), 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Soll- and Istbestand of the Züge as set in the Verwaltung. */
function ZugBestand({ zuege }: { zuege: Zug[] }) {
  const { t } = useT();
  const total = { soll: sumBestand(zuege.map((z) => z.soll)), ist: sumBestand(zuege.map((z) => z.ist)) };
  const rows = [...zuege.map((z) => ({ key: z.id, name: z.name, soll: z.soll, ist: z.ist })), { key: -1, name: t('yp.total'), ...total }];
  return (
    <Card title={t('pers.bestandTitle')}>
      <p className="mb-3 text-sm text-slate-600">{t('pers.bestandIntro')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3" rowSpan={2}>
                {t('common.zug')}
              </th>
              <th className="border-l border-slate-100 px-2 py-1 text-center font-medium" colSpan={4}>
                {t('admin.sollbestand')}
              </th>
              <th className="border-l border-slate-100 px-2 py-1 text-center font-medium" colSpan={4}>
                {t('admin.istbestand')}
              </th>
              <th className="border-l border-slate-100 px-2 py-1 text-center font-medium" rowSpan={2}>
                {t('pers.diff')}
              </th>
            </tr>
            <tr className="text-xs text-slate-500">
              {['soll', 'ist'].map((g) =>
                [...BESTAND_KEYS, 'total' as const].map((k, i) => (
                  <th key={g + k} className={`px-2 py-1 text-center font-normal ${i === 0 ? 'border-l border-slate-100' : ''}`}>
                    {k === 'total' ? t('yp.total') : t(`bestand.${k}`)}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = bestandTotal(r.ist) - bestandTotal(r.soll);
              return (
                <tr key={r.key} className={`border-t ${r.key === -1 ? 'border-slate-300 font-semibold' : 'border-slate-100'}`}>
                  <td className="py-1 pr-3 font-medium">{r.name}</td>
                  {[r.soll, r.ist].map((b, g) =>
                    [...BESTAND_KEYS.map((k) => b[k]), bestandTotal(b)].map((n, i) => (
                      <td
                        key={`${g}-${i}`}
                        className={`px-2 py-1 text-center tabular-nums ${i === 0 ? 'border-l border-slate-100' : ''} ${i === 3 ? 'font-semibold' : ''} ${
                          g === 1 && i < 3 && n < r.soll[BESTAND_KEYS[i]] ? 'text-amber-700' : ''
                        }`}
                      >
                        {n}
                      </td>
                    )),
                  )}
                  <td className={`border-l border-slate-100 px-2 py-1 text-center tabular-nums ${diff < 0 ? 'text-amber-700' : diff > 0 ? 'text-emerald-700' : ''}`}>
                    {diff > 0 ? `+${diff}` : diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {zuege.every((z) => bestandTotal(z.soll) + bestandTotal(z.ist) === 0) && (
        <p className="mt-2 text-xs text-slate-400">{t('pers.noBestand')}</p>
      )}
    </Card>
  );
}
