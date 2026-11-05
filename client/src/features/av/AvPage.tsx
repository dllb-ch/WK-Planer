import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AblaufSchritt, Ausbildungsstufe, AvInput, Fachbereich, PittPhase, ResourceKind } from '@shared/types';
import { FACHBEREICHE, PITT } from '@shared/types';
import { canCreateAv, canEditAv } from '@shared/permissions';
import { fmtDate, fmtTime, parseTime } from '@shared/util';
import { guessFachbereiche, schedule } from '@shared/av';
import { api, ApiError, type WkDetail } from '../../api';
import { useUser } from '../../auth';
import { PersonMultiSelect } from '../../components/PersonSelect';
import { FileArea } from '../../components/FileArea';
import { BlockRequests } from '../ressourcen/BlockResources';
import { errMsg, useToast } from '../../components/ui';
import { AddRow, CellInput, CellTextArea, ChoiceRow, Group, IconButton, Ring, Row, StackRow, Stepper } from '../../components/grouped';
import { ContextMenu, type MenuItem, type MenuState } from '../../components/ContextMenu';
import { DOC_CSS, docContext, docHtml, downloadJson, downloadWord, parseJson } from './avDocument';
import { usePrintPage } from '../../components/Briefkopf';
import { useT } from '../../i18n';

