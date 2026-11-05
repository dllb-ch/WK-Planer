import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Ausbildungsvorbereitung, Block, Resource, ResourceRequest, Zug } from '@shared/types';
import { BLOCK_TYPE_INFO, KDO_ID, REQUEST_STATUS_LABEL, RESOURCE_KIND_LABEL, STATUS_LABEL } from '@shared/types';
import { canManagePersonnel, canViewAuftrag, canViewBefehl, canViewTagesbefehl, canViewZug } from '@shared/permissions';
import { fmtDate, fmtTime, weekday, wkDays, zieleFor } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { Briefkopf, marginBoxes, usePrintPage } from '../../components/Briefkopf';
import { useUser } from '../../auth';
import { Button } from '../../components/ui';
import { DOC_CSS, docContext, docHtml, type DocContext } from '../av/avDocument';
import { withKdo } from '../arbeitsprogramm/columns';
import { requestLabel } from '../ressourcen/conflicts';
import { QrSheetContent } from '../personal/QrCodes';
import { chunk, daysPerPage, LANDSCAPE, MM, PrintGrid } from './PrintGrid';
import { Sheet as TagesbefehlSheet, tagesbefehlDays, tagesbefehlOf, useTagesbefehlSources } from '../tagesbefehl/TagesbefehlPage';

type Variant = 'kp' | 'zug';
const KP_SECTIONS = { deckblatt: 'Deckblatt', auftrag: 'Auftrag aus dem Ausbildungsbefehl', konzept: 'WK-Konzept / Befehl Kp Kdo', ap: 'Arbeitsprogramm (Blockübersicht)', ressourcen: 'Fahrzeuge, Räume und Standorte' } as const;
const ZUG_SECTIONS = { deckblatt: 'Deckblatt', ap: 'Arbeitsprogramm des Zuges', zeitplan: 'Zeitplan mit Detailplanung', zfhr: 'Zugführerarbeitsprogramm', avs: 'Ausbildungsvorbereitungen', ressourcen: 'Fahrzeuge, Räume, Gelände des Zuges', konzept: 'Zielsetzungen aus dem WK-Konzept' } as const;

const today = () => new Date().toISOString().slice(0, 10);

