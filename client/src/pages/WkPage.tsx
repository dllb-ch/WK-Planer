import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { canArchiveWk, canReopen, canReview, canSubmit, canViewMilestones, canViewPersonnel, canViewTagesbefehl } from '@shared/permissions';
import { fmtDate } from '@shared/util';
import { api, ApiError, type WkDetail } from '../api';
import { useUser } from '../auth';
import { Button, errMsg, Modal, StatusBadge, TextArea, useToast } from '../components/ui';
import { ArbeitsprogrammPage } from '../features/arbeitsprogramm/ArbeitsprogrammPage';
import { KonzeptPage } from './KonzeptPage';
import { ZfhrPage } from './ZfhrPage';
import { MilestonesPage } from './MilestonesPage';
import { ZugPage } from '../features/zug/ZugPage';
import { AvPage } from '../features/av/AvPage';
import { RessourcenPage } from '../features/ressourcen/RessourcenPage';
import { PersonalPage } from '../features/personal/PersonalPage';
import { RapportePage } from '../features/rapporte/RapportePage';
import { PendenzenPage } from '../features/rapporte/PendenzenPage';
import { DateienPage } from '../features/dateien/DateienPage';
import { ErkundungenPage, ErkundungPage } from '../features/erkundung/Erkundungen';
import { UebungenPage, UebungPage } from '../features/uebung/Uebungen';
import { TagesbefehlPage } from '../features/tagesbefehl/TagesbefehlPage';
import { RapportPage } from '../features/rapporte/RapportPage';
import { DossierPage } from '../features/dossier/DossierPage';
import { LektionenPage } from '../features/av/LektionenPage';