/** Ausbildungsvorbereitung Grfhr (Handbuch Anhänge p. 24–25) for one slot of a Zug. */
export function AvPage({ detail }: { detail: WkDetail }) {
  const { t, tn, weekdayShort } = useT();
  const { avId } = useParams();
  const [search] = useSearchParams();
  const me = useUser();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { wk, blocks, zuege, locations, details } = detail;
  const isNew = avId === 'neu';
  const q = useQuery({ queryKey: ['av', wk.id, avId], queryFn: () => api.av(wk.id, Number(avId)), enabled: !isNew });
  const [f, setF] = useState<AvInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  usePrintPage([t('av.doc'), f?.thema, zuege.find((z) => z.id === f?.zugId)?.name, wk.title].filter(Boolean).join(' · '));

  // New document: prefill from the slot and its detail plan.
  useEffect(() => {
    if (!isNew || f) return;
    const blockId = Number(search.get('block')) || null;
    const zugId = Number(search.get('zug'));
    const b = blocks.find((x) => x.id === blockId);
    const loc = locations.find((l) => l.id === b?.locationId);
    const ds = details.filter((d) => d.blockId === blockId && d.zugId === zugId);
    setF({
      blockId,
      zugId,
      ausbildungsart: '',
      thema: b?.title ?? '',
      fachbereiche: guessFachbereiche(zuege.find((z) => z.id === zugId)?.name ?? ''),
      datum: b?.date ?? '',
      zeitVon: b ? fmtTime(b.startMin) : '',
      zeitBis: b ? fmtTime(b.endMin) : '',
      zeit: b ? `${fmtTime(b.startMin)}–${fmtTime(b.endMin)}` : '',
      teilnehmer: '',
      arbeitsplatz: loc?.name ?? '',
      leiter: me.role === 'KADER' || me.role === 'ZFHR' ? me.name : '',
      leiterUserIds: me.role === 'KADER' || me.role === 'ZFHR' ? [me.id] : [],
      grundlagen: '',
      stufe: '',
      zielsetzungen: [''],
      persAusruestung: '',
      postenplakat: '',
      fahrzeug: '',
      material: '',
      unterlagen: '',
      bemerkungen: '',
      controlling: '',
      ablauf: ds.length
        ? ds.map((d) => ({ dauer: d.endMin - d.startMin, phase: '' as const, text: d.title }))
        : [{ dauer: 10, phase: 'P', text: '' }],
    });
  }, [isNew, f, search, blocks, locations, details, me]);

  useEffect(() => {
    if (q.data && !dirty) {
      const { id: _i, wkId: _w, createdBy: _c, createdByName: _n, updatedAt: _u, ...rest } = q.data;
      setF(rest);
    }
  }, [q.data, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (q.error) return <div className="p-6 text-slate-600">{q.error instanceof ApiError && q.error.status === 403 ? t('yp.noAccess') : errMsg(q.error)}</div>;
  if (!f) return <div className="p-6 text-slate-500">{t('common.loading')}</div>;

  const editable = isNew ? canCreateAv(me, wk, f.zugId) : !!q.data && canEditAv(me, wk, q.data);
  const set = (patch: Partial<AvInput>) => {
    setF({ ...f, ...patch });
    setDirty(true);
  };
  const zugName = zuege.find((z) => z.id === f.zugId)?.name ?? '';
  // Time slot in the Arbeitsprogramm: its requested vehicles, rooms and terrain.
  const slotBlock = blocks.find((b) => b.id === f.blockId) ?? null;
  const slotBlocks = blocks.filter((b) => b.zugIds.includes(f.zugId)).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);

  const save = async () => {
    try {
      const body = { ...f, zielsetzungen: f.zielsetzungen.filter((z) => z.trim()) };
      if (isNew) {
        const created = await api.createAv(wk.id, body);
        setDirty(false);
        qc.invalidateQueries({ queryKey: ['avs', wk.id] });
        nav(`../av/${created.id}`, { replace: true });
      } else {
        await api.updateAv(wk.id, Number(avId), body);
        setDirty(false);
        qc.invalidateQueries({ queryKey: ['avs', wk.id] });
        qc.invalidateQueries({ queryKey: ['av', wk.id, avId] });
      }
      toast(t('av.saved'));
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const remove = async () => {
    if (!confirm(t('av.confirmDelete'))) return;
    try {
      await api.deleteAv(wk.id, Number(avId));
      qc.invalidateQueries({ queryKey: ['avs', wk.id] });
      nav('../zug');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const bat = org.data?.bataillon;
  const ctx = docContext(bat, [bat?.regionName, zugName, wk.title].filter(Boolean).join('\n'));
  const sections = {
    eck: !!(f.ausbildungsart && f.datum && f.zeitVon && f.leiter),
    thema: !!f.thema.trim(),
    stufe: !!f.stufe,
    ziele: f.zielsetzungen.some((z) => z.trim()),
    mittel: !!(f.persAusruestung || f.fahrzeug || f.material || f.unterlagen),
    ablauf: f.ablauf.some((r) => r.text.trim()),
    ctrl: !!f.controlling.trim(),
  };
  const done = Object.values(sections).filter(Boolean).length;
  const groupNames = detail.groups.filter((g) => g.zugId === f.zugId).map((g) => g.name);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = parseJson(await file.text());
      set({ ...data, blockId: f.blockId, zugId: f.zugId, leiterUserIds: f.leiterUserIds, leiter: f.leiterUserIds.length ? f.leiter : data.leiter });
      toast(t('av.fileTaken', { name: file.name }));
    } catch (e) {
      toast(t('av.fileUnreadable', { name: file.name, error: errMsg(e) }), 'error');
    }
  };

  const text = (key: keyof AvInput, placeholder: string, rows = 2) => (
    <CellTextArea minRows={rows} value={f[key] as string} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
  );
  const line = (key: keyof AvInput, placeholder = '', list?: string) => (
    <CellInput value={f[key] as string} placeholder={placeholder} list={list} onChange={(e) => set({ [key]: e.target.value })} />
  );

  const shareItems: MenuItem[] = [
    { label: t('av.printPdf'), icon: '⎙', onClick: () => window.print() },
    { label: t('av.word'), icon: '📄', onClick: () => downloadWord(f, ctx) },
    'separator',
    { label: t('av.shareJson'), icon: '⇩', onClick: () => downloadJson(f) },
    ...(editable ? ([{ label: t('av.importJson'), icon: '⇧', onClick: () => fileInput.current?.click() }] as MenuItem[]) : []),
    ...(!isNew && editable ? (['separator', { label: t('common.delete'), icon: '🗑', danger: true, onClick: remove }] as MenuItem[]) : []),
  ];

  return (
    <div className="print-flow min-h-0 flex-1 overflow-y-auto" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 60)}>
      <PortraitPage />
      <div className="print-only">
        <div dangerouslySetInnerHTML={{ __html: `<style>${DOC_CSS}</style>${docHtml(f, ctx)}` }} />
      </div>
      <div className="no-print">
        {/* Navigation bar: frosted, the title appears once the large title has scrolled away. */}
        <header className={`material sticky top-0 z-20 transition-[border-color] ${scrolled ? 'hairline-b' : 'border-b-[0.5px] border-transparent'}`}>
          <div className="mx-auto grid h-[52px] max-w-[760px] grid-cols-[1fr,auto,1fr] items-center gap-2 px-2">
            <div className="flex min-w-0 items-center">
              <Link to="../zug" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-zs-blue hover:bg-slate-500/10">
                <span className="text-2xl leading-none">‹</span>
                <span className="max-sm:hidden">Zugansicht</span>
              </Link>
            </div>
            <div className={`max-w-[34vw] truncate font-semibold transition-opacity max-sm:hidden ${scrolled ? 'opacity-100' : 'opacity-0'}`}>{f.thema || t('av.newLesson')}</div>
            <div className="flex items-center justify-end gap-0.5">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-zs-blue hover:bg-slate-500/10"
                aria-label={t('av.share')}
                title={t('av.share')}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu({ x: r.right - 250, y: r.bottom + 6, items: shareItems });
                }}
              >
                <ShareIcon />
              </button>
              {editable && (
                <button
                  type="button"
                  disabled={(!dirty && !isNew) || !f.thema.trim()}
                  onClick={save}
                  className="ml-1 rounded-full bg-zs-blue px-3.5 py-1.5 font-semibold text-white transition hover:brightness-110 active:opacity-60 disabled:opacity-40"
                >
                  {t('common.save')}
                </button>
              )}
            </div>
          </div>
        </header>
        {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
        <input ref={fileInput} type="file" accept=".json,application/json,text/plain" className="sr-only" onChange={(e) => importFile(e.target.files?.[0]).then(() => (e.target.value = ''))} />

        <main className="mx-auto max-w-[760px] px-4 pb-24 pt-1">
          <div className="mx-1 mb-6 mt-2.5">
            <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.025em] [overflow-wrap:anywhere]">{f.thema || t('av.newLesson')}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[15px] text-slate-500">
              {editable && (
                <>
                  <Ring value={done / 7} />
                  <span>{t('av.sectionsDone', { n: done })}</span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span className={dirty ? 'text-orange-600' : ''}>
                {dirty ? t('av.unsaved') : isNew ? t('av.newUnsaved') : t('av.savedBy', { name: q.data?.createdByName ?? '' })}
              </span>
              <span aria-hidden>·</span>
              <span>{zugName}</span>
              {!editable && <span>{t('av.readOnly')}</span>}
            </p>
          </div>

          {!editable ? (
            <div className="paper mb-[30px] overflow-x-auto rounded-lg bg-white p-6 text-black">
              <div dangerouslySetInnerHTML={{ __html: `<style>${DOC_CSS}</style>${docHtml(f, ctx)}` }} />
            </div>
          ) : (
            <>
              <Group n={1} title={t('av.eckdaten')} done={sections.eck}>
                <Row label={t('av.slot')}>
                  <select
                    className="cell-input"
                    value={f.blockId ?? ''}
                    onChange={(e) => {
                      const b = slotBlocks.find((x) => x.id === Number(e.target.value));
                      set({ blockId: b?.id ?? null, ...(b ? { datum: b.date, zeitVon: fmtTime(b.startMin), zeitBis: fmtTime(b.endMin) } : {}) });
                    }}
                  >
                    <option value="">{t('av.noSlot')}</option>
                    {slotBlocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {weekdayShort(b.date)} {fmtDate(b.date).slice(0, 6)} {fmtTime(b.startMin)}–{fmtTime(b.endMin)} {b.title}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400" aria-hidden>
                    ⌄
                  </span>
                </Row>
                <Row label={t('av.art')}>{line('ausbildungsart', t('av.artPh'), 'av-art')}</Row>
                <Row label={t('common.date')}>
                  <CellInput type="date" value={f.datum} onChange={(e) => set({ datum: e.target.value })} aria-label={t('common.date')} />
                </Row>
                <Row label={t('common.time')}>
                  <CellInput type="time" value={f.zeitVon} onChange={(e) => set({ zeitVon: e.target.value })} aria-label={t('av.timeFrom')} />
                  <span className="text-slate-500">bis</span>
                  <CellInput type="time" value={f.zeitBis} onChange={(e) => set({ zeitBis: e.target.value })} aria-label={t('av.timeTo')} />
                </Row>
                <Row label={t('av.participants')}>{line('teilnehmer', t('av.participantsPh'), 'av-teilnehmer')}</Row>
                <StackRow label={t('av.place')}>
                  {line('arbeitsplatz', 'z. B. Theorieraum 1')}
                  <ApprovedPicker wk={detail.wk} f={f} kinds={['RAUM', 'GELAENDE']} field="arbeitsplatz" onPick={set} />
                </StackRow>
                <StackRow label={t('av.leaders')}>
                  <div className="py-1">
                    <PersonMultiSelect
                      kpId={wk.kpId}
                      zugId={f.zugId}
                      value={f.leiterUserIds}
                      legacy={f.leiter}
                      onChange={(leiterUserIds, names) => set({ leiterUserIds, leiter: names.join(', ') })}
                    />
                  </div>
                </StackRow>
                <datalist id="av-art">
                  {[t('av.art.wk'), t('av.art.group'), t('av.art.theory'), t('av.art.practical'), t('av.art.exercise'), t('av.art.ezg')].map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
                <datalist id="av-teilnehmer">
                  {[zugName, ...groupNames].filter(Boolean).map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </Group>

              <Group n={2} title={t('av.themeGroup')} done={sections.thema}>
                <Row label={t('av.theme')}>{line('thema', t('av.themePh'))}</Row>
                <StackRow label={t('av.fachbereich')}>
                  <div className="flex flex-wrap gap-1.5 py-1.5">
                    {(Object.keys(FACHBEREICHE) as Fachbereich[]).map((k) => {
                      const on = f.fachbereiche.includes(k);
                      return (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set({ fachbereiche: on ? f.fachbereiche.filter((x) => x !== k) : [...f.fachbereiche, k] })}
                          className={`rounded-full px-3 py-1 text-sm transition ${on ? 'bg-zs-blue font-medium text-white' : 'bg-slate-500/10 text-slate-700 hover:bg-slate-500/15'}`}
                        >
                          {t(`fachbereich.${k}`)}
                        </button>
                      );
                    })}
                  </div>
                </StackRow>
                <StackRow label={t('av.grundlagen')}>{text('grundlagen', t('av.grundlagenPh'))}</StackRow>
              </Group>

              <Group n={3} title={t('av.stufe')} done={sections.stufe} aside={t('av.oneStufe')}>
                <div role="radiogroup" aria-label={t('av.stufe')}>
                  {(['ANLERNEN', 'FESTIGEN', 'ANWENDEN'] as Ausbildungsstufe[]).map((k, i) => (
                    <div key={k} className={i ? 'relative before:absolute before:left-4 before:right-0 before:top-0 before:border-t-[0.5px] before:border-slate-400/45' : ''}>
                      <ChoiceRow title={t(`stufe.${k}`)} detail={t(`av.stufeHint.${k}`)} checked={f.stufe === k} onClick={() => set({ stufe: f.stufe === k ? '' : k })} />
                    </div>
                  ))}
                </div>
              </Group>

              <Group
                n={4}
                title={t('av.ziele')}
                done={sections.ziele}
                foot={
                  <>
                    {tn('av.zieleHint', { example: <em>{t('av.zieleExample')}</em> })}
                  </>
                }
              >
                <Ziele items={f.zielsetzungen} onChange={(zielsetzungen) => set({ zielsetzungen })} />
              </Group>

              <Group n={5} title={t('av.mittel')} done={sections.mittel}>
                <StackRow label={t('av.persAusr')}>{text('persAusruestung', t('av.persAusrPh'))}</StackRow>
                <StackRow label={t('av.fahrzeug')}>
                  {text('fahrzeug', t('av.fahrzeugPh'))}
                  <ApprovedPicker wk={detail.wk} f={f} kinds={['FAHRZEUG', 'ANHAENGER']} field="fahrzeug" onPick={set} />
                </StackRow>
                <StackRow label={t('av.material')}>{text('material', t('av.materialPh'))}</StackRow>
                <StackRow label={t('av.unterlagen')}>{text('unterlagen', t('av.unterlagenPh'))}</StackRow>
                <StackRow label={t('av.postenplakat')}>{text('postenplakat', t('av.postenplakatPh'))}</StackRow>
                <StackRow label={t('common.notes')}>{text('bemerkungen', '')}</StackRow>
              </Group>

              <Group n={6} title={t('av.ablauf')} done={sections.ablauf} aside={t('av.ablaufAside')}>
                <Ablauf rows={f.ablauf} zeitVon={f.zeitVon} zeitBis={f.zeitBis} editable onChange={(ablauf) => set({ ablauf })} />
              </Group>

              <Group n={7} title={t('av.ctrl')} done={sections.ctrl} aside={t('av.ctrlAside')}>
                <StackRow label={t('av.ctrlLabel')}>
                  {text('controlling', t('av.ctrlPh'), 4)}
                </StackRow>
              </Group>
            </>
          )}

          {slotBlock && (
            <Group
              title={t('av.requested')}
              aside={`${weekdayShort(slotBlock.date)} ${fmtDate(slotBlock.date).slice(0, 6)} ${fmtTime(slotBlock.startMin)}–${fmtTime(slotBlock.endMin)}`}
            >
              <div className="p-4">
                <BlockRequests detail={detail} block={slotBlock} />
              </div>
            </Group>
          )}

          <Group title={t('av.attachments')} foot={t('av.attachmentsFoot')}>
            <div className="p-4">
              {isNew ? (
                <p className="text-[15px] text-slate-500">{t('av.attachAfterSave')}</p>
              ) : (
                <FileArea
                  queryKey={['av-files', Number(avId)]}
                  load={() => api.avAttachments(Number(avId))}
                  upload={(file, p) => api.uploadAvAttachment(Number(avId), file, p)}
                  canUpload={editable}
                  emptyText={t('av.noAttachments')}
                />
              )}
            </div>
          </Group>
        </main>
      </div>
    </div>
  );
}


const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

/** Aims as numbered rows; Enter inserts the next one. */
function Ziele({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const { t } = useT();
  const list = items.length ? items : [''];
  const [focus, setFocus] = useState<number | null>(null);
  return (
    <>
      {list.map((z, i) => (
        <div key={i} className="flex min-h-[44px] items-center gap-3 pl-4 pr-2.5">
          <span className="w-[22px] flex-none text-right tabular-nums text-slate-500">{i + 1}.</span>
          <CellInput
            value={z}
            placeholder={t('av.zielPh')}
            ref={(el: HTMLInputElement | null) => {
              if (el && focus === i) {
                el.focus();
                setFocus(null);
              }
            }}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onChange([...list.slice(0, i + 1), '', ...list.slice(i + 1)]);
                setFocus(i + 1);
              }
            }}
            aria-label={`Ziel ${i + 1}`}
          />
          <IconButton label={t('av.removeZiel')} destructive onClick={() => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [''])}>
            <TrashIcon />
          </IconButton>
        </div>
      ))}
      <AddRow
        onClick={() => {
          onChange([...list, '']);
          setFocus(list.length);
        }}
      >
        {t('av.addZiel')}
      </AddRow>
    </>
  );
}

