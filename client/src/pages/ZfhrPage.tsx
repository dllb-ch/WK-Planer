import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Posten, ZfhrProgramm } from '@shared/types';
import { canEditZfhr, canViewZfhr } from '@shared/permissions';
import { fmtDate, fmtTime, weekday, zieleFor } from '@shared/util';
import { api, type WkDetail } from '../api';
import { Briefkopf, usePrintPage } from '../components/Briefkopf';
import { useUser } from '../auth';
import { ListEditor } from '../components/ListEditor';
import { Button, Card, Empty, errMsg, TextArea, useToast } from '../components/ui';

export function ZfhrPage({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const { wk, zuege } = detail;
  const visible = zuege.filter((z) => canViewZfhr(me, wk, z.id));
  const [zugId, setZugId] = useState<number | null>(visible.find((z) => z.id === me.zugId)?.id ?? visible[0]?.id ?? null);

  usePrintPage(`Zugführerarbeitsprogramm ${zuege.find((z) => z.id === zugId)?.name ?? ''} · ${wk.title}`);
  if (!zugId) return <Empty>Kein Zug verfügbar.</Empty>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Briefkopf printOnly />
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Zugführerarbeitsprogramm</h2>
          <select className="input no-print !w-auto" value={zugId} onChange={(e) => setZugId(Number(e.target.value))}>
            {visible.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          <Button className="no-print" onClick={() => window.print()}>
            Drucken
          </Button>
        </div>
        <ZfhrEditor key={zugId} detail={detail} zugId={zugId} editable={canEditZfhr(me, wk, zugId)} />
      </div>
    </div>
  );
}

function ZfhrEditor({ detail, zugId, editable }: { detail: WkDetail; zugId: number; editable: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, blocks, locations } = detail;
  // Groups are managed in the Zugansicht; older programmes may still carry their own list.
  const zugGroups = detail.groups.filter((g) => g.zugId === zugId).map((g) => g.name);
  const q = useQuery({ queryKey: ['zfhr', wk.id, zugId], queryFn: () => api.zfhr(wk.id, zugId) });
  const konzept = useQuery({ queryKey: ['konzept', wk.id], queryFn: () => api.konzept(wk.id) });
  const [p, setP] = useState<ZfhrProgramm | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data && !dirty) setP(q.data);
  }, [q.data, dirty]);
  if (!p) return <div className="text-slate-500">Laden …</div>;
  const gruppen = zugGroups.length ? zugGroups : p.gruppen;

  const set = (patch: Partial<ZfhrProgramm>) => {
    setP({ ...p, ...patch });
    setDirty(true);
  };
  const setPosten = (i: number, patch: Partial<Posten>) => set({ posten: p.posten.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const save = async () => {
    try {
      const { wkId: _w, zugId: _z, ...data } = p;
      await api.saveZfhr(wk.id, zugId, data);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['zfhr', wk.id, zugId] });
      toast('Zugführerarbeitsprogramm gespeichert');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  // Rotation rows: training and exercise blocks of this Zug from the Arbeitsprogramm.
  const slots = blocks
    .filter((b) => b.zugIds.includes(zugId) && ['AUSBILDUNG', 'UEBUNG'].includes(b.type))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const rot = (blockId: number, gruppe: string) => p.rotation.find((r) => r.blockId === blockId && r.gruppe === gruppe)?.postenNr ?? '';
  const setRot = (blockId: number, gruppe: string, nr: number | null) => {
    const rest = p.rotation.filter((r) => !(r.blockId === blockId && r.gruppe === gruppe));
    set({ rotation: nr == null ? rest : [...rest, { blockId, gruppe, postenNr: nr }] });
  };

  return (
    <>
      {editable && (
        <div className="no-print sticky top-0 z-10 flex justify-end">
          <Button variant="primary" disabled={!dirty} onClick={save}>
            {dirty ? 'Speichern' : 'Gespeichert'}
          </Button>
        </div>
      )}
      {konzept.data && zieleFor(konzept.data.zielsetzungen, zugId).length > 0 && (
        <Card title="Vorgaben aus dem WK-Konzept">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            {zieleFor(konzept.data.zielsetzungen, zugId).map((z, i) => (
              <li key={i}>{z.text}</li>
            ))}
          </ol>
        </Card>
      )}
      <Card title="Ziele des Zuges (heruntergebrochen auf Stufe Gruppe)">
        <ListEditor items={p.ziele} onChange={(v) => set({ ziele: v })} readOnly={!editable} placeholder="Jede Gruppe kann …" />
      </Card>

      <Card title="Arbeitsposten">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="w-14 py-1 pr-2">Nr</th>
                <th className="py-1 pr-2">Thema</th>
                <th className="py-1 pr-2">Ort</th>
                <th className="py-1 pr-2">Lernziel / Auftrag</th>
                <th className="py-1 pr-2">Material / Hilfsmittel</th>
                <th className="py-1 pr-2">Postenchef</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {p.posten.map((x, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  {editable ? (
                    <>
                      <td className="py-1 pr-2">
                        <input className="input" type="number" value={x.nr} onChange={(e) => setPosten(i, { nr: Number(e.target.value) })} />
                      </td>
                      {(['thema', 'ort', 'lernziel', 'material', 'postenchef'] as const).map((f) => (
                        <td key={f} className="py-1 pr-2">
                          <input className="input" value={x[f]} onChange={(e) => setPosten(i, { [f]: e.target.value })} />
                        </td>
                      ))}
                      <td className="py-1">
                        <button className="mt-1.5 text-slate-400 hover:text-red-600" onClick={() => set({ posten: p.posten.filter((_, j) => j !== i) })} aria-label="Posten entfernen">
                          ✕
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2 font-semibold">{x.nr}</td>
                      <td className="py-1.5 pr-2">{x.thema}</td>
                      <td className="py-1.5 pr-2">{x.ort}</td>
                      <td className="py-1.5 pr-2">{x.lernziel}</td>
                      <td className="py-1.5 pr-2">{x.material}</td>
                      <td className="py-1.5 pr-2">{x.postenchef}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.posten.length === 0 && <Empty>Noch keine Posten erfasst.</Empty>}
        {editable && (
          <Button
            variant="ghost"
            onClick={() => set({ posten: [...p.posten, { nr: Math.max(0, ...p.posten.map((x) => x.nr)) + 1, thema: '', ort: '', lernziel: '', material: '', postenchef: '' }] })}
          >
            + Posten
          </Button>
        )}
      </Card>

      <Card title="Rotationsablauf">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="label !mb-0">Gruppen</span>
          <span>{gruppen.join(', ') || '–'}</span>
          <Link to="../zug" className="text-xs text-zs-blue hover:underline">
            in der Zugansicht verwalten →
          </Link>
        </div>
        {slots.length === 0 || gruppen.length === 0 ? (
          <Empty>Gruppen erfassen und Ausbildungsblöcke im Arbeitsprogramm planen, um die Rotation festzulegen.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2">Zeitfenster (aus Arbeitsprogramm)</th>
                  {gruppen.map((g) => (
                    <th key={g} className="py-1 pr-2">
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="py-1 pr-2">
                      <div className="font-medium">{b.title}</div>
                      <div className="text-xs text-slate-500">
                        {weekday(b.date).slice(0, 2)} {fmtDate(b.date).slice(0, 6)} {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                        {b.locationId && ` · ${locations.find((l) => l.id === b.locationId)?.name ?? ''}`}
                      </div>
                    </td>
                    {gruppen.map((g) => (
                      <td key={g} className="py-1 pr-2">
                        {editable ? (
                          <select className="input" value={rot(b.id, g)} onChange={(e) => setRot(b.id, g, e.target.value ? Number(e.target.value) : null)}>
                            <option value="">–</option>
                            {p.posten.map((x) => (
                              <option key={x.nr} value={x.nr}>
                                {x.nr} {x.thema}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{(() => {
                            const nr = rot(b.id, g);
                            const x = p.posten.find((y) => y.nr === nr);
                            return x ? `${x.nr} ${x.thema}` : '–';
                          })()}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Kontroll- und Besprechungspunkte / Aktivitäten des Zugführers">
        {editable ? (
          <TextArea rows={4} value={p.zfhrAktivitaeten} onChange={(e) => set({ zfhrAktivitaeten: e.target.value })} />
        ) : (
          <p className="whitespace-pre-wrap text-sm">{p.zfhrAktivitaeten || '–'}</p>
        )}
      </Card>
    </>
  );
}
