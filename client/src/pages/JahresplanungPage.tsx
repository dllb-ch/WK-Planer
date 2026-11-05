// Jahresplanung of the Bat Kdo: AVOR, KVK and WK days of all Kompanien over a year or a month, printable.
// The entries are the WKs themselves (dates, AVOR and KVK days), so there is one place for the dates.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bestand, Duty, Kompanie, Zug } from '@shared/types';
import { BESTAND_KEYS, BESTAND_LABEL, bestandTotal, KDO_ID, STATUS_LABEL, sumBestand } from '@shared/types';
import { canArchiveWk, canPlanYear, canViewYearPlan } from '@shared/permissions';
import { addDays, dateRange, dutyOf, fmtDate, weekday, wkDays } from '@shared/util';
import { applyDuty, gruppePart, partDutyOf, RANK_LABEL, RANKS, wkForDay, type Cell, type Part } from '@shared/ranks';
import { ContextMenu, type MenuItem, type MenuState } from '../components/ContextMenu';
import { api, type WkSummary } from '../api';
import { useUser } from '../auth';
import { Briefkopf, usePrintPage } from '../components/Briefkopf';
import { DatesEditor } from '../components/DatesEditor';
import { Button, Card, Empty, errMsg, Field, Modal, StatusBadge, useToast } from '../components/ui';

type Kind = 'AVOR' | 'KVK' | 'WK';
const KIND: Record<Kind, { label: string; letter: string; cls: string; chip: string }> = {
  AVOR: { label: 'AVOR (Kp Kdo)', letter: 'A', cls: 'bg-amber-300 text-amber-950', chip: 'bg-amber-100 text-amber-900' },
  KVK: { label: 'KVK (Kadervorkurs)', letter: 'K', cls: 'bg-sky-400 text-sky-950', chip: 'bg-sky-100 text-sky-900' },
  WK: { label: 'WK', letter: 'W', cls: 'bg-zs-blue text-white', chip: 'bg-blue-100 text-blue-900' },
};
const BESTAND_SHORT: Record<keyof Bestand, string> = { zfhr: 'Zfhr', kader: 'Kader', sdt: 'Sdt' };
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const isWeekend = (d: string) => [0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay());
const wd = (d: string) => weekday(d).slice(0, 2);

interface Entry {
  kind: Kind;
  wk: WkSummary;
}

/** kpId|date → what the Kp does that day (AVOR before KVK before WK, like the WK itself). */
function entriesOf(wks: WkSummary[]) {
  const map = new Map<string, Entry>();
  const put = (wk: WkSummary, d: string, kind: Kind) => {
    const k = `${wk.kpId}|${d}`;
    if (!map.has(k) || map.get(k)!.wk.id === wk.id) map.set(k, { kind, wk });
  };
  for (const wk of wks) {
    for (const d of dateRange(wk.startDate, wk.endDate)) put(wk, d, 'WK');
    for (const d of wk.kvkDays) put(wk, d, 'KVK');
    for (const d of wk.avorDays) put(wk, d, 'AVOR');
  }
  return map;
}

type Dialog = { kind: 'day'; date: string; kpId: number | null } | { kind: 'plan'; wk?: WkSummary; kpId?: number; startDate?: string };

