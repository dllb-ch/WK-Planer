import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Ausbildungsvorbereitung, Block, Resource, ResourceRequest, Zug } from '@shared/types';
import { BLOCK_TYPE_INFO, KDO_ID } from '@shared/types';
import { canManagePersonnel, canViewAuftrag, canViewBefehl, canViewTagesbefehl, canViewZug } from '@shared/permissions';
import { fmtDate, fmtTime, wkDays, zieleFor } from '@shared/util';

const weekday = (d: string) => weekdayIn(currentLang(), d);
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
import { currentT as tr, currentLang } from '../../lib/lang';
import { weekdayIn, weekdayShortIn } from '@shared/i18n';

type Variant = 'kp' | 'zug';
// Sections of the Dossier, named in the language of the interface.
const kpSections = () => ({ deckblatt: tr('dos.s.deckblatt'), auftrag: tr('dos.s.auftrag'), konzept: tr('dos.s.konzept'), ap: tr('dos.s.ap'), ressourcen: tr('dos.s.ressourcen') });
const zugSections = () => ({ deckblatt: tr('dos.s.deckblatt'), ap: tr('dos.s.apZug'), zeitplan: tr('dos.s.zeitplan'), zfhr: tr('zf.title'), avs: tr('ov.preps'), ressourcen: tr('dos.s.ressourcenZug'), konzept: tr('dos.s.konzeptZug') });

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
          ...kpSections(),
          ...(tagesbefehl ? { tagesbefehl: tr('dos.s.tagesbefehl') } : {}),
          ...(manage ? { qr: tr('dos.s.qr') } : {}),
        }
      : zugSections();
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
  const stand = tr('dos.stand', { date: fmtDate(today()) });
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
              {tr('common.kompanie')}
            </button>
          )}
          <button className={`rounded px-2.5 py-1 text-xs font-medium ${variant === 'zug' ? 'bg-zs-blue text-white' : 'text-slate-600'}`} onClick={() => setVariant('zug')}>
            {tr('common.zug')}
          </button>
        </div>
        {variant === 'zug' && viewZuege.length > 1 && (
          <select className="input !w-auto" value={zugId ?? ''} onChange={(e) => setZugId(Number(e.target.value))} aria-label={tr('common.zug')}>
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
          {tr('av.printPdf')}
        </Button>
      </div>
      {!marginBoxes && (
        <p className="no-print mx-auto mt-3 max-w-[210mm] rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {tr('dos.printHint')}
        </p>
      )}

      {!ready ? (
        <p className="p-8 text-center text-slate-500">{tr('dos.building')}</p>
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
                  <div className="text-[11pt] uppercase tracking-widest text-slate-600">{tr('dos.coverTitle')}</div>
                  <h1 className="mt-2 text-[26pt] font-bold leading-tight">{wk.title}</h1>
                  <div className="mt-2 text-[14pt]">
                    {kpName}
                    {variant === 'zug' && zug && ` · ${zug.name}`}
                  </div>
                  <div className="mt-1 text-[12pt]">
                    {fmtDate(wk.startDate)} – {fmtDate(wk.endDate)}
                    {wk.avorDays.length > 0 && ` · ${tr('duty.AVOR')}: ${wk.avorDays.map((d) => fmtDate(d)).join(', ')}`}
                  </div>
                </div>
                <table className="dos-table">
                  <tbody>
                    <tr>
                      <th style={{ width: '35%' }}>{tr('role.KPKDT')}</th>
                      <td>{kpKdts.join(', ') || '–'}</td>
                    </tr>
                    {variant === 'zug' && zug && (
                      <tr>
                        <th>{tr('role.ZFHR')}</th>
                        <td>{(org.data?.users ?? []).filter((u) => u.zugId === zug.id && u.role === 'ZFHR').map((u) => u.name).join(', ') || '–'}</td>
                      </tr>
                    )}
                    <tr>
                      <th>{tr('dos.statusAp')}</th>
                      <td>
                        {tr(`status.${wk.status}`)}
                        {wk.reviewNote && ` – ${wk.reviewNote}`}
                      </td>
                    </tr>
                    <tr>
                      <th>{tr('dos.content')}</th>
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
                      <th>{tr('dos.created')}</th>
                      <td>
                        {tr('dos.createdBy', { date: fmtDate(today()), name: me.name })}
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
        <Sheet {...sheet} title={tr('dos.auftragTitle', { year: p.befehl?.year ?? '' })}>
          {!p.befehl || !auftrag ? (
            <p>{tr('dos.noAuftrag')}</p>
          ) : (
            <table className="dos-table">
              <tbody>
                <Row k={tr('dos.dienstart')} v={p.befehl.dienstart} />
                <Row k={tr('dos.leitziel')} v={p.befehl.leitziel} />
                <Row k={tr('dos.absicht')} v={p.befehl.absicht} />
                <Row k={tr('dos.richtziele')} v={auftrag.richtziele} />
                <Row k={tr('bef.teilnehmende')} v={auftrag.teilnehmende} />
                <Row k={tr('duty.KVK')} v={auftrag.kvkDates.map(fmtDate).join(', ')} />
                <Row k={tr('duty.WK')} v={`${fmtDate(auftrag.wkFrom)} – ${fmtDate(auftrag.wkTo)}`} />
                <Row k={tr('nav.organisation')} v={p.befehl.organisation} />
                <Row k={tr('ueb.besonderes')} v={p.befehl.besonderes} />
              </tbody>
            </table>
          )}
        </Sheet>
      )}
      {p.on('konzept') && (
        <Sheet {...sheet} title={tr('konz.title')}>
          <KonzeptTable k={p.konzept} zuege={zuege} />
        </Sheet>
      )}
      {p.on('ap') &&
        pages.map((days, i) => (
          <Sheet key={days[0]} {...sheet} landscape title={tr('dos.ap', { suffix: pages.length > 1 ? `(${i + 1}/${pages.length})` : '' })}>
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
        <Sheet {...sheet} title={tr('dos.s.ressourcen')}>
          <ResourcesTable requests={p.requests} resources={p.resources} zuege={zuege} />
          <h3 className="dos-h3">{tr('dos.legendLocations')}</h3>
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
  if (!ready) return <p className="no-print p-8 text-center text-slate-500">{tr('dos.tbBuilding')}</p>;
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
          <Sheet key={days[0]} {...sheet} landscape title={tr('dos.ap', { suffix: `${p.zug.name} ${pages.length > 1 ? `(${i + 1}/${pages.length})` : ''}` })}>
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
        <Sheet {...sheet} title={tr('dos.zeitplan', { zug: p.zug.name })}>
          {wkDays(wk).map((d) => {
            const list = zugBlocks.filter((b) => b.date === d).sort((a, b) => a.startMin - b.startMin);
            if (!list.length) return null;
            return (
              <table key={d} className="dos-table">
                <thead>
                  <tr>
                    <th colSpan={4}>
                      {weekday(d)}, {fmtDate(d)}
                      {wk.avorDays.includes(d) && ` (${tr('duty.AVOR')})`}
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
                          <td style={{ width: '14%' }}>{x.groupIds.length ? zugGroups.filter((g) => x.groupIds.includes(g.id)).map((g) => g.name).join(', ') : tr('common.zug')}</td>
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
        <Sheet {...sheet} title={tr('dos.zfhr', { zug: p.zug.name })}>
          <h3 className="dos-h3">{tr('dos.ziele')}</h3>
          <ol className="list-decimal pl-5">
            {p.zfhr.ziele.filter((z) => z.trim()).map((z, i) => (
              <li key={i}>{z}</li>
            ))}
          </ol>
          <h3 className="dos-h3">{tr('zf.posten')}</h3>
          <table className="dos-table">
            <thead>
              <tr>
                <th>Nr</th>
                <th>{tr('dos.themaOrt')}</th>
                <th>{tr('zf.lernziel')}</th>
                <th>{tr('av.material')}</th>
                <th>{tr('zf.postenchef')}</th>
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
              <h3 className="dos-h3">{tr('dos.kontroll')}</h3>
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
        <Sheet {...sheet} title={tr('dos.ressourcenZug', { zug: p.zug.name })}>
          <ResourcesTable requests={p.requests.filter((q) => q.zugId === p.zug.id)} resources={p.resources} zuege={[p.zug]} />
        </Sheet>
      )}
      {p.on('konzept') && (
        <Sheet {...sheet} title={tr('dos.s.konzeptZug')}>
          <ol className="list-decimal pl-5">
            {zieleFor(p.konzept.zielsetzungen, p.zug.id).map((z, i) => (
              <li key={i}>{z.text}</li>
            ))}
          </ol>
          {p.konzept.organisation && (
            <>
              <h3 className="dos-h3">{tr('nav.organisation')}</h3>
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
        <Row k={tr('dos.k1')} v={k.orientierung} />
        <Row k={tr('dos.k12')} v={k.organisation} />
        <Row k={tr('dos.k2')} v={k.absicht} />
        <tr>
          <th>{tr('dos.k3')}</th>
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
        <Row k={tr('dos.k41')} v={k.verpflegung} />
        <Row k={tr('dos.k42')} v={k.material} />
        <Row k={tr('dos.k5')} v={k.standorte} />
      </tbody>
    </table>
  );
}

function ResourcesTable({ requests, resources, zuege }: { requests: ResourceRequest[]; resources: Resource[]; zuege: Zug[] }) {
  const active = requests.filter((q) => q.status !== 'ABGELEHNT').sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  const zugName = (id: number) => (id === KDO_ID ? tr('kdo') : (zuege.find((z) => z.id === id)?.name ?? ''));
  const groups = (['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE'] as const).map((kind) => ({ kind, list: active.filter((q) => q.kind === kind) }));
  return (
    <>
      {groups.map(({ kind, list }) => (
        <div key={kind}>
          <h3 className="dos-h3">{tr(`resource.${kind}`)}</h3>
          <table className="dos-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>{tr(`resource.${kind}`)}</th>
                <th style={{ width: '20%' }}>{tr('res.when')}</th>
                <th style={{ width: '10%' }}>{tr('std.for')}</th>
                <th>{tr('res.zweck')}</th>
                <th style={{ width: '11%' }}>{tr('common.status')}</th>
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
                    {weekdayShortIn(currentLang(), q.date)} {fmtDate(q.date)} {fmtTime(q.startMin)}–{fmtTime(q.endMin)}
                  </td>
                  <td>{zugName(q.zugId)}</td>
                  <td>
                    {q.zweck}
                    {q.decisionNote && ` – ${q.decisionNote}`}
                  </td>
                  <td>{tr(`request.${q.status}`)}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5}>{tr('res.none')}</td>
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
          {tr(`block.${t}`)}
        </span>
      ))}
      {locations.length > 0 && <span>{tr('dos.locations', { list: locations.map((l) => `${l.nr} = ${l.name}`).join(', ') })}</span>}
    </div>
  );
}
