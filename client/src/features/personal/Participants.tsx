import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Participant, ParticipantInput, Zug } from '@shared/types';
import { DIET_LABEL } from '@shared/types';
import { canManagePersonnel } from '@shared/permissions';
import { fmtDate, wkDays } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { ImportExportMenu } from '../../components/ImportExport';
import { Button, Card, Empty, errMsg, Field, Modal, useToast } from '../../components/ui';
import { exportTable, importTable } from '../../lib/tableFile';

import { ALIASES, applyZugMapping, COLUMNS, parseParticipants, type ParsedImport } from './participantImport';

const fullName = (p: Pick<Participant, 'grad' | 'vorname' | 'nachname'>) => [p.grad, p.nachname, p.vorname].filter(Boolean).join(' ');

export function Participants({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, zuege } = detail;
  const manage = canManagePersonnel(me, wk);
  const q = useQuery({ queryKey: ['participants', wk.id], queryFn: () => api.participants(wk.id) });
  const [zugFilter, setZugFilter] = useState<number | 'none' | ''>('');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Partial<Participant> | null>(null);
  const [pending, setPending] = useState<ParsedImport | null>(null);
  // Zug per Funktion (personnel system without Zug column); remembered per Kp for the next import.
  const mappingKey = `zs-funktion-zug-${wk.kpId}`;
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const zugName = (id: number | null) => zuege.find((z) => z.id === id)?.name ?? '';
  const list = (q.data ?? [])
    .filter((p) => zugFilter === '' || (zugFilter === 'none' ? p.zugId === null : p.zugId === zugFilter))
    .filter((p) => !search || `${p.vorname} ${p.nachname} ${p.funktion} ${p.grad}`.toLowerCase().includes(search.toLowerCase()));
  const refresh = () => qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === 'participants' || x.queryKey[0] === 'checkins' });

  const exportFile = (format: 'xlsx' | 'json') =>
    exportTable(
      `Teilnehmerliste_${wk.title.replace(/[^\w]+/g, '_')}`,
      'WK-Planer Teilnehmerliste',
      COLUMNS,
      (q.data ?? []).map((p) => ({
        nachname: p.nachname,
        vorname: p.vorname,
        grad: p.grad,
        funktion: p.funktion,
        zug: zugName(p.zugId),
        email: p.email,
        nummer: p.extId,
        tage: p.days.map(fmtDate).join(', '),
        essen: DIET_LABEL[p.diet],
        unvertraeglichkeiten: p.intolerances,
      })),
      format,
    );

  const importFile = async (file: File) => {
    const rows = await importTable(file, [...COLUMNS, ...ALIASES]);
    const parsed = parseParticipants(rows, wk, zuege);
    if (!parsed.items.length) throw new Error('Keine Personen mit Nachname in der Datei gefunden');
    let saved: Record<string, number | null> = {};
    try {
      saved = JSON.parse(localStorage.getItem(mappingKey) ?? '{}');
    } catch {
      /* no storage */
    }
    const ids = new Set(zuege.map((z) => z.id));
    setMapping(
      Object.fromEntries(
        parsed.funktionen.map((f) => [f.funktion, f.funktion in saved && (saved[f.funktion] === null || ids.has(saved[f.funktion]!)) ? saved[f.funktion] : f.guess]),
      ),
    );
    setPending(parsed);
  };
  const runImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    try {
      try {
        localStorage.setItem(mappingKey, JSON.stringify(mapping));
      } catch {
        /* no storage */
      }
      const r = await api.importParticipants(wk.id, mode, applyZugMapping(pending.items, mapping));
      refresh();
      toast(`${r.added} neu, ${r.updated} aktualisiert${r.removed ? `, ${r.removed} entfernt` : ''}`);
      setPending(null);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <Card
      title={`Teilnehmerliste (${q.data?.length ?? 0} Personen)`}
      actions={
        <>
          <ImportExportMenu onExport={exportFile} onImport={manage ? importFile : undefined} />
          {manage && (
            <Button variant="primary" onClick={() => setEdit({ zugId: typeof zugFilter === 'number' ? zugFilter : null })}>
              + Person
            </Button>
          )}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={zugFilter} onChange={(e) => setZugFilter(e.target.value === '' || e.target.value === 'none' ? e.target.value : Number(e.target.value))}>
          <option value="">Alle Züge</option>
          {zuege.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
          <option value="none">Ohne Zug</option>
        </select>
        <input className="input w-56" placeholder="Suchen …" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {manage && (q.data?.length ?? 0) === 0 && (
        <p className="mb-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-slate-700">
          Excel-Liste aus dem Personalsystem importieren (Import / Export). Erkannte Spalten: Nachname, Vorname, Grad, Funktion, Zug, E-Mail, Nummer
          (z. B. AHV-Nr.), Tage (leer = ganzer WK).
        </p>
      )}
      {manage && selected.length > 0 && (
        <BulkBar
          detail={detail}
          ids={selected}
          onDone={() => {
            setSelected([]);
            refresh();
          }}
        />
      )}
      {q.isLoading ? (
        <Empty>Laden …</Empty>
      ) : list.length === 0 ? (
        <Empty>Keine Personen.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                {manage && (
                  <th className="w-8 py-1.5">
                    <input
                      type="checkbox"
                      aria-label="Alle auswählen"
                      checked={list.length > 0 && list.every((p) => selected.includes(p.id))}
                      onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...list.map((p) => p.id)])] : selected.filter((id) => !list.some((p) => p.id === id)))}
                    />
                  </th>
                )}
                <th className="py-1.5 pr-3">Name</th>
                <th className="py-1.5 pr-3">Funktion</th>
                <th className="py-1.5 pr-3">Zug</th>
                <th className="py-1.5 pr-3 max-sm:hidden">E-Mail</th>
                <th className="py-1.5 pr-3 max-sm:hidden">Tage</th>
                <th className="py-1.5 pr-3 max-md:hidden">Essen</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr
                  key={p.id}
                  className={`border-t border-slate-100 ${manage ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  onClick={() => manage && setEdit(p)}
                >
                  {manage && (
                    <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`${fullName(p)} auswählen`}
                        checked={selected.includes(p.id)}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
                      />
                    </td>
                  )}
                  <td className="py-1.5 pr-3 font-medium">{fullName(p)}</td>
                  <td className="py-1.5 pr-3">{p.funktion}</td>
                  <td className="py-1.5 pr-3">{zugName(p.zugId) || <span className="text-amber-700">–</span>}</td>
                  <td className="py-1.5 pr-3 max-sm:hidden">{p.email}</td>
                  <td className="py-1.5 pr-3 text-xs max-sm:hidden">{p.days.length ? p.days.map((d) => fmtDate(d).slice(0, 6)).join(', ') : 'ganzer WK'}</td>
                  <td className="py-1.5 pr-3 text-xs max-md:hidden">
                    {p.diet !== 'NORMAL' && DIET_LABEL[p.diet]}
                    {p.intolerances && <span className="text-slate-500"> {p.intolerances}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <ParticipantDialog detail={detail} initial={edit} onClose={() => setEdit(null)} onSaved={refresh} />}
      {pending && (
        <Modal
          title="Teilnehmerliste importieren"
          onClose={() => setPending(null)}
          footer={
            <>
              <Button onClick={() => setPending(null)}>Abbrechen</Button>
              {(q.data?.length ?? 0) > 0 && (
                <Button variant="danger" onClick={() => runImport('replace')}>
                  Liste ersetzen
                </Button>
              )}
              <Button variant="primary" onClick={() => runImport('merge')}>
                {(q.data?.length ?? 0) > 0 ? 'Zusammenführen' : 'Importieren'}
              </Button>
            </>
          }
        >
          <p className="text-sm">{pending.items.length} Personen in der Datei gefunden.</p>
          {(q.data?.length ?? 0) > 0 && (
            <p className="text-sm text-slate-600">
              <b>Zusammenführen</b> aktualisiert bekannte Personen (nach Nummer oder Name) und ergänzt neue. <b>Liste ersetzen</b> entfernt zusätzlich alle,
              die nicht in der Datei sind.
            </p>
          )}
          {pending.outside > 0 && (
            <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">
              {pending.outside} Personen haben laut Datei keine Diensttage in diesem WK ({wk.title}). Sie werden für den ganzen WK übernommen – stimmt
              die Datei?
            </p>
          )}
          {pending.funktionen.length > 0 && (
            <div>
              <div className="label">Zug pro Funktion (die Datei enthält keinen Zug)</div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {pending.funktionen.map((f) => (
                  <label key={f.funktion} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {f.funktion} <span className="text-xs text-slate-500">({f.count})</span>
                    </span>
                    <select
                      className="input !w-44 py-1 text-sm"
                      value={mapping[f.funktion] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [f.funktion]: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">ohne Zug (Kdo)</option>
                      {zuege.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Personen, die schon auf der Liste sind, behalten ihren Zug. Die Zuordnung wird für den nächsten Import gemerkt.</p>
            </div>
          )}
          {pending.unknownZuege.length > 0 && (
            <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">
              Unbekannte Züge (Personen werden ohne Zug übernommen): {pending.unknownZuege.join(', ')}. Bekannt sind: {zuege.map((z) => z.name).join(', ')}.
            </p>
          )}
        </Modal>
      )}
    </Card>
  );
}

export function ParticipantDialog({
  detail,
  initial,
  onClose,
  onSaved,
  title,
  onSubmit,
}: {
  detail: WkDetail;
  initial: Partial<Participant>;
  onClose: () => void;
  onSaved: () => void;
  title?: string;
  /** Instead of saving the person: e.g. add from an unmatched check-in. */
  onSubmit?: (p: ParticipantInput) => Promise<void>;
}) {
  const toast = useToast();
  const { wk, zuege } = detail;
  const days = wkDays(wk);
  const [p, setP] = useState<ParticipantInput>({
    nachname: initial.nachname ?? '',
    vorname: initial.vorname ?? '',
    grad: initial.grad ?? '',
    funktion: initial.funktion ?? '',
    zugId: initial.zugId ?? null,
    email: initial.email ?? '',
    extId: initial.extId ?? '',
    days: initial.days ?? [],
  });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onSaved();
      onClose();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const save = () =>
    run(() => (onSubmit ? onSubmit(p) : initial.id ? api.updateParticipant(wk.id, initial.id, p) : api.createParticipant(wk.id, p)));
  return (
    <Modal
      title={title ?? (initial.id ? 'Person bearbeiten' : 'Person hinzufügen')}
      onClose={onClose}
      footer={
        <>
          {initial.id && !onSubmit && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => confirm('Person von der Liste entfernen?') && run(() => api.deleteParticipant(wk.id, initial.id!))}
            >
              Entfernen
            </Button>
          )}
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!p.nachname.trim()} onClick={save}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nachname">
          <input className="input" value={p.nachname} onChange={(e) => setP({ ...p, nachname: e.target.value })} />
        </Field>
        <Field label="Vorname">
          <input className="input" value={p.vorname} onChange={(e) => setP({ ...p, vorname: e.target.value })} />
        </Field>
        <Field label="Grad">
          <input className="input" value={p.grad} onChange={(e) => setP({ ...p, grad: e.target.value })} />
        </Field>
        <Field label="Funktion">
          <input className="input" value={p.funktion} onChange={(e) => setP({ ...p, funktion: e.target.value })} />
        </Field>
        <Field label="Zug">
          <select className="input" value={p.zugId ?? ''} onChange={(e) => setP({ ...p, zugId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">– ohne –</option>
            {zuege.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="E-Mail">
          <input className="input" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
        </Field>
        <Field label="Nummer (Personalsystem)">
          <input className="input" value={p.extId} onChange={(e) => setP({ ...p, extId: e.target.value })} />
        </Field>
      </div>
      <div>
        <span className="label">Diensttage (keine Auswahl = ganzer WK)</span>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => {
            const on = p.days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setP({ ...p, days: on ? p.days.filter((x) => x !== d) : [...p.days, d].sort() })}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-zs-blue bg-blue-50 text-zs-blue' : 'border-slate-300 text-slate-600'}`}
              >
                {fmtDate(d).slice(0, 6)}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/** Several selected people: Zug and/or days of service at once. */
