// Tagesbefehl: generated per day from the planning (Arbeitsprogramm, Standorte, Verpflegung, Transporte, Bestand,
// Rapporte, Übungen, Pendenzen) plus a few fields written by hand. Prints one A4 page per day.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Block, Tagesbefehl, TagesbefehlData } from '@shared/types';
import { DIET_LABEL, KDO_ID } from '@shared/types';
import { canEditTagesbefehl, canViewPersonnel } from '@shared/permissions';
import { emptyTagesbefehl } from '@shared/einsatz';
import { fmtDate, fmtTime, weekday, wkDays } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, Card, Field, TextArea } from '../../components/ui';
import { SAVE_LABEL, useAutosave } from '../../components/useAutosave';
import { columnName } from '../arbeitsprogramm/columns';
import { Briefkopf, usePrintPage } from '../../components/Briefkopf';
import { requestLabel } from '../ressourcen/conflicts';

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(new Date());

export function TagesbefehlPage({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const { wk } = detail;
  const days = wkDays(wk);
  const [date, setDate] = useState(() => (days.includes(today()) ? today() : (days.find((d) => d >= wk.startDate) ?? days[0])));
  const [printDays, setPrintDays] = useState<string[]>([]);
  const q = useQuery({ queryKey: ['tagesbefehle', wk.id], queryFn: () => api.tagesbefehle(wk.id) });
  const data = useTagesbefehlSources(detail);
  const editable = canEditTagesbefehl(me, wk);
  const kpName = useQuery({ queryKey: ['org'], queryFn: api.org }).data?.kompanien.find((k) => k.id === wk.kpId)?.name ?? '';
  usePrintPage(['Tagesbefehl', kpName, wk.title].filter(Boolean).join(' · '));

  useEffect(() => {
    if (!printDays.length) return;
    // Let the sheets render first.
    const t = setTimeout(() => {
      window.print();
      setPrintDays([]);
    }, 300);
    return () => clearTimeout(t);
  }, [printDays]);

  const of = (d: string) => tagesbefehlOf(q.data, wk.id, d);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="no-print mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-lg font-semibold">Tagesbefehl</h2>
          <select className="input !w-auto" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tag">
            {days.map((d, i) => (
              <option key={d} value={d}>
                Nr. {i + 1} – {weekday(d)}, {fmtDate(d)}
                {wk.avorDays.includes(d) ? ' (AVOR)' : wk.kvkDays.includes(d) ? ' (KVK)' : ''}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          <Button onClick={() => setPrintDays([date])}>Diesen Tag drucken</Button>
          <Button variant="primary" onClick={() => setPrintDays(tagesbefehlDays(wk, date))}>
            Alle Tage drucken
          </Button>
        </div>
        <p className="text-sm text-slate-600">
          Der Tagesbefehl wird aus der Planung zusammengestellt: Tagesprogramm aus dem Arbeitsprogramm, Standorte, Verpflegung, bewilligte Transporte,
          Bestand, Rapporte, Übungen und fällige Pendenzen. Ergänzt werden nur die Angaben links{editable ? '' : ' (durch Kp Kdt oder Log Of)'}.
        </p>
        <div className="grid gap-4 lg:grid-cols-[22rem,1fr]">
          {q.data ? <ManualFields key={date} detail={detail} day={of(date)} editable={editable} /> : <Card>Laden …</Card>}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <Sheet detail={detail} day={of(date)} data={data} />
          </div>
        </div>
      </div>
      {printDays.length > 0 && (
        <div className="print-only">
          {printDays.map((d, i) => (
            <div key={d} style={{ breakAfter: i < printDays.length - 1 ? 'page' : 'auto' }}>
              <Sheet detail={detail} day={of(d)} data={data} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualFields({ detail, day, editable }: { detail: WkDetail; day: Tagesbefehl; editable: boolean }) {
  const qc = useQueryClient();
  const { wk } = detail;
  const { wkId: _w, date, ...loaded } = day;
  const { value: f, update, state } = useAutosave<TagesbefehlData>(loaded, async (v) => {
    const saved = await api.saveTagesbefehl(wk.id, date, v);
    qc.setQueryData<Tagesbefehl[]>(['tagesbefehle', wk.id], (old) => old?.map((t) => (t.date === date ? saved : t)));
  });
  const all = useQuery({ queryKey: ['tagesbefehle', wk.id], queryFn: () => api.tagesbefehle(wk.id) });
  if (!f) return null;
  const set = (patch: Partial<TagesbefehlData>) => update({ ...f, ...patch });
  // Tenue and Erreichbarkeit are often the same every day.
  const copyToAll = async () => {
    if (!confirm('Tenue und Erreichbarkeit dieses Tages für alle Tage übernehmen?')) return;
    for (const t of all.data ?? []) {
      if (t.date === date) continue;
      const { wkId: _x, date: d, ...rest } = t;
      await api.saveTagesbefehl(wk.id, d, { ...rest, tenue: f.tenue, erreichbarkeit: f.erreichbarkeit });
    }
    qc.invalidateQueries({ queryKey: ['tagesbefehle', wk.id] });
  };
  return (
    <Card title="Ergänzungen" actions={editable && <span className="text-xs text-slate-500">{SAVE_LABEL[state]}</span>}>
      <div className="space-y-3">
        <Field label="Tagesverantwortliche/r">
          <input className="input" disabled={!editable} value={f.tagesverantwortlicher} onChange={(e) => set({ tagesverantwortlicher: e.target.value })} />
        </Field>
        <Field label="Tenue">
          <input className="input" disabled={!editable} value={f.tenue} onChange={(e) => set({ tenue: e.target.value })} placeholder="z. B. Arbeitstenue, Helm, Schutzbrille" />
        </Field>
        <Field label="Erreichbarkeit / Pikett">
          <TextArea rows={2} disabled={!editable} value={f.erreichbarkeit} onChange={(e) => set({ erreichbarkeit: e.target.value })} placeholder="Kp Kdt 079 …, KP Werkhof …" />
        </Field>
        <Field label="Sicherheit">
          <TextArea rows={3} disabled={!editable} value={f.sicherheit} onChange={(e) => set({ sicherheit: e.target.value })} placeholder="Sicherheitsvorschriften, Gefahren des Tages" />
        </Field>
        <Field label="Besondere Anordnungen">
          <TextArea rows={4} disabled={!editable} value={f.besonderes} onChange={(e) => set({ besonderes: e.target.value })} />
        </Field>
        {editable && (
          <Button className="text-xs" onClick={copyToAll}>
            Tenue und Erreichbarkeit für alle Tage übernehmen
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Everything the Tagesbefehl is built from. */
export function useTagesbefehlSources(detail: WkDetail) {
  const me = useUser();
  const { wk } = detail;
  const personnel = canViewPersonnel(me, wk);
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id) });
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId) });
  const strength = useQuery({ queryKey: ['strength', wk.id], queryFn: () => api.strength(wk.id) });
  const checkins = useQuery({ queryKey: ['checkins', wk.id], queryFn: () => api.checkins(wk.id), enabled: personnel });
  const rapporte = useQuery({ queryKey: ['rapporte', wk.id], queryFn: () => api.rapporte(wk.id) });
  const pendenzen = useQuery({ queryKey: ['pendenzen', wk.id], queryFn: () => api.pendenzen(wk.id) });
  const uebungen = useQuery({ queryKey: ['uebungen', wk.id], queryFn: () => api.uebungen(wk.id) });
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  return {
    ready: [requests, resources, strength, rapporte, pendenzen, uebungen, org].every((x) => x.isSuccess) && (!personnel || checkins.isSuccess),
    requests: requests.data ?? [],
    resources: resources.data ?? [],
    strength: strength.data ?? [],
    checkins: checkins.data ?? [],
    rapporte: rapporte.data ?? [],
    pendenzen: pendenzen.data ?? [],
    uebungen: uebungen.data ?? [],
    regionName: org.data?.bataillon?.regionName ?? '',
    kdt: (org.data?.users ?? []).find((u) => u.kpId === wk.kpId && u.role === 'KPKDT')?.name ?? '',
  };
}

/** Days printed with «Alle Tage drucken» and in the Dossier: all WK days, AVOR days only if asked for. */
export const tagesbefehlDays = (wk: WkDetail['wk'], extra?: string) => wkDays(wk).filter((d) => !wk.avorDays.includes(d) || d === extra);

export const tagesbefehlOf = (list: Tagesbefehl[] | undefined, wkId: number, d: string): Tagesbefehl =>
  list?.find((t) => t.date === d) ?? { ...emptyTagesbefehl(), wkId, date: d };

/** One Tagesbefehl as an A4 page. */
export function Sheet({ detail, day, data }: { detail: WkDetail; day: Tagesbefehl; data: ReturnType<typeof useTagesbefehlSources> }) {
  const { wk, zuege, blocks, locations } = detail;
  const d = day.date;
  const nr = wkDays(wk).indexOf(d) + 1;
  const allCols = [KDO_ID, ...zuege.map((z) => z.id)];
  const who = (b: Block) =>
    zuege.length > 1 && zuege.every((z) => b.zugIds.includes(z.id)) ? (b.zugIds.includes(KDO_ID) ? 'alle' : 'alle Züge') : b.zugIds.map((id) => columnName(zuege, id)).join(', ');
  const ofDay = blocks
    .filter((b) => b.date === d)
    .sort((a, b) => a.startMin - b.startMin || allCols.indexOf(a.zugIds[0]) - allCols.indexOf(b.zugIds[0]));
  const loc = (id: number | null) => locations.find((l) => l.id === id);
  const usedLocs = locations.filter((l) => ofDay.some((b) => b.locationId === l.id));
  const meals = ofDay.filter((b) => b.type === 'VERPFLEGUNG');
  const checked = data.checkins.filter((c) => c.date === d);
  const planned = data.strength.filter((s) => s.date === d);
  const total = planned.reduce((a, s) => a + s.planned, 0);
  const transports = data.requests
    .filter((q) => q.date === d && q.status === 'BEWILLIGT')
    .sort((a, b) => a.startMin - b.startMin);
  const rapporte = data.rapporte.filter((r) => r.date === d);
  const uebungen = data.uebungen.filter((x) => x.datum === d);
  const due = data.pendenzen.filter((p) => !p.done && p.dueDate === d);
  const H = ({ n, children }: { n: number; children: string }) => (
    <h2 className="mt-3 border-b border-slate-400 text-[11pt] font-semibold">
      {n}. {children}
    </h2>
  );
  let n = 0;
  // As in the template: programme and Rapporte in two tables, times as «0745-0800».
  const t = (m: number) => fmtTime(m).replace(':', '');
  const isRapport = (b: Block) => b.type === 'RAPPORT';
  const programm = ofDay.filter((b) => !isRapport(b));
  const rapportBlocks = ofDay.filter(isRapport);
  // Protocols without a block in the Arbeitsprogramm.
  const otherRapporte = rapporte.filter((r) => !rapportBlocks.some((b) => b.id === r.blockId));
  const ort = (b: Block) => (loc(b.locationId) ? `(${loc(b.locationId)!.nr}) ${loc(b.locationId)!.name}` : '');
  const avor = wk.avorDays.includes(d);
  const kvk = wk.kvkDays.includes(d);
  const row = (key: string | number, zeit: string, was: string, wer: string, wo: string) => (
    <tr key={key} className="border-b border-slate-300 align-top">
      <td className="py-0.5 pr-2 tabular-nums">{zeit}</td>
      <td className="pr-2">{was}</td>
      <td className="pr-2">{wer}</td>
      <td>{wo}</td>
    </tr>
  );
  const head = (label: string) => (
    <tr className="border-b border-black bg-slate-100 text-left">
      <th className="w-24 py-0.5 pr-2">{label === 'Zeit' ? 'Zeit' : label}</th>
      <th className="pr-2">{label === 'Zeit' ? 'Was' : ''}</th>
      <th className="w-36 pr-2">{label === 'Zeit' ? 'Wer' : ''}</th>
      <th className="w-36">{label === 'Zeit' ? 'Ort' : ''}</th>
    </tr>
  );
  return (
    <article className="text-[10pt] leading-snug text-black" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <Briefkopf />
      <div className="flex items-start justify-between gap-4 border-b border-black pb-2">
        <h1 className="text-[16pt] leading-tight" style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>
          Tagesbefehl {weekday(d)}
          {avor && ' AVOR'}
          {kvk && ' KVK'}
          <div className="text-[11pt] font-normal" style={{ fontFamily: 'Arial, sans-serif' }}>
            Nr. {nr} · {fmtDate(d)} · {wk.title}
          </div>
        </h1>
        <table className="shrink-0 text-[9pt]">
          <tbody>
            <tr>
              <td className="pr-2 font-semibold">Datum:</td>
              <td className="min-w-[7rem] border-b border-slate-400">{fmtDate(today())}</td>
            </tr>
            <tr>
              <td className="pr-2 font-semibold">Erfasser:</td>
              <td className="border-b border-slate-400">{data.kdt}</td>
            </tr>
            <tr>
              <td className="pr-2 font-semibold">Ersetzt Dok vom:</td>
              <td className="border-b border-slate-400" />
            </tr>
          </tbody>
        </table>
      </div>
      {(day.tagesverantwortlicher || day.tenue || day.erreichbarkeit) && (
        <table className="mt-2 w-full text-[9pt]">
          <tbody>
            {day.tagesverantwortlicher && (
              <tr>
                <td className="w-40 font-semibold">Tagesverantwortliche/r</td>
                <td>{day.tagesverantwortlicher}</td>
              </tr>
            )}
            {day.tenue && (
              <tr>
                <td className="w-40 font-semibold">Tenue</td>
                <td>{day.tenue}</td>
              </tr>
            )}
            {day.erreichbarkeit && (
              <tr>
                <td className="w-40 align-top font-semibold">Erreichbarkeit</td>
                <td className="whitespace-pre-wrap">{day.erreichbarkeit}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <table className="mt-3 w-full border-collapse text-[9pt]">
        <thead>{head('Zeit')}</thead>
        <tbody>
          {programm.length === 0 && row('leer', '', 'Keine Einträge im Arbeitsprogramm', '', '')}
          {programm.map((b) => row(b.id, `${t(b.startMin)}-${t(b.endMin)}`, b.title, b.verantwortlich ? `${who(b)} (${b.verantwortlich})` : who(b), ort(b)))}
        </tbody>
        {(rapportBlocks.length > 0 || otherRapporte.length > 0) && (
          <tbody>
            <tr className="border-b border-black bg-slate-100 text-left">
              <th colSpan={4} className="py-0.5">
                Rapporte
              </th>
            </tr>
            {rapportBlocks.map((b) => row(`r${b.id}`, t(b.startMin), b.title, b.verantwortlich || who(b), ort(b)))}
            {otherRapporte.map((r) => row(`p${r.id}`, r.startMin !== null ? t(r.startMin) : '', r.title, r.zugId === null ? 'Kdo' : columnName(zuege, r.zugId), r.ort))}
          </tbody>
        )}
      </table>

      {usedLocs.length > 0 && (
        <>
          <H n={++n}>Standorte</H>
          <p>{usedLocs.map((l) => `(${l.nr}) ${l.name}`).join(' · ')}</p>
        </>
      )}

      {(meals.length > 0 || checked.length > 0 || total > 0) && (
        <>
          <H n={++n}>Verpflegung</H>
          {meals.length > 0 && <p>{meals.map((b) => `${fmtTime(b.startMin)} ${b.title}${loc(b.locationId) ? ` (${loc(b.locationId)!.name})` : ''}`).join(' · ')}</p>}
          {checked.length > 0 ? (
            <p>
              {checked.length} Personen eingecheckt:{' '}
              {(Object.keys(DIET_LABEL) as (keyof typeof DIET_LABEL)[])
                .map((k) => [k, checked.filter((c) => c.diet === k).length] as const)
                .filter(([, c]) => c > 0)
                .map(([k, c]) => `${c} ${DIET_LABEL[k]}`)
                .join(', ')}
              {checked.some((c) => c.intolerances.trim()) && ` · Unverträglichkeiten: ${checked.filter((c) => c.intolerances.trim()).map((c) => `${c.vorname} ${c.nachname} (${c.intolerances})`).join(', ')}`}
            </p>
          ) : (
            total > 0 && <p>Geplant: {total} Personen</p>
          )}
        </>
      )}

      {transports.length > 0 && (
        <>
          <H n={++n}>Fahrzeuge, Räume, Gelände</H>
          <ul>
            {transports.map((q) => (
              <li key={q.id}>
                <span className="tabular-nums">
                  {fmtTime(q.startMin)}–{fmtTime(q.endMin)}
                </span>{' '}
                {columnName(zuege, q.zugId)}: {requestLabel(q, data.resources)}
                {q.zweck && ` – ${q.zweck}`}
              </li>
            ))}
          </ul>
        </>
      )}

      {planned.length > 0 && (
        <>
          <H n={++n}>Bestand (Soll)</H>
          <p>
            {planned
              .filter((s) => s.planned > 0)
              .map((s) => `${columnName(zuege, s.zugId)} ${s.planned}`)
              .join(' · ')}{' '}
            · Total {total}
          </p>
        </>
      )}

      {uebungen.length > 0 && (
        <>
          <H n={++n}>Übungen</H>
          <ul>
            {uebungen.map((x) => (
              <li key={`u${x.id}`}>
                {x.zeitVon && <span className="tabular-nums">{x.zeitVon}–{x.zeitBis} </span>}
                {x.title} ({x.art}){x.ort && `, ${x.ort}`}
                {x.leitung && ` – Leitung: ${x.leitung}`}
              </li>
            ))}
          </ul>
        </>
      )}

      {day.sicherheit && (
        <>
          <H n={++n}>Sicherheit</H>
          <p className="whitespace-pre-wrap">{day.sicherheit}</p>
        </>
      )}

      {(day.besonderes || due.length > 0) && (
        <>
          <H n={++n}>Besondere Anordnungen</H>
          {day.besonderes && <p className="whitespace-pre-wrap">{day.besonderes}</p>}
          {due.length > 0 && (
            <>
              <p className="mt-1 font-medium">Heute fällige Pendenzen:</p>
              <ul className="list-disc pl-5">
                {due.map((p) => (
                  <li key={p.id}>
                    {p.text}
                    {p.responsibleName && ` (${p.responsibleName})`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <p className="mt-6 text-[9pt]">
        Der Kp Kdt: <span className="inline-block min-w-[12rem] border-b border-slate-500">{data.kdt}</span>
      </p>
    </article>
  );
}