/** The app prints landscape (Arbeitsprogramm); the document is A4 portrait. */
function PortraitPage() {
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = '@media print { @page { size: A4 portrait; margin: 14mm 15mm; } }';
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
  return null;
}

const PHASE_COLOR: Record<PittPhase, string> = { P: '#007aff', I: '#ff9500', T1: '#34c759', T2: '#af52de' };

/** Ablauf by duration: times follow from «Zeit von»; the bar compares the total with the available time. */
function Ablauf({ rows, zeitVon, zeitBis, editable, onChange }: { rows: AblaufSchritt[]; zeitVon: string; zeitBis: string; editable: boolean; onChange: (r: AblaufSchritt[]) => void }) {
  const { t } = useT();
  const upd = (i: number, patch: Partial<AblaufSchritt>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const times = schedule(zeitVon, rows);
  const total = rows.reduce((a, r) => a + (r.dauer || 0), 0);
  const avail = zeitVon && zeitBis ? (parseTime(zeitBis) - parseTime(zeitVon) + 1440) % 1440 : null;
  const scale = Math.max(total, avail ?? 0) || 1;
  const color = (p: PittPhase | '') => (p ? PHASE_COLOR[p] : 'rgb(var(--c-slate-400) / 0.6)');
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3 py-2.5 pl-3 pr-2.5">
          <span className="w-1 flex-none rounded-sm transition-colors" style={{ background: color(r.phase) }} aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`min-w-[98px] tabular-nums ${times[i].von ? 'font-semibold' : 'text-slate-500'}`}>{times[i].von ? `${times[i].von}–${times[i].bis}` : t('av.stepN', { n: i + 1 })}</span>
              {editable ? (
                <select
                  className="max-w-[220px] cursor-pointer appearance-none rounded-[7px] bg-slate-500/10 bg-[length:8px_12px] bg-[right_8px_center] bg-no-repeat py-[5px] pl-2.5 pr-[26px] text-sm text-slate-900 outline-none"
                  style={{ backgroundImage: SELECT_ARROWS }}
                  value={r.phase}
                  onChange={(e) => upd(i, { phase: e.target.value as PittPhase | '' })}
                  aria-label={t('av.phase')}
                >
                  <option value="">{t('av.phaseChoose')}</option>
                  {(Object.keys(PITT) as PittPhase[]).map((p) => (
                    <option key={p} value={p}>
                      {t(`pitt.${p}`)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-medium">{r.phase ? t(`pitt.${r.phase}`) : ''}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {editable ? <Stepper value={r.dauer} unit={t('av.min')} label={t('av.duration')} onChange={(dauer) => upd(i, { dauer })} /> : <span className="text-sm text-slate-500">{r.dauer} {t('av.min')}</span>}
              {editable && (
                <div className="ml-auto flex">
                  <IconButton label={t('tpl.up')} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </IconButton>
                  <IconButton label={t('tpl.down')} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </IconButton>
                  <IconButton label={t('av.removeStep')} destructive onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    <TrashIcon />
                  </IconButton>
                </div>
              )}
            </div>
            {editable ? (
              <CellTextArea value={r.text} onChange={(e) => upd(i, { text: e.target.value })} placeholder={t('av.activityPh')} aria-label={t('av.activity')} />
            ) : (
              <span className="whitespace-pre-wrap text-sm">{r.text}</span>
            )}
          </div>
        </div>
      ))}
      {editable && <AddRow onClick={() => onChange([...rows, { dauer: 10, phase: '', text: '' }])}>{t('av.addStep')}</AddRow>}
      <div className="flex flex-col gap-[9px] px-4 pb-3.5 pt-3">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[15px]">
          <b>{t('av.total', { n: total })}</b>
          {avail !== null ? (
            avail === total ? (
              <span className="text-emerald-600">{t('av.fits', { n: avail })}</span>
            ) : avail > total ? (
              <span className="text-orange-600">{t('av.free', { free: avail - total, avail })}</span>
            ) : (
              <span className="text-red-600">{t('av.tooLong', { n: total - avail })}</span>
            )
          ) : (
            <span className="text-slate-500">{t('av.enterTimes')}</span>
          )}
        </div>
        <div className="flex h-2 overflow-hidden rounded bg-slate-500/10">
          {rows.map((r, i) => (
            <div key={i} className="h-full border-r-2 border-[rgb(var(--c-cell))] last:border-r-0" style={{ width: `${((r.dauer || 0) / scale) * 100}%`, background: color(r.phase) }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-slate-500">
          {(Object.keys(PITT) as PittPhase[]).map((p) => (
            <span key={p} className="inline-flex items-center gap-[5px]">
              <i className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[p] }} />
              {t(`pitt.${p}`)}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

const SELECT_ARROWS = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 14'%3E%3Cpath d='M2 5l3-3 3 3M2 9l3 3 3-3' fill='none' stroke='%238e8e93' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

/**
 * Approved vehicles, rooms and terrain of the Zug for the day of the lesson (overlapping its time, if set).
 * A click adds the name to the field.
 */
function ApprovedPicker({
  wk,
  f,
  kinds,
  field,
  onPick,
}: {
  wk: WkDetail['wk'];
  f: AvInput;
  kinds: ResourceKind[];
  field: 'arbeitsplatz' | 'fahrzeug';
  onPick: (patch: Partial<AvInput>) => void;
}) {
  const { t } = useT();
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id) });
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId) });
  const from = f.zeitVon ? parseTime(f.zeitVon) : 0;
  const to = f.zeitBis ? parseTime(f.zeitBis) : 24 * 60;
  const name = (id: number) => resources.data?.find((r) => r.id === id)?.name;
  const items = (requests.data ?? [])
    .filter((q) => q.status === 'BEWILLIGT' && q.zugId === f.zugId && kinds.includes(q.kind) && (!f.datum || q.date === f.datum))
    .filter((q) => !f.datum || (q.startMin < to && q.endMin > from))
    .flatMap((q) => {
      const ids = q.resourceId != null ? [q.resourceId] : q.assignedIds;
      const names = ids.length ? ids.map(name).filter((n): n is string => !!n) : q.kind === 'GELAENDE' ? [t('av.siteOf', { zweck: q.zweck })] : [];
      return names.map((n) => ({ key: `${q.id}:${n}`, name: n, when: `${f.datum ? '' : `${fmtDate(q.date).slice(0, 6)} `}${fmtTime(q.startMin)}–${fmtTime(q.endMin)}` }));
    });
  if (!items.length) return null;
  const current = f[field];
  const has = (n: string) => current.split(/[,\n]/).some((x) => x.trim() === n);
  return (
    <div className="mb-1 flex flex-wrap items-center gap-1 text-xs print:hidden">
      <span className="text-slate-500">{t('av.approved')}</span>
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          disabled={has(i.name)}
          title={i.when}
          onClick={() => onPick({ [field]: current.trim() ? `${current.trim()}, ${i.name}` : i.name })}
          className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-800 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {has(i.name) ? '✓' : '+'} {i.name} <span className="text-emerald-700/70">{i.when}</span>
        </button>
      ))}
    </div>
  );
}

