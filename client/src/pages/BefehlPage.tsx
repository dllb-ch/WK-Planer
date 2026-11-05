import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Ausbildungsbefehl, AuftragKp, WkSync } from '@shared/types';
import { canEditBefehl } from '@shared/permissions';
import { fmtDate, wkDays } from '@shared/util';
import { api, type WkSummary } from '../api';
import { useUser } from '../auth';
import { Button, Card, Empty, errMsg, Field, TextArea, useToast } from '../components/ui';

type Draft = Omit<Ausbildungsbefehl, 'id' | 'batId' | 'year'>;
const empty = (): Draft => ({ dienstart: 'Wiederholungskurse nach Art. 53 BZG', leitziel: '', absicht: '', organisation: '', besonderes: '', auftraege: [], files: [] });

export function BefehlPage() {
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
      toast(['Ausbildungsbefehl gespeichert', ...saved.wks.map(syncText).filter(Boolean)].join(' · '));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const yearOptions = Array.from(new Set([...(years.data ?? []), activeYear, ...newYears])).sort((a, b) => b - a);
  const switchYear = (y: number) => {
    if (dirty && !confirm('Nicht gespeicherte Änderungen verwerfen?')) return;
    setYear(y);
    setDirty(false);
    setD(null);
  };
  const addYear = () => {
    const proposal = Math.max(new Date().getFullYear(), ...yearOptions) + 1;
    const input = prompt('Ausbildungsbefehl für welches Jahr?', String(proposal));
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
      toast(`«${file.name}» angehängt`);
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
          <h1 className="text-xl font-semibold">Ausbildungsbefehl des Bataillons</h1>
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
              + Neues Jahr
            </Button>
          )}
          <span className="flex-1" />
          <Button className="no-print" onClick={() => window.print()}>
            Drucken
          </Button>
          {editable && (
            <Button className="no-print" variant="primary" disabled={!dirty} onClick={save}>
              Speichern
            </Button>
          )}
        </div>
        {!editable && <p className="text-sm text-slate-500">Vom Bat Kommando erteilt. Sie sehen den Auftrag an Ihre Kompanie.</p>}

        {!d ? (
          <Card>
            <Empty>Für {activeYear} wurde noch kein Ausbildungsbefehl erteilt.</Empty>
          </Card>
        ) : (
          <>
            <Card
              title="Dokumente"
              actions={
                editable && (
                  <label className="no-print cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    + PDF anhängen
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
                <p className="text-sm text-slate-400">{editable ? 'Unterschriebenen Befehl oder Beilagen als PDF anhängen.' : 'Keine Dokumente angehängt.'}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <span aria-hidden>📄</span>
                      <a href={api.befehlFileUrl(activeYear, f.id)} target="_blank" rel="noreferrer" className="text-zs-blue hover:underline">
                        {f.name}
                      </a>
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
                          Entfernen
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="1. Dienstart und Rechtsgrundlagen">
              <Text value={d.dienstart} editable={editable} onChange={(v) => set({ dienstart: v })} rows={1} />
            </Card>
            <Card title="2. Ziel und Zweck (Leitziel)">
              <Text value={d.leitziel} editable={editable} onChange={(v) => set({ leitziel: v })} />
            </Card>
            <Card title="3. Absicht des Bat Kdt">
              <Text value={d.absicht} editable={editable} onChange={(v) => set({ absicht: v })} />
            </Card>
            <Card title="4. Aufträge an die Kompanien (Richtziele)">
              {shownKps.length === 0 && <Empty>Keine Aufträge.</Empty>}
              <div className="space-y-4">
                {shownKps.map((k) => {
                  const a = auftrag(k.id);
                  return (
                    <div key={k.id} className="rounded-md border border-slate-200 p-3">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold">{k.name}</h3>
                        {editable && (
                          <Link to="/jahresplanung" className="no-print text-sm text-zs-blue hover:underline">
                            Daten in der Jahresplanung →
                          </Link>
                        )}
                      </div>
                      {editable ? (
                        <div className="space-y-2">
                          <Field label="Richtziele">
                            <TextArea value={a.richtziele} onChange={(e) => setAuftrag(k.id, { richtziele: e.target.value })} />
                          </Field>
                          <Field label="Teilnehmende">
                            <input className="input" value={a.teilnehmende} onChange={(e) => setAuftrag(k.id, { teilnehmende: e.target.value })} />
                          </Field>
                          <Dienste wks={wksOf(k.id)} />
                        </div>
                      ) : (
                        <div className="space-y-1 text-sm">
                          <p className="whitespace-pre-wrap">{a.richtziele}</p>
                          <p className="text-slate-600">
                            <b>Teilnehmende:</b> {a.teilnehmende || '–'}
                          </p>
                          <Dienste wks={wksOf(k.id)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="5. Organisation der Anlässe (Verantwortlichkeiten)">
              <Text value={d.organisation} editable={editable} onChange={(v) => set({ organisation: v })} />
            </Card>
            <Card title="6. Besonderes">
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
  if (wks.length === 0) return <p className="text-sm text-slate-500">Noch kein WK in der Jahresplanung.</p>;
  return (
    <ul className="space-y-0.5 text-sm text-slate-600">
      {wks.map((w) => (
        <li key={w.id}>
          <Link to={`/wk/${w.id}`} className="font-medium text-zs-blue hover:underline print:text-black">
            {w.title}
          </Link>
          {w.avorDays.length > 0 && <> · <b>AVOR:</b> {w.avorDays.map(fmtDate).join(', ')}</>}
          {w.kvkDays.length > 0 && <> · <b>KVK:</b> {w.kvkDays.map(fmtDate).join(', ')}</>} · <b>WK:</b> {fmtDate(w.startDate)} – {fmtDate(w.endDate)}
        </li>
      ))}
    </ul>
  );
}

const syncText = (w: WkSync) =>
  w.action === 'created'
    ? `WK ${w.kpName} angelegt`
    : w.action === 'linked'
      ? `WK ${w.kpName} verknüpft`
      : w.action === 'updated'
        ? `Daten WK ${w.kpName} angepasst`
        : w.action === 'locked'
          ? `WK ${w.kpName} ist eingereicht/freigegeben – Daten nicht geändert`
          : '';