function BulkBar({ detail, ids, onDone }: { detail: WkDetail; ids: number[]; onDone: () => void }) {
  const toast = useToast();
  const { wk, zuege } = detail;
  const days = wkDays(wk);
  const [zug, setZug] = useState<string>('');
  const [serve, setServe] = useState<string[]>([]);
  const run = async (b: { zugId?: number | null; days?: string[] }, what: string) => {
    try {
      const r = await api.bulkParticipants(wk.id, { ids, ...b });
      toast(`${r.updated} Personen: ${what}`);
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const remove = async () => {
    if (!confirm(`${ids.length} Personen von der Teilnehmerliste entfernen? Ihre Check-ins bleiben (ohne Zuordnung) erhalten.`)) return;
    try {
      const r = await api.deleteParticipants(wk.id, ids);
      toast(`${r.deleted} Personen entfernt`);
      onDone();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <div className="no-print sticky top-0 z-10 mb-3 space-y-2 rounded-md border border-zs-blue bg-blue-50 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>{ids.length} ausgewählt</b>
        <span className="text-slate-400">|</span>
        <select className="input !w-auto py-1 text-sm" value={zug} onChange={(e) => setZug(e.target.value)} aria-label="Zug">
          <option value="">Zug wählen …</option>
          <option value="none">ohne Zug (Kdo)</option>
          {zuege.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <Button className="py-1 text-xs" disabled={!zug} onClick={() => run({ zugId: zug === 'none' ? null : Number(zug) }, 'Zug zugewiesen')}>
          Zug zuweisen
        </Button>
        <span className="flex-1" />
        <Button variant="danger" className="py-1 text-xs" onClick={remove}>
          {ids.length} entfernen
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-slate-600">Diensttage:</span>
        {days.map((d) => {
          const on = serve.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => setServe(on ? serve.filter((x) => x !== d) : [...serve, d].sort())}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-zs-blue bg-zs-blue text-white' : 'border-slate-300 bg-white text-slate-600'}`}
            >
              {wk.avorDays.includes(d) ? 'AVOR ' : wk.kvkDays.includes(d) ? 'KVK ' : ''}
              {fmtDate(d).slice(0, 6)}
            </button>
          );
        })}
        <Button className="py-1 text-xs" disabled={!serve.length} onClick={() => run({ days: serve }, 'Diensttage gesetzt')}>
          Tage setzen
        </Button>
        <Button className="py-1 text-xs" onClick={() => run({ days: [] }, 'ganzer WK')}>
          Ganzer WK
        </Button>
      </div>
    </div>
  );
}