/** Complete documentation of a WK for print or PDF: for the Kompanie, or for one Zug. */
export function DossierPage({ detail }: { detail: WkDetail }) {
  const me = useUser();
  const { wk, zuege } = detail;
  const viewZuege = zuege.filter((z) => canViewZug(me, wk, z.id));
  const kpAllowed = me.role !== 'KADER' && me.role !== 'ZFHR';
  const [variant, setVariant] = useState<Variant>(kpAllowed ? 'kp' : 'zug');
  const [zugId, setZugId] = useState<number | null>(viewZuege.find((z) => z.id === me.zugId)?.id ?? viewZuege[0]?.id ?? null);
  // Kp Kdt: the QR codes of the check-in, one notice per WK day.
  const manage = canManagePersonnel(me, wk);
  // Kp Kdt and Bat Kommando: the Tagesbefehle, one page per WK day.
  const tagesbefehl = canViewTagesbefehl(me, wk);
  const sectionsDef =
    variant === 'kp'
      ? {
          ...KP_SECTIONS,
          ...(tagesbefehl ? { tagesbefehl: 'Tagesbefehle (ein Blatt pro Tag)' } : {}),
          ...(manage ? { qr: 'QR-Codes Check-in (Aushang pro Tag)' } : {}),
        }
      : ZUG_SECTIONS;
  // Tagesbefehle and QR notices are printed on demand, not with every Dossier.
  const [off, setOff] = useState<string[]>(['tagesbefehl', 'qr']);
  const [tbReady, setTbReady] = useState(false);
  const on = (k: string) => !off.includes(k);
  const zug = zuege.find((z) => z.id === zugId) ?? null;

  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const konzept = useQuery({ queryKey: ['konzept', wk.id], queryFn: () => api.konzept(wk.id) });
  const year = Number(wk.startDate.slice(0, 4));
  const befehl = useQuery({ queryKey: ['befehl', year], queryFn: () => api.befehl(year), enabled: canViewBefehl(me) });
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id) });
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId) });
  const avs = useQuery({ queryKey: ['avs', wk.id], queryFn: () => api.avs(wk.id) });
  const checkinDays = useQuery({ queryKey: ['checkin-days', wk.id], queryFn: () => api.checkinDays(wk.id), enabled: manage && variant === 'kp' });
  const zfhr = useQuery({ queryKey: ['zfhr', wk.id, zugId], queryFn: () => api.zfhr(wk.id, zugId!), enabled: variant === 'zug' && !!zugId });

  const bat = org.data?.bataillon;
  const kpName = org.data?.kompanien.find((k) => k.id === wk.kpId)?.name ?? '';
  const kpKdts = (org.data?.users ?? []).filter((u) => u.kpId === wk.kpId && u.role === 'KPKDT').map((u) => u.name);
  const title = variant === 'kp' ? `Dossier ${kpName}` : `Dossier ${zug?.name ?? ''}`;
  const footer = [bat?.regionName || bat?.name, kpName, variant === 'zug' ? zug?.name : null, `${wk.title} (${fmtDate(wk.startDate)}–${fmtDate(wk.endDate)})`].filter(Boolean).join(' · ');
  const stand = `Stand ${fmtDate(today())}`;
  usePrintPage(footer, { stand, margin: '12mm 14mm 16mm 14mm' });

  const included = (Object.keys(sectionsDef) as string[]).filter(on);
  const tbPending = variant === 'kp' && tagesbefehl && on('tagesbefehl') && !tbReady;
  const ready = org.isSuccess && konzept.isSuccess && requests.isSuccess && resources.isSuccess && avs.isSuccess && (variant === 'kp' || zfhr.isSuccess || !zugId) && (!manage || variant !== 'kp' || !on('qr') || checkinDays.isSuccess);

  return (
    <div className="print-flow min-h-0 flex-1 overflow-y-auto bg-slate-200">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-300 bg-white px-4 py-2 text-sm">
        <div className="flex rounded-md border border-slate-300 p-0.5">
          {kpAllowed && (
            <button className={`rounded px-2.5 py-1 text-xs font-medium ${variant === 'kp' ? 'bg-zs-blue text-white' : 'text-slate-600'}`} onClick={() => setVariant('kp')}>
              Kompanie
            </button>
          )}
          <button className={`rounded px-2.5 py-1 text-xs font-medium ${variant === 'zug' ? 'bg-zs-blue text-white' : 'text-slate-600'}`} onClick={() => setVariant('zug')}>
            Zug
          </button>
        </div>
        {variant === 'zug' && viewZuege.length > 1 && (
          <select className="input !w-auto" value={zugId ?? ''} onChange={(e) => setZugId(Number(e.target.value))} aria-label="Zug">
            {viewZuege.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        )}
        {(Object.entries(sectionsDef) as [string, string][]).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={on(k)} onChange={(e) => setOff(e.target.checked ? off.filter((x) => x !== k) : [...off, k])} />
            {label}
          </label>
        ))}
        <span className="flex-1" />
        <Button variant="primary" disabled={!ready || tbPending} onClick={() => window.print()}>
          Drucken / PDF
        </Button>
      </div>
      {!marginBoxes && (
        <p className="no-print mx-auto mt-3 max-w-[210mm] rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Für Seitenzahlen in der Fusszeile mit Chrome oder Edge drucken. In anderen Browsern erscheint die Fusszeile ohne Seitenzahl.
        </p>
      )}

      {!ready ? (
        <p className="p-8 text-center text-slate-500">Dossier wird zusammengestellt …</p>
      ) : (
        <div className="dossier mx-auto py-4">
          {!marginBoxes && <div className="dos-fixed-foot print-only">{footer} · {stand}</div>}

          {on('deckblatt') && (
            <Sheet footer={footer} stand={stand}>
              <div className="flex min-h-[230mm] flex-col">
                <div className="border-b border-black pb-3">
                  <Briefkopf className="!mb-0" />
                  <div className="mt-2 flex items-end justify-between gap-4 text-[10pt]">
                    {bat?.logo && bat.kantonLogo ? <img src={bat.logo} alt="" style={{ maxHeight: '18mm', maxWidth: '70mm' }} /> : <span />}
                    <div className="text-right">
                      <div>{bat?.name}</div>
                      <div className="font-bold">{kpName}</div>
                    </div>
                  </div>
                </div>
                <div className="my-auto py-16">
                  <div className="text-[11pt] uppercase tracking-widest text-slate-600">Dossier Wiederholungskurs</div>
                  <h1 className="mt-2 text-[26pt] font-bold leading-tight">{wk.title}</h1>
                  <div className="mt-2 text-[14pt]">
                    {kpName}
                    {variant === 'zug' && zug && ` · ${zug.name}`}
                  </div>
                  <div className="mt-1 text-[12pt]">
                    {fmtDate(wk.startDate)} – {fmtDate(wk.endDate)}
                    {wk.avorDays.length > 0 && ` · AVOR: ${wk.avorDays.map((d) => fmtDate(d)).join(', ')}`}
                  </div>
                </div>
                <table className="dos-table">
                  <tbody>
                    <tr>
                      <th style={{ width: '35%' }}>Kp Kdt</th>
                      <td>{kpKdts.join(', ') || '–'}</td>
                    </tr>
                    {variant === 'zug' && zug && (
                      <tr>
                        <th>Zugführer/in</th>
                        <td>{(org.data?.users ?? []).filter((u) => u.zugId === zug.id && u.role === 'ZFHR').map((u) => u.name).join(', ') || '–'}</td>
                      </tr>
                    )}
                    <tr>
                      <th>Status Arbeitsprogramm</th>
                      <td>
                        {STATUS_LABEL[wk.status]}
                        {wk.reviewNote && ` – ${wk.reviewNote}`}
                      </td>
                    </tr>
                    <tr>
                      <th>Inhalt</th>
                      <td>
                        <ol className="list-decimal pl-5">
                          {included
                            .filter((k) => k !== 'deckblatt')
                            .map((k) => (
                              <li key={k}>{(sectionsDef as Record<string, string>)[k]}</li>
                            ))}
                        </ol>
                      </td>
                    </tr>
                    <tr>
                      <th>Erstellt</th>
                      <td>
                        {fmtDate(today())} durch {me.name}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Sheet>
          )}

          {variant === 'kp' ? (
            <KpSections
              detail={detail}
              on={on}
              footer={footer}
              stand={stand}
              konzept={konzept.data!}
              befehl={befehl.data ?? null}
              requests={requests.data!}
              resources={resources.data!}
              canAuftrag={canViewAuftrag(me, wk.kpId)}
            />
          ) : null}
          {variant === 'kp' && tagesbefehl && on('tagesbefehl') && <TagesbefehlSections detail={detail} footer={footer} stand={stand} onReady={setTbReady} />}
          {variant === 'kp' &&
            manage &&
            on('qr') &&
            (checkinDays.data ?? []).map((d) => (
              <Sheet key={d.date} footer={footer} stand={stand}>
                <QrSheetContent wkTitle={wk.title} day={d} />
              </Sheet>
            ))}
          {variant === 'kp' ? null : zug ? (
            <ZugSections
              detail={detail}
              zug={zug}
              on={on}
              footer={footer}
              stand={stand}
              konzept={konzept.data!}
              requests={requests.data!}
              resources={resources.data!}
              avs={avs.data!}
              zfhr={zfhr.data ?? null}
              ctx={docContext(bat, [bat?.regionName, zug.name, wk.title].filter(Boolean).join('\n'))}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---- Layout ----

/** One section, starting on a new page; on screen shown as an A4 sheet with its footer. */
function Sheet({ children, footer, stand, landscape, title }: { children: ReactNode; footer: string; stand: string; landscape?: boolean; title?: string }) {
  return (
    <section className={`dos-page paper ${landscape ? 'dos-landscape' : ''}`}>
      <div className="dos-body">
        {title && <h2 className="dos-h2">{title}</h2>}
        {children}
      </div>
      <div className="dos-sheet-foot">
        <span>{footer}</span>
        <span>{stand}</span>
      </div>
    </section>
  );
}


// ---- Kompanie ----

function KpSections(p: {
  detail: WkDetail;
  on: (k: string) => boolean;
  footer: string;
  stand: string;
  konzept: Awaited<ReturnType<typeof api.konzept>>;
  befehl: Awaited<ReturnType<typeof api.befehl>>;
  requests: ResourceRequest[];
  resources: Resource[];
  canAuftrag: boolean;
}) {
  const { wk, zuege, blocks, locations } = p.detail;
  const columns = useMemo(() => withKdo(wk.kpId, zuege), [wk.kpId, zuege]);
  const auftrag = p.befehl?.auftraege.find((a) => a.kpId === wk.kpId);
  const pages = chunk(wkDays(wk), daysPerPage(columns.length));
  const sheet = { footer: p.footer, stand: p.stand };
  return (
    <>
      {p.on('auftrag') && p.canAuftrag && (
        <Sheet {...sheet} title={`Auftrag aus dem Ausbildungsbefehl ${p.befehl?.year ?? ''}`}>
          {!p.befehl || !auftrag ? (
            <p>Kein Ausbildungsbefehl mit Auftrag an diese Kompanie erfasst.</p>
          ) : (
            <table className="dos-table">
              <tbody>
                <Row k="Dienstart" v={p.befehl.dienstart} />
                <Row k="Leitziel" v={p.befehl.leitziel} />
                <Row k="Absicht Bat Kdt" v={p.befehl.absicht} />
                <Row k="Richtziele Kp" v={auftrag.richtziele} />
                <Row k="Teilnehmende" v={auftrag.teilnehmende} />
                <Row k="KVK" v={auftrag.kvkDates.map(fmtDate).join(', ')} />
                <Row k="WK" v={`${fmtDate(auftrag.wkFrom)} – ${fmtDate(auftrag.wkTo)}`} />
                <Row k="Organisation" v={p.befehl.organisation} />
                <Row k="Besonderes" v={p.befehl.besonderes} />
              </tbody>
            </table>
          )}
        </Sheet>
      )}
      {p.on('konzept') && (
        <Sheet {...sheet} title="WK-Konzept / Befehl zur WK-Vorbereitung">
          <KonzeptTable k={p.konzept} zuege={zuege} />
        </Sheet>
      )}
      {p.on('ap') &&
        pages.map((days, i) => (
          <Sheet key={days[0]} {...sheet} landscape title={`Arbeitsprogramm ${pages.length > 1 ? `(${i + 1}/${pages.length})` : ''}`}>
            <PrintGrid
              days={days}
              columns={columns}
              blocks={blocks}
              locations={locations}
              dayStart={wk.dayStart}
              dayEnd={wk.dayEnd}
              avorDays={wk.avorDays}
              height={LANDSCAPE.h - 30 * MM}
            />
            <Legend blocks={blocks.filter((b) => days.includes(b.date))} locations={locations} />
          </Sheet>
        ))}
      {p.on('ressourcen') && (
        <Sheet {...sheet} title="Fahrzeuge, Räume und Standorte">
          <ResourcesTable requests={p.requests} resources={p.resources} zuege={zuege} />
          <h3 className="dos-h3">Standorte (Legende Arbeitsprogramm)</h3>
          <table className="dos-table">
            <tbody>
              {locations.map((l) => (
                <tr key={l.id}>
                  <th style={{ width: '10%' }}>{l.nr}</th>
                  <td>{l.name}</td>
                </tr>
              ))}
              {locations.length === 0 && (
                <tr>
                  <td>–</td>
                </tr>
              )}
            </tbody>
          </table>
        </Sheet>
      )}
    </>
  );
}

/** The Tagesbefehle of all WK days (as «Alle Tage drucken» on the Tagesbefehl page). */
function TagesbefehlSections({ detail, footer, stand, onReady }: { detail: WkDetail; footer: string; stand: string; onReady: (ready: boolean) => void }) {
  const { wk } = detail;
  const q = useQuery({ queryKey: ['tagesbefehle', wk.id], queryFn: () => api.tagesbefehle(wk.id) });
  const data = useTagesbefehlSources(detail);
  const ready = q.isSuccess && data.ready;
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);
  if (!ready) return <p className="no-print p-8 text-center text-slate-500">Tagesbefehle werden zusammengestellt …</p>;
  return (
    <>
      {tagesbefehlDays(wk).map((d) => (
        <Sheet key={`tb${d}`} footer={footer} stand={stand}>
          <TagesbefehlSheet detail={detail} day={tagesbefehlOf(q.data, wk.id, d)} data={data} />
        </Sheet>
      ))}
    </>
  );
}

// ---- Zug ----

function ZugSections(p: {
  detail: WkDetail;
  zug: Zug;
  on: (k: string) => boolean;
  footer: string;
  stand: string;
  konzept: Awaited<ReturnType<typeof api.konzept>>;
  requests: ResourceRequest[];
  resources: Resource[];
  avs: Ausbildungsvorbereitung[];
  zfhr: Awaited<ReturnType<typeof api.zfhr>> | null;
  ctx: DocContext;
}) {
  const { wk, blocks, locations, details, groups } = p.detail;
  const zugBlocks = blocks.filter((b) => b.zugIds.includes(p.zug.id)).map((b) => ({ ...b, zugIds: [p.zug.id] }));
  const zugDetails = details.filter((d) => d.zugId === p.zug.id);
  const zugGroups = groups.filter((g) => g.zugId === p.zug.id);
  const pages = chunk(wkDays(wk), Math.min(4, daysPerPage(1)));
  const sheet = { footer: p.footer, stand: p.stand };
  const zugAvs = p.avs.filter((a) => a.zugId === p.zug.id);
  return (
    <>
      {p.on('ap') &&
        pages.map((days, i) => (
          <Sheet key={days[0]} {...sheet} landscape title={`Arbeitsprogramm ${p.zug.name} ${pages.length > 1 ? `(${i + 1}/${pages.length})` : ''}`}>
            <PrintGrid
              days={days}
              columns={[p.zug]}
              blocks={zugBlocks}
              locations={locations}
              dayStart={wk.dayStart}
              dayEnd={wk.dayEnd}
              avorDays={wk.avorDays}
              height={LANDSCAPE.h - 30 * MM}
              details={zugDetails}
              groups={zugGroups}
            />
            <Legend blocks={zugBlocks.filter((b) => days.includes(b.date))} locations={locations} />
          </Sheet>
        ))}
      {p.on('zeitplan') && (
        <Sheet {...sheet} title={`Zeitplan ${p.zug.name}`}>
          {wkDays(wk).map((d) => {
            const list = zugBlocks.filter((b) => b.date === d).sort((a, b) => a.startMin - b.startMin);
            if (!list.length) return null;
            return (
              <table key={d} className="dos-table">
                <thead>
                  <tr>
                    <th colSpan={4}>
                      {weekday(d)}, {fmtDate(d)}
                      {wk.avorDays.includes(d) && ' (AVOR)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((b) => [
                    <tr key={b.id}>
                      <td style={{ width: '12%' }}>
                        {fmtTime(b.startMin)}–{fmtTime(b.endMin)}
                      </td>
                      <td style={{ width: '18%' }}>{b.verantwortlich}</td>
                      <td colSpan={2}>
                        <b>{b.title}</b>
                        {b.locationId && ` · ${locations.find((l) => l.id === b.locationId)?.name ?? ''}`}
                      </td>
                    </tr>,
                    ...zugDetails
                      .filter((x) => x.blockId === b.id)
                      .map((x) => (
                        <tr key={`d${x.id}`}>
                          <td style={{ paddingLeft: '10pt' }}>
                            {fmtTime(x.startMin)}–{fmtTime(x.endMin)}
                          </td>
                          <td>{x.verantwortlich}</td>
                          <td style={{ width: '14%' }}>{x.groupIds.length ? zugGroups.filter((g) => x.groupIds.includes(g.id)).map((g) => g.name).join(', ') : 'Zug'}</td>
                          <td>{x.title}</td>
                        </tr>
                      )),
                  ])}
                </tbody>
              </table>
            );
          })}
        </Sheet>
      )}
      {p.on('zfhr') && p.zfhr && (
        <Sheet {...sheet} title={`Zugführerarbeitsprogramm ${p.zug.name}`}>
          <h3 className="dos-h3">Ziele</h3>
          <ol className="list-decimal pl-5">
            {p.zfhr.ziele.filter((z) => z.trim()).map((z, i) => (
              <li key={i}>{z}</li>
            ))}
          </ol>
          <h3 className="dos-h3">Arbeitsposten</h3>
          <table className="dos-table">
            <thead>
              <tr>
                <th>Nr</th>
                <th>Thema / Ort</th>
                <th>Lernziel / Auftrag</th>
                <th>Material</th>
                <th>Postenchef</th>
              </tr>
            </thead>
            <tbody>
              {p.zfhr.posten.map((x) => (
                <tr key={x.nr}>
                  <td>{x.nr}</td>
                  <td>
                    {x.thema}
                    {x.ort && ` / ${x.ort}`}
                  </td>
                  <td>{x.lernziel}</td>
                  <td>{x.material}</td>
                  <td>{x.postenchef}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.zfhr.zfhrAktivitaeten && (
            <>
              <h3 className="dos-h3">Kontroll- und Besprechungspunkte</h3>
              <p className="whitespace-pre-wrap">{p.zfhr.zfhrAktivitaeten}</p>
            </>
          )}
        </Sheet>
      )}
      {p.on('avs') &&
        zugAvs.map((a) => (
          <Sheet key={a.id} {...sheet}>
            <div dangerouslySetInnerHTML={{ __html: `<style>${DOC_CSS}</style>${docHtml(a, p.ctx)}` }} />
          </Sheet>
        ))}
      {p.on('ressourcen') && (
        <Sheet {...sheet} title={`Fahrzeuge, Räume, Gelände ${p.zug.name}`}>
          <ResourcesTable requests={p.requests.filter((q) => q.zugId === p.zug.id)} resources={p.resources} zuege={[p.zug]} />
        </Sheet>
      )}
      {p.on('konzept') && (
        <Sheet {...sheet} title="Zielsetzungen aus dem WK-Konzept">
          <ol className="list-decimal pl-5">
            {zieleFor(p.konzept.zielsetzungen, p.zug.id).map((z, i) => (
              <li key={i}>{z.text}</li>
            ))}
          </ol>
          {p.konzept.organisation && (
            <>
              <h3 className="dos-h3">Organisation</h3>
              <p className="whitespace-pre-wrap">{p.konzept.organisation}</p>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}

// ---- Shared parts ----

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <th style={{ width: '25%' }}>{k}</th>
      <td className="whitespace-pre-wrap">{v || '–'}</td>
    </tr>
  );
}

function KonzeptTable({ k, zuege }: { k: Awaited<ReturnType<typeof api.konzept>>; zuege: Zug[] }) {
  return (
    <table className="dos-table">
      <tbody>
        <Row k="1. Orientierung / Allgemeines" v={k.orientierung} />
        <Row k="1.2 Organisation" v={k.organisation} />
        <Row k="2. Absicht" v={k.absicht} />
        <tr>
          <th>3. Zielsetzungen</th>
          <td>
            <ol className="list-decimal pl-5">
              {k.zielsetzungen.map((z, i) => (
                <li key={i}>
                  {z.text}
                  {z.zugIds.length > 0 && ` (${zuege.filter((x) => z.zugIds.includes(x.id)).map((x) => x.name).join(', ')})`}
                </li>
              ))}
            </ol>
          </td>
        </tr>
        <Row k="4.1 Verpflegung" v={k.verpflegung} />
        <Row k="4.2 Personal, Material, Fahrzeuge" v={k.material} />
        <Row k="5. Standorte" v={k.standorte} />
      </tbody>
    </table>
  );
}

function ResourcesTable({ requests, resources, zuege }: { requests: ResourceRequest[]; resources: Resource[]; zuege: Zug[] }) {
  const active = requests.filter((q) => q.status !== 'ABGELEHNT').sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const zugName = (id: number) => (id === KDO_ID ? 'Kdo' : (zuege.find((z) => z.id === id)?.name ?? ''));
  const groups = (['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE'] as const).map((kind) => ({ kind, list: active.filter((q) => q.kind === kind) }));
  return (
    <>
      {groups.map(({ kind, list }) => (
        <div key={kind}>
          <h3 className="dos-h3">{RESOURCE_KIND_LABEL[kind]}</h3>
          <table className="dos-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>{RESOURCE_KIND_LABEL[kind]}</th>
                <th style={{ width: '20%' }}>Wann</th>
                <th style={{ width: '10%' }}>Für</th>
                <th>Zweck</th>
                <th style={{ width: '11%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((q) => (
                <tr key={q.id}>
                  <td>
                    {requestLabel(q, resources)}
                    {resources.find((r) => r.id === q.resourceId)?.kpId === null && ' (Bat)'}
                  </td>
                  <td>
                    {weekday(q.date).slice(0, 2)} {fmtDate(q.date)} {fmtTime(q.startMin)}–{fmtTime(q.endMin)}
                  </td>
                  <td>{zugName(q.zugId)}</td>
                  <td>
                    {q.zweck}
                    {q.decisionNote && ` – ${q.decisionNote}`}
                  </td>
                  <td>{REQUEST_STATUS_LABEL[q.status]}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5}>Keine Anfragen.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function Legend({ blocks, locations }: { blocks: Block[]; locations: { nr: number; name: string }[] }) {
  const types = [...new Set(blocks.map((b) => b.type))];
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[8pt]">
      {types.map((t) => (
        <span key={t} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5" style={{ background: BLOCK_TYPE_INFO[t].color }} />
          {BLOCK_TYPE_INFO[t].label}
        </span>
      ))}
      {locations.length > 0 && <span>· Standorte: {locations.map((l) => `${l.nr} = ${l.name}`).join(', ')}</span>}
    </div>
  );
}