export function JahresplanungPage() {
  const me = useUser();
  const wks = useQuery({ queryKey: ['wks'], queryFn: api.wks });
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [view, setView] = useState<'jahr' | 'monat'>('jahr');
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const plan = canPlanYear(me);
  const qc = useQueryClient();
  const toast = useToast();
  // Month view: one row per rank (Zugführer, Kader, Soldaten) under each Zug.
  const [byRank, setByRank] = useState(() => {
    try {
      return localStorage.getItem('zs-jahr-rang') === '1';
    } catch {
      return false;
    }
  });
  const toggleRank = (on: boolean) => {
    setByRank(on);
    try {
      localStorage.setItem('zs-jahr-rang', on ? '1' : '0');
    } catch {
      // ignore
    }
  };
  // … and one row per Gruppe of the Zug.
  const [byGruppe, setByGruppe] = useState(() => {
    try {
      return localStorage.getItem('zs-jahr-gruppe') === '1';
    } catch {
      return false;
    }
  });
  const toggleGruppe = (on: boolean) => {
    setByGruppe(on);
    try {
      localStorage.setItem('zs-jahr-gruppe', on ? '1' : '0');
    } catch {
      // ignore
    }
  };
  const [menu, setMenu] = useState<MenuState | null>(null);
  usePrintPage(`Jahresplanung ${year} · ${org.data?.bataillon.name ?? ''}`, { landscape: true, margin: '10mm 10mm 14mm 10mm' });

  const kps = (org.data?.kompanien ?? []).filter((k) => me.role === 'BAT' || k.id === me.kpId);
  const zuege = org.data?.zuege ?? [];
  const inYear = useMemo(
    () =>
      (wks.data ?? [])
        .filter((w) => wkDays(w).some((d) => d.startsWith(String(year))))
        .sort((a, b) => kps.findIndex((k) => k.id === a.kpId) - kps.findIndex((k) => k.id === b.kpId) || a.startDate.localeCompare(b.startDate)),
    [wks.data, year, kps],
  );
  const entries = useMemo(() => entriesOf(inYear), [inYear]);
  const at = (kpId: number, d: string) => entries.get(`${kpId}|${d}`);

  if (!canViewYearPlan(me)) return <div className="p-6 text-slate-600">Kein Zugriff.</div>;

  /** Selected days in the month view: pick the duty; the WK of each Kp gets the days (or is extended). */
  const onSelect = (cells: (Cell & { kpId: number })[], x: number, y: number) => {
    const dates = [...new Set(cells.map((c) => c.date))].sort();
    const byKp = [...new Set(cells.map((c) => c.kpId))].map((kpId) => ({ kpId, cells: cells.filter((c) => c.kpId === kpId), wk: wkForDay(inYear, kpId, dates[0]) }));
    const apply = async (duty: Duty) => {
      for (const g of byKp) {
        if (!g.wk) {
          toast(`${kps.find((k) => k.id === g.kpId)?.name}: zuerst einen WK planen`, 'error');
          continue;
        }
        try {
          const own = zuege.filter((z) => z.kpId === g.kpId);
          await api.updateWk(g.wk.id, applyDuty(g.wk, g.cells, duty, own));
          qc.invalidateQueries({ queryKey: ['wk', g.wk.id] });
        } catch (e) {
          toast(`${g.wk.title}: ${errMsg(e)}`, 'error');
        }
      }
      await qc.invalidateQueries({ queryKey: ['wks'] });
      window.dispatchEvent(new Event('zs-plan-clear'));
    };
    const rowsCount = new Set(cells.map((c) => `${c.zugId}.${c.part}`)).size;
    const single = byKp.length === 1 ? byKp[0] : null;
    const items: MenuItem[] = [
      { label: 'WK', icon: 'W', onClick: () => apply('WK') },
      { label: 'KVK (Kadervorkurs)', icon: 'K', onClick: () => apply('KVK') },
      { label: 'AVOR', icon: 'A', onClick: () => apply('AVOR') },
      { label: 'Kein Dienst', icon: '–', onClick: () => apply('NONE') },
      ...(single
        ? ([
            'separator',
            single.wk
              ? { label: `«${single.wk.title}» bearbeiten …`, icon: '✎', onClick: () => setDialog({ kind: 'plan', wk: single.wk }) }
              : { label: `Neuer WK ab ${fmtDate(dates[0])} …`, icon: '+', onClick: () => setDialog({ kind: 'plan', kpId: single.kpId, startDate: dates[0] }) },
          ] as MenuItem[])
        : []),
    ];
    setMenu({
      x,
      y,
      title: `${dates.length === 1 ? fmtDate(dates[0]) : `${fmtDate(dates[0]).slice(0, 6)} – ${fmtDate(dates[dates.length - 1]).slice(0, 6)}`} · ${rowsCount} ${rowsCount === 1 ? 'Zeile' : 'Zeilen'}`,
      items,
    });
  };

  const openDay = (date: string, kpId: number | null) => {
    const e = kpId !== null ? at(kpId, date) : undefined;
    if (e && plan) setDialog({ kind: 'plan', wk: e.wk });
    else if (plan || kps.some((k) => at(k.id, date))) setDialog({ kind: 'day', date, kpId });
  };

  return (
    <div className="print-flow min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-6 print:max-w-none print:p-0">
        <Briefkopf printOnly compact title={`Jahresplanung ${year}`} subtitle={view === 'monat' ? `${MONTHS[month]} ${year}` : org.data?.bataillon.name} />
        <div className="no-print flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-xl font-semibold">Jahresplanung</h1>
          <div className="flex items-center gap-1">
            <Button className="!px-2.5" aria-label="Vorheriges Jahr" onClick={() => setYear(year - 1)}>
              ‹
            </Button>
            <span className="w-14 text-center font-semibold tabular-nums">{year}</span>
            <Button className="!px-2.5" aria-label="Nächstes Jahr" onClick={() => setYear(year + 1)}>
              ›
            </Button>
          </div>
          <div className="flex rounded-full border border-slate-300 bg-white p-0.5 text-sm">
            {(['jahr', 'monat'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 ${view === v ? 'bg-blue-50 font-medium text-zs-blue' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {v === 'jahr' ? 'Jahr' : 'Monat'}
              </button>
            ))}
          </div>
          {view === 'monat' && (
            <div className="flex items-center gap-1">
              <Button className="!px-2.5" aria-label="Vorheriger Monat" onClick={() => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1))}>
                ‹
              </Button>
              <select className="input !w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Monat">
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <Button className="!px-2.5" aria-label="Nächster Monat" onClick={() => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1))}>
                ›
              </Button>
            </div>
          )}
          {view === 'monat' && (
            <label className="flex items-center gap-1.5 text-sm" title="Unter jedem Zug je eine Zeile für Zugführer, Kader und Soldaten">
              <input type="checkbox" checked={byRank} onChange={(e) => toggleRank(e.target.checked)} />
              Nach Funktion (Zfhr · Kader · Sdt)
            </label>
          )}
          {view === 'monat' && (
            <label className="flex items-center gap-1.5 text-sm" title="Unter jedem Zug je eine Zeile pro Gruppe (Organisation)">
              <input type="checkbox" checked={byGruppe} onChange={(e) => toggleGruppe(e.target.checked)} />
              Nach Gruppen
            </label>
          )}
          <span className="flex-1" />
          <Button onClick={() => window.print()}>Drucken</Button>
          {plan && (
            <Button variant="primary" onClick={() => setDialog({ kind: 'plan' })}>
              + WK planen
            </Button>
          )}
        </div>
        <p className="no-print text-sm text-slate-600">
          {plan
            ? view === 'monat'
              ? 'Tage in den Zeilen der Züge (oder ihrer Funktionen) anklicken oder mit der Maus darüberziehen – auch über mehrere Zeilen – und im Menü WK, KVK, AVOR oder «Kein Dienst» wählen. Die Zeile der Kompanie öffnet den WK.'
              : 'Tag anklicken, um AVOR-, KVK- oder WK-Tage einer Kompanie zu planen. Jeder geplante WK wird mit seinem Vorbereitungs-Zeitplan angelegt; mehrere WKs pro Jahr und Kompanie sind möglich.'
            : 'Vom Bat Kommando geplant.'}
        </p>

        <Legend kps={kps} showOrder={view === 'jahr' && kps.length > 1} />

        {kps.length === 0 ? (
          <Card>
            <Empty>Keine Kompanien.</Empty>
          </Card>
        ) : view === 'jahr' ? (
          <YearGrid year={year} kps={kps} at={at} onDay={(d) => openDay(d, kps.length === 1 ? kps[0].id : null)} clickable={plan} />
        ) : (
          <MonthGrid year={year} month={month} kps={kps} zuege={zuege} at={at} onCell={openDay} onSelect={plan ? onSelect : undefined} clickable={plan} byRank={byRank} byGruppe={byGruppe} />
        )}

        <Summary year={year} kps={kps} zuege={zuege} wks={inYear} onEdit={plan ? (wk) => setDialog({ kind: 'plan', wk }) : undefined} />
      </div>

      {menu && (
        <ContextMenu
          menu={menu}
          onClose={() => {
            setMenu(null);
            window.dispatchEvent(new Event('zs-plan-clear'));
          }}
        />
      )}
      {dialog?.kind === 'day' && (
        <DayDialog
          date={dialog.date}
          kpId={dialog.kpId}
          kps={kps}
          wks={inYear}
          at={at}
          plan={plan}
          onPlan={(p) => setDialog({ kind: 'plan', ...p })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'plan' && (
        <PlanDialog wk={dialog.wk} kps={kps} year={year} kpId={dialog.kpId} startDate={dialog.startDate} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function Legend({ kps, showOrder }: { kps: Kompanie[]; showOrder: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {(Object.keys(KIND) as Kind[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-3.5 w-3.5 rounded-sm text-center text-[9px] font-semibold leading-[14px] ${KIND[k].cls}`}>{KIND[k].letter}</span>
          {KIND[k].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="text-slate-300">–</span> Zug ohne Dienst
      </span>
      {showOrder && (
        <span>
          Kästchen pro Tag von links: {kps.map((k, i) => `${i + 1} ${k.name}`).join(' · ')}
        </span>
      )}
    </div>
  );
}

/** Classic year plan: months as columns, days as rows; per day one box per Kp. */
function YearGrid({
  year,
  kps,
  at,
  onDay,
  clickable,
}: {
  year: number;
  kps: Kompanie[];
  at: (kpId: number, d: string) => Entry | undefined;
  onDay: (d: string) => void;
  clickable: boolean;
}) {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white print:overflow-visible print:rounded-none print:border-0">
      <table className="w-full min-w-[900px] table-fixed border-collapse text-[10px] print:min-w-0">
        <thead>
          <tr>
            {MONTHS.map((m) => (
              <th key={m} className="border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[11px] font-semibold">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day}>
              {MONTHS.map((_, m) => {
                if (day > daysInMonth(year, m)) return <td key={m} className="border border-slate-200 bg-slate-200/60" />;
                const d = iso(year, m, day);
                const hits = kps.map((k) => at(k.id, d));
                const any = hits.some(Boolean);
                return (
                  <td
                    key={m}
                    onClick={() => (clickable || any) && onDay(d)}
                    title={hits.map((e, i) => (e ? `${kps[i].name}: ${e.kind} – ${e.wk.title}` : '')).filter(Boolean).join('\n') || undefined}
                    className={`h-[18px] border border-slate-200 px-0.5 ${isWeekend(d) ? 'bg-slate-100' : ''} ${clickable || any ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                  >
                    <div className="flex items-center gap-px">
                      <span className={`w-[30px] shrink-0 whitespace-nowrap tabular-nums ${isWeekend(d) ? 'text-slate-400' : 'text-slate-500'}`}>
                        {wd(d)} {day}
                      </span>
                      {hits.map((e, i) => (
                        <span
                          key={kps[i].id}
                          className={`h-3 min-w-0 flex-1 rounded-sm text-center text-[8px] font-semibold leading-3 ${e ? KIND[e.kind].cls : ''} ${e?.wk.archived ? 'opacity-50' : ''}`}
                        >
                          {e ? KIND[e.kind].letter : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A row of the month view that can be planned: a whole Zug, or one of its ranks. */
interface PlanRow {
  kpId: number;
  zugId: number;
  part: Part | null;
}
type Pos = { r: number; c: number };

/**
 * One month: per Kompanie a row for the Kp (Kdo) and one per Zug with its duty, and the Bestand by function.
 * With `byRank` each Zug gets a row for its Zugführer, Kader and Soldaten. Planners select days by dragging
 * (or clicking) over Zug or rank rows, like cells in a spreadsheet, and pick the duty in a menu.
 */
function MonthGrid({
  year,
  month,
  kps,
  zuege,
  at,
  onCell,
  onSelect,
  clickable,
  byRank,
  byGruppe,
}: {
  year: number;
  month: number;
  kps: Kompanie[];
  zuege: Zug[];
  at: (kpId: number, d: string) => Entry | undefined;
  onCell: (d: string, kpId: number) => void;
  onSelect?: (cells: (Cell & { kpId: number })[], x: number, y: number) => void;
  clickable: boolean;
  byRank: boolean;
  byGruppe: boolean;
}) {
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => iso(year, month, i + 1));
  const cols = [...BESTAND_KEYS, 'total'] as const;
  const head = 'border border-slate-200 bg-slate-50 px-1 py-1 text-center text-[10px] font-medium';
  /** Sub-rows of a Zug: its Gruppen and/or its ranks, as ticked. */
  const subParts = (z: Zug): Part[] => [...(byGruppe ? z.gruppen.map((g) => gruppePart(g.id)) : []), ...(byRank ? RANKS : [])];
  const rows: PlanRow[] = kps.flatMap((k) =>
    zuege.filter((z) => z.kpId === k.id).flatMap((z) => [{ kpId: k.id, zugId: z.id, part: null }, ...subParts(z).map((part) => ({ kpId: k.id, zugId: z.id, part }))]),
  );
  const rowIndex = (zugId: number, part: Part | null) => rows.findIndex((r) => r.zugId === zugId && r.part === part);
  const partLabel = (z: Zug, part: Part) => (part.startsWith('g') ? (z.gruppen.find((g) => gruppePart(g.id) === part)?.name ?? 'Gruppe') : RANK_LABEL[part as keyof Bestand]);
  const [sel, setSel] = useState<{ a: Pos; b: Pos } | null>(null);
  const dragging = useRef(false);
  const inSel = (r: number, c: number) =>
    !!sel && r >= Math.min(sel.a.r, sel.b.r) && r <= Math.max(sel.a.r, sel.b.r) && c >= Math.min(sel.a.c, sel.b.c) && c <= Math.max(sel.a.c, sel.b.c);

  const posOf = (x: number, y: number): Pos | null => {
    const td = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('td[data-r]') as HTMLElement | null;
    return td ? { r: Number(td.dataset.r), c: Number(td.dataset.c) } : null;
  };
  const finish = (e: React.PointerEvent) => {
    if (!dragging.current || !sel || !onSelect) return;
    dragging.current = false;
    const cells: (Cell & { kpId: number })[] = [];
    for (let r = Math.min(sel.a.r, sel.b.r); r <= Math.max(sel.a.r, sel.b.r); r++)
      for (let c = Math.min(sel.a.c, sel.b.c); c <= Math.max(sel.a.c, sel.b.c); c++) cells.push({ ...rows[r], date: days[c] });
    onSelect(cells, e.clientX, e.clientY);
  };
  // The selection stays visible while the menu is open; a new month or view clears it.
  useEffect(() => setSel(null), [year, month, byRank, byGruppe]);
  useEffect(() => {
    const clear = () => !dragging.current && setSel(null);
    window.addEventListener('zs-plan-clear', clear);
    return () => window.removeEventListener('zs-plan-clear', clear);
  }, []);

  /** «Ist / Soll» of one function (or the total); amber where the Ist falls short. A rank shows its column only. */
  const bestandCells = (ist: Bestand, soll: Bestand, strong: boolean, only?: (k: (typeof cols)[number]) => boolean) =>
    cols.map((k) => {
      if (only && !only(k)) return <td key={k} className="border border-slate-200" />;
      const i = k === 'total' ? bestandTotal(ist) : ist[k];
      const so = k === 'total' ? bestandTotal(soll) : soll[k];
      return (
        <td
          key={k}
          className={`whitespace-nowrap border border-slate-200 px-0.5 text-center text-[10px] tabular-nums ${strong ? 'font-semibold' : ''} ${i < so ? 'text-amber-700' : ''}`}
        >
          {i}/{so}
        </td>
      );
    });

  const dutyAt = (e: Entry | undefined, d: string, zugId: number | null, part: Part | null): Duty | null =>
    !e ? null : zugId === null ? e.kind : part ? partDutyOf(e.wk, d, zugId, part) : dutyOf(e.wk, d, zugId);

  const dayCells = (k: Kompanie, zugId: number | null, part: Part | null, size: string) => {
    const r = zugId === null ? -1 : rowIndex(zugId, part);
    const selectable = r >= 0 && !!onSelect;
    return days.map((d, c) => {
      const e = at(k.id, d);
      // The Kp row shows the type of the day (AVOR = Kp Kdo), a Zug row its own duty, a rank row that of the rank.
      const duty = dutyAt(e, d, zugId, part);
      const kind = duty && duty !== 'NONE' ? duty : null;
      const prev = c > 0 ? dutyAt(at(k.id, days[c - 1]), days[c - 1], zugId, part) : null;
      const first = kind && (kind !== 'WK' || prev !== 'WK');
      const zug = zuege.find((z) => z.id === zugId);
      const name = zugId === null ? k.name : `${zug?.name}${part && zug ? ` · ${partLabel(zug, part)}` : ''}`;
      const selected = selectable && inSel(r, c);
      return (
        <td
          key={d}
          data-r={selectable ? r : undefined}
          data-c={selectable ? c : undefined}
          onPointerDown={
            selectable
              ? (ev) => {
                  if (ev.button !== 0) return;
                  ev.preventDefault();
                  dragging.current = true;
                  setSel({ a: { r, c }, b: { r, c } });
                }
              : undefined
          }
          onPointerUp={selectable ? finish : undefined}
          onClick={selectable ? undefined : () => (clickable || e) && onCell(d, k.id)}
          title={e ? `${name}: ${duty === 'NONE' ? 'kein Dienst' : duty} – ${e.wk.title}` : undefined}
          className={`${size} select-none border border-slate-200 p-0 ${isWeekend(d) && !kind ? 'bg-slate-100' : ''} ${
            selectable ? 'cursor-cell' : clickable || e ? 'cursor-pointer hover:outline hover:outline-2 hover:outline-zs-blue/40' : ''
          } ${selected ? 'relative outline outline-2 -outline-offset-2 outline-zs-blue' : ''}`}
        >
          {kind ? (
            <div
              className={`flex h-full w-full items-center justify-center text-[10px] font-semibold ${KIND[kind].cls} ${e!.wk.archived ? 'opacity-50' : ''} ${part ? 'opacity-90' : ''}`}
              aria-label={`${fmtDate(d)} ${kind}`}
            >
              {first ? KIND[kind].letter : ''}
            </div>
          ) : (
            duty === 'NONE' && <div className="flex h-full items-center justify-center text-[10px] text-slate-300">–</div>
          )}
          {selected && <div className="pointer-events-none absolute inset-0 bg-zs-blue/15" />}
        </td>
      );
    });
  };

  return (
    <div
      className="overflow-x-auto rounded-lg border border-slate-200 bg-white print:overflow-visible print:rounded-none print:border-0"
      onPointerMove={(e) => {
        if (!dragging.current || !sel) return;
        const p = posOf(e.clientX, e.clientY);
        if (p && (p.r !== sel.b.r || p.c !== sel.b.c)) setSel({ ...sel, b: p });
      }}
      onPointerUp={finish}
      onPointerLeave={(e) => dragging.current && finish(e)}
    >
      <table className="w-full min-w-[1000px] table-fixed border-collapse text-xs print:min-w-0">
        <colgroup>
          <col className="w-36" />
          {cols.map((k) => (
            <col key={k} className={k === 'total' ? 'w-12' : 'w-11'} />
          ))}
          {days.map((d) => (
            <col key={d} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">
              {MONTHS[month]} {year}
            </th>
            <th colSpan={cols.length} className={head}>
              Bestand Ist / Soll
            </th>
            {days.map((d) => (
              <th key={d} rowSpan={2} className={`border border-slate-200 px-0 py-1 text-center text-[10px] font-medium ${isWeekend(d) ? 'bg-slate-100 text-slate-400' : 'bg-slate-50'}`}>
                {wd(d)}
                <br />
                {Number(d.slice(8))}
              </th>
            ))}
          </tr>
          <tr>
            {cols.map((k) => (
              <th key={k} className={head} title={k === 'total' ? 'Total' : BESTAND_LABEL[k]}>
                {k === 'total' ? 'Total' : BESTAND_SHORT[k]}
              </th>
            ))}
          </tr>
        </thead>
        {kps.map((k) => {
          const own = zuege.filter((z) => z.kpId === k.id);
          return (
            <tbody key={k.id} className="break-inside-avoid">
              <tr className="bg-slate-50/60">
                <td className="truncate border border-slate-200 px-2 py-1 font-semibold">{k.name}</td>
                {bestandCells(sumBestand(own.map((z) => z.ist)), sumBestand(own.map((z) => z.soll)), true)}
                {dayCells(k, null, null, 'h-8')}
              </tr>
              {own.map((z) => (
                <Fragment key={z.id}>
                  <tr>
                    <td className={`truncate border border-slate-200 py-0.5 pl-5 pr-2 ${subParts(z).length ? 'font-medium text-slate-900' : 'text-slate-700'}`}>{z.name}</td>
                    {bestandCells(z.ist, z.soll, subParts(z).length > 0)}
                    {dayCells(k, z.id, null, 'h-6')}
                  </tr>
                  {subParts(z).map((part) => {
                    const g = part.startsWith('g') ? z.gruppen.find((x) => gruppePart(x.id) === part) : undefined;
                    return (
                      <tr key={part}>
                        <td className={`truncate border border-slate-200 py-0 pl-8 pr-2 text-[11px] ${g ? 'text-slate-700' : 'text-slate-500'}`}>
                          {g ? `${g.name}` : partLabel(z, part)}
                        </td>
                        {g ? bestandCells(g.ist, g.soll, false, (c) => c !== 'zfhr') : bestandCells(z.ist, z.soll, false, (c) => c === part)}
                        {dayCells(k, z.id, part, 'h-5')}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

/** All Dienstleistungen of the year as a list (printed after the plan). */
function Summary({ year, kps, zuege, wks, onEdit }: { year: number; kps: Kompanie[]; zuege: Zug[]; wks: WkSummary[]; onEdit?: (wk: WkSummary) => void }) {
  const dates = (list: string[]) => (list.length ? list.map((d) => fmtDate(d).slice(0, 6)).join(', ') : '–');
  return (
    <Card title={`Dienstleistungen ${year}`} className="break-inside-avoid print:break-before-page">
      {wks.length === 0 ? (
        <Empty>Für {year} ist noch nichts geplant.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 pr-3">Kompanie</th>
                <th className="py-1 pr-3">Bezeichnung</th>
                <th className="py-1 pr-3">AVOR</th>
                <th className="py-1 pr-3">KVK</th>
                <th className="py-1 pr-3">WK</th>
                <th className="py-1 pr-3 text-right">Tage</th>
                <th className="py-1 pr-3 text-right">Ist / Soll</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {wks.map((w) => {
                const own = zuege.filter((z) => z.kpId === w.kpId);
                return (
                  <tr key={w.id} className={`border-t border-slate-100 align-top ${w.archived ? 'text-slate-400' : ''}`}>
                    <td className="py-1.5 pr-3">{kps.find((k) => k.id === w.kpId)?.name ?? w.kpName}</td>
                    <td className="py-1.5 pr-3">
                      {onEdit ? (
                        <button className="text-left font-medium text-zs-blue hover:underline print:text-black" onClick={() => onEdit(w)}>
                          {w.title}
                        </button>
                      ) : (
                        <Link className="font-medium text-zs-blue hover:underline print:text-black" to={`/wk/${w.id}`}>
                          {w.title}
                        </Link>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{dates(w.avorDays)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{dates(w.kvkDays)}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">
                      {fmtDate(w.startDate)} – {fmtDate(w.endDate)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{wkDays(w).length}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {bestandTotal(sumBestand(own.map((z) => z.ist)))} / {bestandTotal(sumBestand(own.map((z) => z.soll)))}
                    </td>
                    <td className="py-1.5">
                      <span className="no-print">
                        <StatusBadge status={w.status} />
                      </span>
                      <span className="print-only">{STATUS_LABEL[w.status]}</span>
                      {w.archived && <span className="ml-1 text-xs">(archiviert)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** A day: what each Kp does, and (Bat) adding an AVOR or KVK day to a WK or starting a new WK. */
function DayDialog({
  date,
  kpId,
  kps,
  wks,
  at,
  plan,
  onPlan,
  onClose,
}: {
  date: string;
  kpId: number | null;
  kps: Kompanie[];
  wks: WkSummary[];
  at: (kpId: number, d: string) => Entry | undefined;
  plan: boolean;
  onPlan: (p: { wk?: WkSummary; kpId?: number; startDate?: string }) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const free = kps.filter((k) => !at(k.id, date));
  const [kp, setKp] = useState<number>(kpId ?? free[0]?.id ?? 0);
  const own = wks.filter((w) => w.kpId === kp && !w.archived && w.status !== 'FREIGEGEBEN');
  // Default: the next WK of the Kp from this day on, else the last one before.
  const proposal = own.find((w) => w.endDate >= date) ?? own[own.length - 1];
  const [wkId, setWkId] = useState<number | null>(null);
  const target = own.find((w) => w.id === wkId) ?? proposal;
  const shown = kpId !== null ? kps.filter((k) => k.id === kpId) : kps;

  const addDay = async (kind: 'AVOR' | 'KVK') => {
    if (!target) return;
    try {
      await api.updateWk(
        target.id,
        kind === 'AVOR' ? { avorDays: [...target.avorDays, date] } : { kvkDays: [...target.kvkDays, date], avorDays: target.avorDays.filter((d) => d !== date) },
      );
      await qc.invalidateQueries({ queryKey: ['wks'] });
      qc.invalidateQueries({ queryKey: ['wk', target.id] });
      toast(`${kind}-Tag ${fmtDate(date)} zu «${target.title}» hinzugefügt`);
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Modal title={`${weekday(date)}, ${fmtDate(date)}`} onClose={onClose} footer={<Button onClick={onClose}>Schliessen</Button>}>
      <ul className="space-y-1 text-sm">
        {shown.map((k) => {
          const e = at(k.id, date);
          return (
            <li key={k.id} className="flex items-center gap-2">
              <span className="w-32 shrink-0 font-medium">{k.name}</span>
              {e ? (
                <>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${KIND[e.kind].chip}`}>{e.kind}</span>
                  {plan ? (
                    <button className="truncate text-zs-blue hover:underline" onClick={() => onPlan({ wk: e.wk })}>
                      {e.wk.title}
                    </button>
                  ) : (
                    <Link className="truncate text-zs-blue hover:underline" to={`/wk/${e.wk.id}`}>
                      {e.wk.title}
                    </Link>
                  )}
                </>
              ) : (
                <span className="text-slate-400">–</span>
              )}
            </li>
          );
        })}
      </ul>
      {plan && free.length > 0 && (
        <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <h3 className="label !mb-0">Planen</h3>
          {kpId === null && (
            <Field label="Kompanie">
              <select
                className="input"
                value={kp}
                onChange={(e) => {
                  setKp(Number(e.target.value));
                  setWkId(null);
                }}
              >
                {free.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Button variant="primary" onClick={() => onPlan({ kpId: kp, startDate: date })}>
            Neuer WK ab {fmtDate(date)}
          </Button>
          {own.length > 0 ? (
            <div className="space-y-2 border-t pt-3">
              <Field label="Oder als Tag zu einem WK der Kompanie">
                <select className="input" value={target?.id ?? ''} onChange={(e) => setWkId(Number(e.target.value))}>
                  {own.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title} ({fmtDate(w.startDate)} – {fmtDate(w.endDate)})
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => addDay('AVOR')}>+ AVOR-Tag</Button>
                <Button onClick={() => addDay('KVK')}>+ KVK-Tag</Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">AVOR- und KVK-Tage gehören zu einem WK: zuerst einen WK der Kompanie planen.</p>
          )}
        </section>
      )}
    </Modal>
  );
}

/** Plan a new WK or change one: dates, AVOR and KVK days. */
function PlanDialog({
  wk,
  kps,
  year,
  kpId,
  startDate,
  onClose,
}: {
  wk?: WkSummary;
  kps: Kompanie[];
  year: number;
  kpId?: number;
  startDate?: string;
  onClose: () => void;
}) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const kpName = (id: number) => kps.find((k) => k.id === id)?.name ?? '';
  const [f, setF] = useState(() =>
    wk
      ? { kpId: wk.kpId, title: wk.title, startDate: wk.startDate, endDate: wk.endDate, avorDays: wk.avorDays, kvkDays: wk.kvkDays }
      : {
          kpId: kpId ?? kps[0]?.id ?? 0,
          title: '',
          startDate: startDate ?? '',
          endDate: startDate ? addDays(startDate, 4) : '',
          avorDays: [] as string[],
          kvkDays: [] as string[],
        },
  );
  const [busy, setBusy] = useState(false);
  const locked = !!wk && (wk.archived || wk.status === 'FREIGEGEBEN');
  const ro = locked || !canPlanYear(me);
  const length = f.startDate && f.endDate && f.endDate >= f.startDate ? dateRange(f.startDate, f.endDate).length : 0;
  const title = f.title.trim() || `WK ${f.startDate.slice(0, 4) || year} ${kpName(f.kpId)}`;
  const valid = f.kpId && length >= 1 && length <= 21;

  const done = async (msg: string, id?: number) => {
    await qc.invalidateQueries({ queryKey: ['wks'] });
    if (id) qc.invalidateQueries({ queryKey: ['wk', id] });
    toast(msg);
    onClose();
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = { title, startDate: f.startDate, endDate: f.endDate, avorDays: f.avorDays, kvkDays: f.kvkDays.filter((d) => !f.avorDays.includes(d)) };
      if (wk) {
        await api.updateWk(wk.id, body);
        await done(`«${title}» gespeichert`, wk.id);
      } else {
        await api.createWk({ ...body, kpId: f.kpId, dayStart: 7 * 60 + 30, dayEnd: 17 * 60, snapMin: 15 });
        await done(`«${title}» geplant – der WK ist angelegt`);
      }
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!wk || !confirm(`«${wk.title}» mit Arbeitsprogramm, Personal und allen Unterlagen endgültig löschen?`)) return;
    try {
      await api.deleteWk(wk.id);
      await done(`«${wk.title}» gelöscht`);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Modal
      title={wk ? wk.title : 'WK planen'}
      onClose={onClose}
      footer={
        <>
          {wk && canArchiveWk(me, wk) && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              Löschen
            </Button>
          )}
          {wk && (
            <Link to={`/wk/${wk.id}`} className="mr-auto self-center text-sm text-zs-blue hover:underline">
              WK öffnen →
            </Link>
          )}
          <Button onClick={onClose}>{ro ? 'Schliessen' : 'Abbrechen'}</Button>
          {!ro && (
            <Button variant="primary" disabled={!valid || busy} onClick={save}>
              {wk ? 'Speichern' : 'Planen'}
            </Button>
          )}
        </>
      }
    >
      {locked && (
        <p className="rounded bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {wk!.archived ? 'Archiviert – zuerst in der Übersicht wiederherstellen.' : 'Das Arbeitsprogramm ist freigegeben – die Daten sind fest.'}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kompanie">
          <select className="input" disabled={!!wk || ro} value={f.kpId} onChange={(e) => setF({ ...f, kpId: Number(e.target.value) })}>
            {kps.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bezeichnung">
          <input className="input" disabled={ro} value={f.title} placeholder={title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="WK von">
          <input
            type="date"
            className="input"
            disabled={ro}
            value={f.startDate}
            onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate >= e.target.value ? f.endDate : e.target.value })}
          />
        </Field>
        <Field label="WK bis">
          <input type="date" className="input" disabled={ro} value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </Field>
      </div>
      {length > 21 && <p className="text-xs text-red-600">Ein WK dauert höchstens 21 Tage.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="AVOR-Tage (Kp Kdo)">
          {ro ? (
            <p className="text-sm">{f.avorDays.map(fmtDate).join(', ') || '–'}</p>
          ) : (
            <DatesEditor value={f.avorDays} onChange={(avorDays) => setF({ ...f, avorDays })} label="AVOR-Tag" tone={KIND.AVOR.chip} />
          )}
        </Field>
        <Field label="KVK-Tage (Kader)">
          {ro ? (
            <p className="text-sm">{f.kvkDays.map(fmtDate).join(', ') || '–'}</p>
          ) : (
            <DatesEditor value={f.kvkDays} onChange={(kvkDays) => setF({ ...f, kvkDays })} label="KVK-Tag" tone={KIND.KVK.chip} />
          )}
        </Field>
      </div>
      {!wk && <p className="text-xs text-slate-500">Der WK wird mit dem Vorbereitungs-Zeitplan der Kompanie angelegt; der Kp Kdt plant darin das Arbeitsprogramm.</p>}
      {wk && !ro && <p className="text-xs text-slate-500">Liegen schon Blöcke des Arbeitsprogramms an einem entfernten Tag, wird die Änderung abgelehnt.</p>}
    </Modal>
  );
}
