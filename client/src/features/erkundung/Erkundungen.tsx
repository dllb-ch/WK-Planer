// Erkundungsprotokoll (Anhänge S. 33–38): list of a WK and the protocol itself.
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckState, Erkundung, ErkundungInput, RiskLevel } from '@shared/types';
import { RISK_LABEL } from '@shared/types';
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
import { SAVE_LABEL, useAutosave } from '../../components/useAutosave';

const strip = ({ id: _i, wkId: _w, createdBy: _c, createdByName: _n, updatedAt: _u, attachmentCount: _a, ...rest }: Erkundung): ErkundungInput => rest;

export function ErkundungenPage({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const { wk, zuege } = detail;
  const q = useQuery({ queryKey: ['erkundungen', wk.id], queryFn: () => api.erkundungen(wk.id) });
  const [creating, setCreating] = useState(false);
  const scopes = [
    ...(canCreateErkundung(me, wk, null) ? [{ id: null as number | null, name: 'Kompanie' }] : []),
    ...zuege.filter((z) => canCreateErkundung(me, wk, z.id)).map((z) => ({ id: z.id as number | null, name: z.name })),
  ];
  const zugName = (id: number | null) => (id === null ? 'Kompanie' : (zuege.find((z) => z.id === id)?.name ?? ''));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-6">
        <Card
          title="Erkundungen"
          actions={
            scopes.length > 0 && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                + Erkundung
              </Button>
            )
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            Gelände, Gebäude und Räume beurteilen, Gefahren erkennen, Absprachen treffen – festgehalten im Erkundungsprotokoll (Handbuch S. 61,
            Anhänge S. 33).
          </p>
          {q.isLoading ? (
            <Empty>Laden …</Empty>
          ) : !q.data?.length ? (
            <Empty>Noch keine Erkundungen.</Empty>
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
      title="Neue Erkundung"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!f.title.trim()} onClick={create}>
            Anlegen
          </Button>
        </>
      }
    >
      <Field label="Bezeichnung">
        <input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="z. B. Dorfbach Zweiingen" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Für">
          <select className="input" value={f.zugId ?? ''} disabled={scopes.length < 2} onChange={(e) => setF({ ...f, zugId: e.target.value ? Number(e.target.value) : null })}>
            {scopes.map((s) => (
              <option key={s.id ?? 'kp'} value={s.id ?? ''}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Datum der Erkundung">
          <input type="date" className="input" value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

const RISK_COLOR: Record<Exclude<RiskLevel, ''>, string> = { HOCH: 'bg-red-100 text-red-800', MITTEL: 'bg-amber-100 text-amber-800', TIEF: 'bg-emerald-100 text-emerald-800' };
const RiskBadge = ({ level }: { level: Exclude<RiskLevel, ''> }) => (
  <span className={`rounded px-1.5 text-xs font-medium ${RISK_COLOR[level]}`}>Risiko {RISK_LABEL[level]}</span>
);

function RiskSelect({ value, onChange, disabled }: { value: RiskLevel; onChange: (v: RiskLevel) => void; disabled: boolean }) {
  return (
    <select className="input text-sm" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as RiskLevel)} aria-label="Risiko">
      <option value="">–</option>
      {(Object.keys(RISK_LABEL) as Exclude<RiskLevel, ''>[]).map((k) => (
        <option key={k} value={k}>
          {RISK_LABEL[k]}
        </option>
      ))}
    </select>
  );
}

const CHECK: { v: CheckState; label: string; cls: string }[] = [
  { v: 'OK', label: 'erledigt', cls: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { v: 'OFFEN', label: 'offen', cls: 'border-amber-500 bg-amber-50 text-amber-800' },
  { v: 'NA', label: 'n. a.', cls: 'border-slate-400 bg-slate-100 text-slate-600' },
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
  usePrintPage(['Erkundungsprotokoll', q.data?.title, wk.title].filter(Boolean).join(' · '));

  if (q.error) return <div className="p-6 text-slate-600">{q.error instanceof ApiError && q.error.status === 404 ? 'Erkundung nicht gefunden.' : errMsg(q.error)}</div>;
  if (!f || !q.data) return <div className="p-6 text-slate-500">Laden …</div>;
  const editable = canEditErkundung(me, wk, q.data);
  const ro = !editable;
  const set = (patch: Partial<ErkundungInput>) => update({ ...f, ...patch });
  const p = erkundungProgress(f);
  const zugName = f.zugId === null ? 'Kompanie' : (zuege.find((z) => z.id === f.zugId)?.name ?? '');
  const text = (key: 'auftraege' | 'logistik' | 'notizen', placeholder: string, rows = 4) => (
    <TextArea rows={rows} value={f[key]} disabled={ro} placeholder={ro ? '' : placeholder} onChange={(e) => set({ [key]: e.target.value })} />
  );
  const remove = async () => {
    if (!confirm('Erkundung mit allen Anhängen löschen?')) return;
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
          <span className="text-xs text-slate-500">{editable ? SAVE_LABEL[state] : 'nur lesen'}</span>
          <span className="text-xs tabular-nums text-slate-500">
            {p.done}/{p.total} Abschnitte
          </span>
          <Button onClick={() => window.print()}>Drucken / PDF</Button>
          {editable && (
            <Button variant="ghost" className="text-red-700" onClick={remove}>
              Löschen
            </Button>
          )}
        </div>

        <header className="space-y-1">
          <Briefkopf printOnly />
          <h1 className="text-2xl font-semibold">
            Erkundungsprotokoll <span className="text-slate-500 print:text-black">– {f.title}</span>
          </h1>
          {!ro && (
            <input className="input no-print" value={f.title} onChange={(e) => set({ title: e.target.value })} aria-label="Bezeichnung" />
          )}
        </header>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
          <Field label="Datum der Erkundung">
            <div className="flex gap-2">
              <input type="date" className="input" disabled={ro} value={f.datum} onChange={(e) => set({ datum: e.target.value })} />
              <input type="time" className="input !w-28" disabled={ro} value={f.zeit} onChange={(e) => set({ zeit: e.target.value })} aria-label="Zeit" />
            </div>
          </Field>
          <Field label="Formation und Anzahl TN">
            <input className="input" disabled={ro} value={f.formation} onChange={(e) => set({ formation: e.target.value })} placeholder="z. B. Pi Z 1 / 28 AdZS (davon 3 Uof)" />
          </Field>
          <Field label="PLZ, Ortschaft">
            <input className="input" disabled={ro} value={f.ort} onChange={(e) => set({ ort: e.target.value })} />
          </Field>
          <Field label="Koordinaten">
            <input className="input" disabled={ro} value={f.koordinaten} onChange={(e) => set({ koordinaten: e.target.value })} placeholder="2'600'000 / 1'200'000" />
          </Field>
          <Field label="Dauer Einsatz / Ausbildung">
            <div className="flex items-center gap-2">
              <input type="date" className="input" disabled={ro} value={f.dauerVon} onChange={(e) => set({ dauerVon: e.target.value })} aria-label="von" />
              <span className="text-slate-400">bis</span>
              <input type="date" className="input" disabled={ro} value={f.dauerBis} onChange={(e) => set({ dauerBis: e.target.value })} aria-label="bis" />
            </div>
          </Field>
          <Field label="Zugführer / Verfasser">
            <input className="input" disabled={ro} value={f.verfasser} onChange={(e) => set({ verfasser: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <span className="label">Institution / Ansprechperson</span>
            <RowsEditor
              rows={f.kontakte}
              readOnly={ro}
              onChange={(kontakte) => set({ kontakte })}
              empty={() => ({ institution: '', telefon: '', email: '' })}
              addLabel="+ Kontakt"
              columns={[
                { key: 'institution', label: 'Institution / Ansprechperson', width: '2fr', placeholder: 'z. B. EL FW Oblt Brändli' },
                { key: 'telefon', label: 'Telefon (Pikett-Nr.!)', placeholder: '+41 …' },
                { key: 'email', label: 'E-Mail' },
              ]}
            />
          </div>
        </section>

        <Section n="1" title="Erhaltene Aufträge">
          {text('auftraege', 'Was ist der Auftrag? Mit welchen Mitteln, bis wann, Besonderes …')}
        </Section>

        <Section n="2" title="Skizze (vor Ort)" hint="Foto der Handskizze hochladen und/oder die Fläche auf der Landeskarte einzeichnen.">
          <FileArea
            queryKey={['erkundung-files', id]}
            load={() => api.erkundungAttachments(id)}
            upload={(file, pr) => api.uploadErkundungAttachment(id, file, pr)}
            canUpload={editable}
            emptyText="Keine Skizze oder Fotos."
            gallery
          />
          <div className="no-print">
            <SwissMap value={f.area} onChange={ro ? undefined : (area) => set({ area })} height={300} />
          </div>
        </Section>

        <Section n="3" title="Gefahren (Mensch, Material, Methode, Mitwelt)">
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['mensch', 'Mensch'],
                ['material', 'Material'],
                ['methode', 'Methode'],
                ['mitwelt', 'Mitwelt'],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <TextArea rows={3} disabled={ro} value={f.gefahren[k]} onChange={(e) => set({ gefahren: { ...f.gefahren, [k]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </Section>

        <Section n="4" title="Risikobeurteilung" hint="Was kann auf Grund des Auftrags / der bestehenden Gefahren an der Einsatzstelle passieren? Massnahmen nach STOP.">
          <RowsEditor
            rows={f.risiken}
            readOnly={ro}
            onChange={(risiken) => set({ risiken })}
            empty={() => ({ risiko: '', massnahmen: '', wer: '', restrisiko: '' as RiskLevel })}
            addLabel="+ Risiko"
            columns={[
              { key: 'risiko', label: 'Risiko', width: '2fr', multiline: true },
              { key: 'massnahmen', label: 'Massnahmen (STOP)', width: '2fr', multiline: true },
              { key: 'wer', label: 'wer', width: '6rem' },
              {
                key: 'restrisiko',
                label: 'Restrisiko',
                width: '7rem',
                render: (r, s, readOnly) => <RiskSelect value={r.restrisiko} disabled={readOnly} onChange={(restrisiko) => s({ restrisiko })} />,
              },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Beurteilung:</span>
            {(Object.keys(RISK_LABEL) as Exclude<RiskLevel, ''>[]).map((k) => (
              <label key={k} className={`flex items-center gap-1 rounded-md border px-2 py-1 ${f.beurteilung === k ? RISK_COLOR[k] : 'border-slate-300'}`}>
                <input type="radio" disabled={ro} checked={f.beurteilung === k} onChange={() => set({ beurteilung: k })} /> {RISK_LABEL[k]}
              </label>
            ))}
          </div>
        </Section>

        <Section n="5" title="Notfallorganisation">
          <Field label="Ort / Koordinaten (Sammelplatz)">
            <input className="input" disabled={ro} value={f.notfall.ort} onChange={(e) => set({ notfall: { ...f.notfall, ort: e.target.value } })} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-[1fr,10rem]">
            {(
              [
                ['spital', 'spitalTel', 'Spital / Arzt'],
                ['ambulanz', 'ambulanzTel', 'Ambulanz'],
                ['luftrettung', 'luftrettungTel', 'Luftrettung'],
              ] as const
            ).map(([k, tel, label]) => (
              <div key={k} className="contents">
                <Field label={`${label}: Ort / Koordinaten`}>
                  <input className="input" disabled={ro} value={f.notfall[k]} onChange={(e) => set({ notfall: { ...f.notfall, [k]: e.target.value } })} />
                </Field>
                <Field label="Kontaktnummer">
                  <input className="input" disabled={ro} value={f.notfall[tel]} onChange={(e) => set({ notfall: { ...f.notfall, [tel]: e.target.value } })} />
                </Field>
              </div>
            ))}
          </div>
          <Field label="Zusätzliche Massnahmen / zusätzliches Material">
            <TextArea rows={2} disabled={ro} value={f.notfall.massnahmen} onChange={(e) => set({ notfall: { ...f.notfall, massnahmen: e.target.value } })} />
          </Field>
        </Section>

        <Section n="6" title="Beschreibung der Arbeit / Aufgabe">
          <RowsEditor
            rows={f.arbeiten}
            readOnly={ro}
            onChange={(arbeiten) => set({ arbeiten })}
            empty={() => ({ was: '', personal: '', verantwortung: '', mittel: '' })}
            addLabel="+ Arbeit"
            columns={[
              { key: 'was', label: 'Was ist zu tun', width: '2fr', multiline: true },
              { key: 'personal', label: 'Personalbedarf', width: '6rem' },
              { key: 'verantwortung', label: 'Verantwortung', width: '8rem' },
              { key: 'mittel', label: 'Spezialisten, Material, Maschinen, Geräte (quantifiziert)', width: '2fr', multiline: true },
            ]}
          />
        </Section>

        <Section n="7" title="Logistik auf dem Arbeitsplatz" hint="Transporte / Materialdepots / Betriebsstoff / Verpflegung / Sanitätsdienst / Verbindungen, etc.">
          {text('logistik', '')}
        </Section>

        <Section n="8" title="Checkliste">
          {ERKUNDUNG_CHECKLISTE.map((g) => (
            <div key={g.group} className="break-inside-avoid">
              <h3 className="mb-1 mt-2 text-sm font-semibold text-slate-700">{g.group}</h3>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {g.items.map((it) => {
                  const c = f.checkliste[it.key] ?? { state: '' as CheckState, note: '' };
                  const setC = (patch: Partial<typeof c>) => set({ checkliste: { ...f.checkliste, [it.key]: { ...c, ...patch } } });
                  return (
                    <li key={it.key} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                      <span className="min-w-[12rem] flex-1">{it.text}</span>
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
                            {o.label}
                          </button>
                        ))}
                      </span>
                      {(!ro || c.note) && (
                        <input
                          className="input w-full py-0.5 text-xs sm:w-56"
                          disabled={ro}
                          value={c.note}
                          placeholder={ro ? '' : 'Bemerkung'}
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

        <Section n="9" title="Notizen">{text('notizen', '')}</Section>

        <p className="pt-6 text-sm">
          Der Zugführer: <span className="inline-block min-w-[12rem] border-b border-slate-400">{f.verfasser}</span>
        </p>
      </div>
    </div>
  );
}
