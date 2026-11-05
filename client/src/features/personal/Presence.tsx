import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckIn, Diet, HealthCheck, Participant } from '@shared/types';
import { DIET_LABEL, KDO_ID } from '@shared/types';
import { canManagePersonnel, canMarkPresent } from '@shared/permissions';
import { fmtDate, weekday, wkDays } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { Button, Card, Empty, errMsg, useToast } from '../../components/ui';
import { withKdo } from '../arbeitsprogramm/columns';
import { ParticipantDialog } from './Participants';
import { servesOn } from './PersonalPage';

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(new Date());
const time = (c: CheckIn) => new Date(c.createdAt.replace(' ', 'T') + 'Z').toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/([aou])e/g, '$1');

/** Presence of a day: per Zug planned / on the list / present, the list with check-ins, open matches and the meal count. */
export function Presence({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const days = wkDays(wk);
  const [date, setDate] = useState(() => (days.includes(today()) ? today() : (days.find((d) => d >= wk.startDate && d >= today()) ?? days[0])));
  const manage = canManagePersonnel(me, wk);
  const participants = useQuery({ queryKey: ['participants', wk.id], queryFn: () => api.participants(wk.id) });
  // New check-ins arrive while people scan the code.
  const checkins = useQuery({ queryKey: ['checkins', wk.id], queryFn: () => api.checkins(wk.id), refetchInterval: 10_000 });
  const strength = useQuery({ queryKey: ['strength', wk.id], queryFn: () => api.strength(wk.id) });
  // Eintrittsbefragung per person: reports and restrictions show in the list.
  const health = useQuery({ queryKey: ['health', wk.id], queryFn: () => api.health(wk.id), refetchInterval: 15_000 });
  const healthOf = new Map((health.data ?? []).filter((h) => h.participantId !== null).map((h) => [h.participantId!, h]));
  const [zugFilter, setZugFilter] = useState<number | ''>(me.role === 'ZFHR' && me.zugId ? me.zugId : '');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [adding, setAdding] = useState<CheckIn | null>(null);

  const ofDay = (checkins.data ?? []).filter((c) => c.date === date);
  const byParticipant = new Map(ofDay.filter((c) => c.participantId !== null).map((c) => [c.participantId!, c]));
  const unmatched = ofDay.filter((c) => c.participantId === null);
  const people = (participants.data ?? []).filter((p) => servesOn(p, date));
  const planned = (zugId: number) => strength.data?.find((s) => s.zugId === zugId && s.date === date)?.planned ?? 0;
  const zugName = (id: number | null) => zuege.find((z) => z.id === id)?.name ?? '';
  const refresh = () => qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === 'checkins' || x.queryKey[0] === 'participants' });

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      refresh();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const rows = withKdo(wk.kpId, zuege)
    .filter((z) => z.id !== KDO_ID || planned(KDO_ID) > 0)
    .map((z) => {
      const list = people.filter((p) => (z.id === KDO_ID ? false : p.zugId === z.id));
      return { z, planned: planned(z.id), list: list.length, present: list.filter((p) => byParticipant.has(p.id)).length };
    });
  const noZug = people.filter((p) => p.zugId === null);
  const totalPresent = byParticipant.size + unmatched.length;

  const shown = people
    .filter((p) => zugFilter === '' || p.zugId === zugFilter)
    .filter((p) => !onlyMissing || !byParticipant.has(p.id))
    .sort((a, b) => (zugName(a.zugId) || '~').localeCompare(zugName(b.zugId) || '~') || a.nachname.localeCompare(b.nachname));

  // Meals: everyone checked in that day, also not yet matched.
  const meals = useMemo(() => {
    const count: Record<Diet, number> = { NORMAL: 0, KEIN_SCHWEIN: 0, VEGETARISCH: 0 };
    const special: { name: string; diet: Diet; text: string }[] = [];
    for (const c of ofDay) {
      count[c.diet]++;
      if (c.intolerances.trim()) special.push({ name: `${c.vorname} ${c.nachname}`, diet: c.diet, text: c.intolerances });
    }
    return { count, special };
  }, [ofDay]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)}>
          {days.map((d) => (
            <option key={d} value={d}>
              {weekday(d)}, {fmtDate(d)}
              {d === today() ? ' (heute)' : ''}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-600">
          <b className="text-lg tabular-nums text-slate-900">{totalPresent}</b> eingecheckt
          {people.length > 0 && <> von {people.length} auf der Liste</>}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
        <Card title="Bestand pro Zug">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 pr-2">Zug</th>
                <th className="py-1 pr-2 text-right">Soll</th>
                <th className="py-1 pr-2 text-right">Liste</th>
                <th className="py-1 pr-2 text-right">Anwesend</th>
                <th className="py-1 text-right">Fehlend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ z, planned, list, present }) => (
                <tr key={z.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap py-1 pr-2">{z.name}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{planned || '–'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{list || '–'}</td>
                  <td className="py-1 pr-2 text-right font-semibold tabular-nums">{present}</td>
                  <td className={`py-1 text-right tabular-nums ${list - present > 0 ? 'text-red-700' : 'text-slate-400'}`}>{list ? list - present : '–'}</td>
                </tr>
              ))}
              {noZug.length > 0 && (
                <tr className="border-t border-slate-100 text-slate-500">
                  <td className="py-1 pr-2">ohne Zug</td>
                  <td />
                  <td className="py-1 pr-2 text-right tabular-nums">{noZug.length}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{noZug.filter((p) => byParticipant.has(p.id)).length}</td>
                  <td />
                </tr>
              )}
              {unmatched.length > 0 && (
                <tr className="border-t border-slate-100 text-amber-800">
                  <td className="py-1 pr-2">nicht zugeordnet</td>
                  <td />
                  <td />
                  <td className="py-1 pr-2 text-right tabular-nums">{unmatched.length}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card title="Verpflegung">
          {ofDay.length === 0 ? (
            <Empty>Noch niemand eingecheckt.</Empty>
          ) : (
            <>
              <ul className="space-y-0.5 text-sm">
                {(Object.keys(DIET_LABEL) as Diet[]).map((d) => (
                  <li key={d} className="flex justify-between">
                    <span>{DIET_LABEL[d]}</span>
                    <b className="tabular-nums">{meals.count[d]}</b>
                  </li>
                ))}
              </ul>
              {meals.special.length > 0 && (
                <div className="mt-2 border-t border-slate-100 pt-2 text-xs">
                  <div className="font-medium text-slate-700">Unverträglichkeiten</div>
                  <ul>
                    {meals.special.map((s, i) => (
                      <li key={i}>
                        {s.name}: <b>{s.text}</b>
                        {s.diet !== 'NORMAL' && ` (${DIET_LABEL[s.diet]})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {unmatched.length > 0 && (manage || me.role !== 'ZFHR') && (
        <Card title={`Nicht zugeordnete Check-ins (${unmatched.length})`}>
          <p className="mb-2 text-sm text-slate-600">Diese Personen wurden nicht eindeutig auf der Teilnehmerliste gefunden.</p>
          <ul className="divide-y divide-slate-100">
            {unmatched.map((c) => (
              <Unmatched
                key={c.id}
                c={c}
                people={participants.data ?? []}
                taken={byParticipant}
                zugName={zugName}
                manage={manage}
                onMatch={(participantId) => run(() => api.matchCheckin(wk.id, c.id, { participantId }))}
                onAdd={() => setAdding(c)}
                onDelete={() => confirm('Check-in löschen?') && run(() => api.deleteCheckin(wk.id, c.id))}
              />
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Präsenzliste"
        actions={
          <Button onClick={() => window.print()} className="no-print">
            Drucken
          </Button>
        }
      >
        <div className="no-print mb-3 flex flex-wrap items-center gap-3 text-sm">
          <select className="input w-auto" value={zugFilter} onChange={(e) => setZugFilter(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Alle Züge</option>
            {zuege.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> nur fehlende
          </label>
        </div>
        {participants.isLoading ? (
          <Empty>Laden …</Empty>
        ) : people.length === 0 ? (
          <Empty>Keine Teilnehmerliste für diesen Tag. Sie wird im Bereich «Teilnehmerliste» importiert.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="w-10 py-1.5" />
                <th className="py-1.5 pr-3">Name</th>
                <th className="py-1.5 pr-3 max-sm:hidden">Funktion</th>
                <th className="py-1.5 pr-3">Zug</th>
                <th className="py-1.5 pr-3">Check-in</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const c = byParticipant.get(p.id);
                const can = canMarkPresent(me, wk, p.zugId);
                return (
                  <tr key={p.id} className={`border-t border-slate-100 ${c ? '' : 'text-slate-500'}`}>
                    <td className="py-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!c}
                        disabled={!can}
                        aria-label={`${p.vorname} ${p.nachname} anwesend`}
                        onChange={(e) => run(() => api.setPresence(wk.id, p.id, date, e.target.checked))}
                      />
                    </td>
                    <td className="py-1.5 pr-3 font-medium">{[p.grad, p.nachname, p.vorname].filter(Boolean).join(' ')}</td>
                    <td className="py-1.5 pr-3 max-sm:hidden">{p.funktion}</td>
                    <td className="py-1.5 pr-3">{zugName(p.zugId)}</td>
                    <td className="py-1.5 pr-3 text-xs">
                      {c ? (
                        <>
                          {time(c)} {c.source === 'MANUAL' ? '(manuell)' : '(QR)'}
                          {c.diet !== 'NORMAL' && <span className="ml-1 rounded bg-slate-100 px-1">{DIET_LABEL[c.diet]}</span>}
                          {c.intolerances && <span className="ml-1 rounded bg-amber-100 px-1">{c.intolerances}</span>}
                          <HealthBadge h={healthOf.get(p.id)} />
                        </>
                      ) : (
                        <span className="text-red-700">fehlt</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {adding && (
        <ParticipantDialog
          detail={detail}
          title="Auf die Teilnehmerliste nehmen"
          initial={{ nachname: adding.nachname, vorname: adding.vorname, email: adding.email, zugId: adding.zugId }}
          onClose={() => setAdding(null)}
          onSaved={refresh}
          onSubmit={async (create) => {
            await api.matchCheckin(wk.id, adding.id, { create });
          }}
        />
      )}
    </>
  );
}

/** Similar names first: same last name, same first name or same e-mail. */
function suggestions(c: CheckIn, people: Participant[]) {
  const v = norm(c.vorname);
  const n = norm(c.nachname);
  const score = (p: Participant) =>
    (norm(p.nachname) === n ? 2 : 0) +
    (norm(p.vorname) === v ? 1 : 0) +
    (p.email && p.email.toLowerCase() === c.email.toLowerCase() ? 3 : 0) +
    (norm(p.nachname).startsWith(n.slice(0, 3)) ? 0.5 : 0) +
    (p.zugId === c.zugId ? 0.5 : 0);
  return people
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => x.p);
}

function Unmatched({
  c,
  people,
  taken,
  zugName,
  manage,
  onMatch,
  onAdd,
  onDelete,
}: {
  c: CheckIn;
  people: Participant[];
  taken: Map<number, CheckIn>;
  zugName: (id: number | null) => string;
  manage: boolean;
  onMatch: (participantId: number) => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const [pick, setPick] = useState<number | ''>('');
  const sugg = suggestions(c, people);
  const label = (p: Participant) => `${p.nachname} ${p.vorname}${p.zugId ? ` (${zugName(p.zugId)})` : ''}${taken.has(p.id) ? ' – bereits eingecheckt' : ''}`;
  return (
    <li className="space-y-1.5 py-2">
      <div className="text-sm">
        <b>
          {c.vorname} {c.nachname}
        </b>{' '}
        <span className="text-slate-500">
          · {c.email}
          {c.zugId && ` · ${zugName(c.zugId)}`} · {time(c)}
        </span>
      </div>
      {manage && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {sugg.map((p) => (
            <button key={p.id} className="rounded-full border border-zs-blue px-2 py-0.5 text-zs-blue hover:bg-blue-50" onClick={() => onMatch(p.id)}>
              = {label(p)}
            </button>
          ))}
          <select className="input w-auto py-0.5 text-xs" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Andere Person …</option>
            {[...people]
              .sort((a, b) => a.nachname.localeCompare(b.nachname))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p)}
                </option>
              ))}
          </select>
          <Button className="py-0.5 text-xs" disabled={pick === ''} onClick={() => pick !== '' && onMatch(pick)}>
            Zuordnen
          </Button>
          <Button className="py-0.5 text-xs" onClick={onAdd}>
            Neu auf Liste
          </Button>
          <Button variant="ghost" className="py-0.5 text-xs text-red-700" onClick={onDelete}>
            Löschen
          </Button>
        </div>
      )}
    </li>
  );
}

/** Eintrittsbefragung of a present person: not asked, reported (to the Kursarzt) or a restriction. */
function HealthBadge({ h }: { h: HealthCheck | undefined }) {
  if (!h) return <span className="ml-1 rounded bg-slate-100 px-1 text-slate-600" title="Sanitarische Eintrittsbefragung fehlt">nicht befragt</span>;
  if (h.restriction) return <span className="ml-1 rounded bg-sky-100 px-1 text-sky-900" title="Vom Kursarzt angeordnet">⚕ {h.restriction}</span>;
  if (h.status === 'MELDUNG') return <span className="ml-1 rounded bg-orange-100 px-1 text-orange-900">⚕ zum Kursarzt</span>;
  return null;
}