export function WkPage() {
  const id = Number(useParams().id);
  const location = useLocation();
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const [review, setReview] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');

  const q = useQuery({ queryKey: ['wk', id], queryFn: () => api.wk(id), refetchInterval: 10000 });
  usePrefetchForOffline(q.data);

  const action = useMutation({
    mutationFn: async (a: 'submit' | 'approve' | 'reject' | 'reopen') => {
      if (a === 'submit') return api.submit(id);
      if (a === 'approve') return api.approve(id, note);
      if (a === 'reject') return api.reject(id, note);
      return api.reopen(id);
    },
    onSuccess: () => {
      setReview(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['wk', id] });
      qc.invalidateQueries({ queryKey: ['wks'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  if (q.error) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return <div className="p-8 text-slate-600">{status === 403 ? 'Kein Zugriff auf diesen WK.' : errMsg(q.error)}</div>;
  }
  if (!q.data) return <div className="p-8 text-slate-500">Laden …</div>;
  const { wk } = q.data;
  const zugFirst = me.role === 'ZFHR' || me.role === 'KADER';

  const tab = (isActive: boolean) =>
    // Segment of a segmented control.
    `shrink-0 rounded-[7px] px-3 py-1 text-[13px] transition ${isActive ? 'bg-white font-semibold text-slate-900 shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]' : 'font-medium text-slate-600 hover:text-slate-900'}`;

  // Sections of the WK with their pages; the first visible page opens the section.
  const all: { label: string; subs: { to: string; label: string; show?: boolean; also?: string[] }[] }[] = [
    { label: 'Zugansicht', subs: [{ to: 'zug', label: 'Zugansicht' }] },
    {
      label: 'Auftrag Kp Kdt',
      subs: [
        { to: '', label: 'Arbeitsprogramm' },
        { to: 'konzept', label: 'WK-Konzept' },
      ],
    },
    { label: 'Zugführer-AP', subs: [{ to: 'zfhr', label: 'Zugführer-AP' }] },
    {
      label: 'Ausbildung',
      subs: [
        { to: 'lektionen', label: 'Lektionen', also: ['av'] },
        { to: 'uebungen', label: 'Übungen' },
        { to: 'erkundungen', label: 'Erkundungen' },
      ],
    },
    {
      label: 'Ressourcen',
      subs: [
        { to: 'ressourcen', label: 'Fahrzeuge, Räume, Gelände' },
        { to: 'personal', label: 'Personal', show: canViewPersonnel(me, wk) },
      ],
    },
    { label: 'Rapporte', subs: [{ to: 'rapporte', label: 'Rapporte' }] },
    { label: 'Pendenzen', subs: [{ to: 'pendenzen', label: 'Pendenzen', also: ['meilensteine'] }] },
    { label: 'Dateien', subs: [{ to: 'dateien', label: 'Dateien' }] },
    {
      label: 'Dossier',
      subs: [
        { to: 'dossier', label: 'Dossier' },
        { to: 'tagesbefehl', label: 'Tagesbefehl', show: canViewTagesbefehl(me, wk) },
      ],
    },
  ];
  const ordered = zugFirst ? all : [all[1], all[0], ...all.slice(2)];
  const sections = ordered.map((sec) => ({ ...sec, subs: sec.subs.filter((x) => x.show !== false) })).filter((sec) => sec.subs.length);
  const segment = location.pathname.split('/')[3] ?? '';
  const active = sections.find((sec) => sec.subs.some((x) => x.to === segment || x.also?.includes(segment))) ?? sections.find((sec) => sec.label === 'Auftrag Kp Kdt');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-print hairline-b px-3 pb-2 pt-2 sm:px-4 sm:pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link to="/" className="-ml-1 rounded-full px-1.5 py-0.5 text-[15px] text-zs-blue hover:bg-slate-200/60" aria-label="Zur Übersicht">
            ‹<span className="hidden sm:inline"> Übersicht</span>
          </Link>
          <h1 className="text-lg font-bold tracking-tight sm:text-[22px]">{wk.title}</h1>
          <StatusBadge status={wk.status} />
          <span className="text-sm text-slate-500">
            {fmtDate(wk.startDate)} – {fmtDate(wk.endDate)}
          </span>
          <span className="flex-1" />
          {!wk.archived && canSubmit(me, wk) && (
            <Button variant="primary" disabled={action.isPending} onClick={() => action.mutate('submit')}>
              Zur Freigabe einreichen
            </Button>
          )}
          {!wk.archived && canReview(me, wk) && (
            <>
              <Button variant="danger" onClick={() => setReview('reject')}>
                Zurückweisen
              </Button>
              <Button variant="primary" onClick={() => setReview('approve')}>
                Freigeben
              </Button>
            </>
          )}
          {!wk.archived && canReopen(me, wk) && (
            <Button disabled={action.isPending} onClick={() => action.mutate('reopen')}>
              {wk.status === 'EINGEREICHT' ? 'Einreichung zurückziehen' : 'Wieder öffnen'}
            </Button>
          )}
        </div>
        {wk.archived && (
          <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-200/70 px-3 py-1.5 text-sm text-slate-700">
            <b>Archiviert</b> – nur lesen.
            {canArchiveWk(me, wk) && (
              <Button
                className="!py-0.5 text-xs"
                onClick={async () => {
                  try {
                    await api.archiveWk(wk.id, false);
                    qc.invalidateQueries({ queryKey: ['wk', wk.id] });
                    qc.invalidateQueries({ queryKey: ['wks'] });
                  } catch (e) {
                    toast(errMsg(e), 'error');
                  }
                }}
              >
                Wiederherstellen
              </Button>
            )}
          </p>
        )}
        {wk.reviewNote && (wk.status === 'ZURUECKGEWIESEN' || wk.status === 'FREIGEGEBEN') && (
          <p className={`mt-2 rounded-lg px-3 py-1.5 text-sm ${wk.status === 'ZURUECKGEWIESEN' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
            <b>Bat Kommando:</b> {wk.reviewNote}
          </p>
        )}
        <div className="-mx-3 mt-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <nav className="inline-flex gap-0.5 whitespace-nowrap rounded-[9px] bg-slate-200/80 p-0.5">
            {sections.map((sec) => (
              <Link key={sec.label} to={sec.subs[0].to} className={tab(sec === active)}>
                {sec.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {active && active.subs.length > 1 && (
        <div className="no-print hairline-b flex gap-1 overflow-x-auto whitespace-nowrap px-3 py-1.5 sm:px-4">
          {active.subs.map((x) => (
            <NavLink
              key={x.to}
              to={x.to}
              end={x.to === ''}
              className={({ isActive }) =>
                `rounded-full px-3 py-1 text-sm transition ${isActive || x.also?.includes(segment) ? 'bg-zs-blue font-semibold text-white' : 'text-zs-blue hover:bg-slate-200/60'}`
              }
            >
              {x.label}
            </NavLink>
          ))}
        </div>
      )}

      <Routes>
        <Route index element={<ArbeitsprogrammPage detail={q.data} />} />
        <Route path="konzept" element={<KonzeptPage detail={q.data} />} />
        <Route path="zfhr" element={<ZfhrPage detail={q.data} />} />
        <Route path="meilensteine" element={<PendenzenPage detail={q.data} />} />
        <Route path="zug" element={<ZugPage detail={q.data} />} />
        <Route path="ressourcen" element={<RessourcenPage detail={q.data} />} />
        <Route path="personal" element={<PersonalPage detail={q.data} />} />
        <Route path="rapporte" element={<RapportePage detail={q.data} />} />
        <Route path="dateien" element={<DateienPage detail={q.data} />} />
        <Route path="erkundungen" element={<ErkundungenPage detail={q.data} />} />
        <Route path="erkundungen/:eid" element={<ErkundungPage detail={q.data} />} />
        <Route path="uebungen" element={<UebungenPage detail={q.data} />} />
        <Route path="uebungen/:uid" element={<UebungPage detail={q.data} />} />
        <Route path="tagesbefehl" element={canViewTagesbefehl(me, wk) ? <TagesbefehlPage detail={q.data} /> : <Navigate to="../dossier" replace />} />
        <Route path="lektionen" element={<LektionenPage detail={q.data} />} />
        <Route path="pendenzen" element={<PendenzenPage detail={q.data} />} />
        <Route path="rapporte/:rid" element={<RapportPage detail={q.data} />} />
        <Route path="av/:avId" element={<AvPage detail={q.data} />} />
        <Route path="dossier" element={<DossierPage detail={q.data} />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>

      {review && (
        <Modal
          title={review === 'approve' ? 'Arbeitsprogramm freigeben' : 'Arbeitsprogramm zurückweisen'}
          onClose={() => setReview(null)}
          footer={
            <>
              <Button onClick={() => setReview(null)}>Abbrechen</Button>
              <Button
                variant={review === 'approve' ? 'primary' : 'danger'}
                disabled={action.isPending || (review === 'reject' && !note.trim())}
                onClick={() => action.mutate(review)}
              >
                {review === 'approve' ? 'Freigeben' : 'Zurückweisen'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            {review === 'approve'
              ? 'Nach der Freigabe ist das Arbeitsprogramm eingefroren. Der Kp Kdt kann es bei Bedarf wieder öffnen.'
              : 'Der Kp Kdt erhält das Arbeitsprogramm zur Überarbeitung zurück.'}
          </p>
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={review === 'approve' ? 'Bemerkung (optional)' : 'Begründung / Auflagen (erforderlich)'}
            autoFocus
          />
        </Modal>
      )}
    </div>
  );
}

/**
 * Loads the data of all tabs once the WK is open, so the service worker caches it
 * and the WK stays readable offline (Zugansicht, documents, Vorbereitung, Ressourcen).
 */
function usePrefetchForOffline(detail: WkDetail | undefined) {
  const qc = useQueryClient();
  const me = useUser();
  const wkId = detail?.wk.id;
  const kpId = detail?.wk.kpId;
  useEffect(() => {
    if (!wkId || !kpId || !navigator.onLine) return;
    const wk = wkId;
    qc.prefetchQuery({ queryKey: ['milestones', wk], queryFn: () => api.milestones(wk) });
    qc.prefetchQuery({ queryKey: ['konzept', wk], queryFn: () => api.konzept(wk) });
    qc.prefetchQuery({ queryKey: ['requests', wk], queryFn: () => api.requests(wk) });
    qc.prefetchQuery({ queryKey: ['comments', wk], queryFn: () => api.comments(wk) });
    qc.prefetchQuery({ queryKey: ['resources', kpId], queryFn: () => api.resources(kpId) });
    qc.fetchQuery({ queryKey: ['avs', wk], queryFn: () => api.avs(wk) })
      .then((avs) => {
        // Documents of the own Zug (all visible ones for command roles).
        for (const a of avs.filter((x) => !me.zugId || x.zugId === me.zugId)) {
          qc.prefetchQuery({ queryKey: ['av', wk, String(a.id)], queryFn: () => api.av(wk, a.id) });
        }
      })
      .catch(() => {});
  }, [qc, wkId, kpId, me.zugId]);
}
