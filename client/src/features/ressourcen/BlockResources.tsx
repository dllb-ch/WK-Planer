import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Block, RequestStatus, ResourceKind, Wk } from '@shared/types';
import { REQUEST_STATUS_LABEL } from '@shared/types';
import { fmtTime } from '@shared/util';
import { api, type WkDetail } from '../../api';
import { RESOURCE_KIND_LABEL } from '@shared/types';
import { canRequestResource } from '@shared/permissions';
import { useUser } from '../../auth';
import { Button } from '../../components/ui';
import { RequestDialog } from './RequestDialog';
import { requestLabel } from './conflicts';

export interface ResourceChip {
  key: number;
  kind: ResourceKind;
  name: string;
  status: RequestStatus;
  title: string;
}

const ICON: Record<ResourceKind, string> = { FAHRZEUG: '🚐', ANHAENGER: '🚛', RAUM: '🏠', GELAENDE: '⛰' };
const DOT: Record<RequestStatus, string> = { BEWILLIGT: 'bg-emerald-500', BEANTRAGT: 'bg-amber-400', ABGELEHNT: 'bg-slate-400' };

/**
 * Requested vehicles, rooms and terrain per block: requests made for the block, or for the same Zug
 * at an overlapping time on that day. Rejected requests are left out.
 */
export function useBlockResources(wk: Wk) {
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id) });
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId) });
  return (b: Pick<Block, 'id' | 'date' | 'startMin' | 'endMin' | 'zugIds'>): ResourceChip[] =>
    (requests.data ?? [])
      .filter(
        (q) =>
          q.status !== 'ABGELEHNT' &&
          q.date === b.date &&
          (q.blockId === b.id || (q.blockId === null && b.zugIds.includes(q.zugId) && q.startMin < b.endMin && q.endMin > b.startMin)),
      )
      .map((q) => {
        const name = q.kind === 'GELAENDE' && q.resourceId == null ? 'Gelände' : requestLabel(q, resources.data ?? []);
        return {
          key: q.id,
          kind: q.kind,
          name,
          status: q.status,
          title: `${name}: ${q.zweck}, ${fmtTime(q.startMin)}–${fmtTime(q.endMin)} (${REQUEST_STATUS_LABEL[q.status]})`,
        };
      });
}

/** Compact chips for blocks; `onColor` is for use on a coloured block background. */
export function ResourceChips({ chips, onColor }: { chips: ResourceChip[]; onColor?: boolean }) {
  if (!chips.length) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-0.5">
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className={`inline-flex max-w-full items-center gap-1 truncate rounded px-1 text-[10px] leading-4 ${onColor ? 'bg-white/90 text-slate-800' : 'bg-slate-100 text-slate-700'}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[c.status]}`} />
          <span aria-hidden>{ICON[c.kind]}</span>
          <span className="truncate">{c.name}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Inside the block dialog, below the Standort: the reservation of a catalogue Standort (made by the server on
 * saving), the other requests of the block with their status, and buttons to request more.
 */
export function BlockRequests({
  detail,
  block,
  draft,
  initialKind,
  onRequestNew,
}: {
  detail: WkDetail;
  /** Null for a new block. */
  block: Block | null;
  /** Unsaved state of the dialog; defaults to the block. */
  draft?: Pick<Block, 'locationId' | 'date' | 'startMin' | 'endMin' | 'zugIds' | 'title'>;
  /** Opens the request dialog of this kind right away (after «+ Fahrzeug» on a new block). */
  initialKind?: ResourceKind;
  /** New block: save it, then request (the page reopens it). */
  onRequestNew?: (kind: ResourceKind) => void;
}) {
  const me = useUser();
  const { wk } = detail;
  const d = draft ?? block!;
  const blockChips = useBlockResources(wk);
  const requests = useQuery({ queryKey: ['requests', wk.id], queryFn: () => api.requests(wk.id) });
  const resources = useQuery({ queryKey: ['resources', wk.kpId], queryFn: () => api.resources(wk.kpId) });
  const [kind, setKind] = useState<ResourceKind | null>(initialKind ?? null);
  const standortReq = block ? (requests.data ?? []).find((q) => q.blockId === block.id && q.standort) : undefined;
  const chips = block ? blockChips(block).filter((c) => c.key !== standortReq?.id) : [];
  const rejected = block ? (requests.data ?? []).filter((q) => q.blockId === block.id && q.status === 'ABGELEHNT' && !q.standort) : [];
  const zugId = (block ?? d).zugIds.find((z) => canRequestResource(me, wk, z));
  const canAdd = zugId !== undefined && (block !== null || !!onRequestNew);

  const loc = detail.locations.find((l) => l.id === d.locationId);
  const target = (resources.data ?? []).find((r) => r.id === loc?.resourceId);
  const reserved =
    standortReq && target && standortReq.resourceId === target.id && standortReq.date === d.date && standortReq.startMin === d.startMin && standortReq.endMin === d.endMin;
  const prevName = standortReq && (resources.data ?? []).find((r) => r.id === standortReq.resourceId)?.name;

  return (
    <div className="space-y-1.5">
      {target ? (
        <p className="flex items-center gap-1.5 text-xs">
          {reserved ? (
            <>
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[standortReq.status]}`} />
              <span aria-hidden>{ICON[target.kind]}</span>
              <span>
                {target.name} reserviert: <b>{REQUEST_STATUS_LABEL[standortReq.status]}</b>
                {standortReq.status === 'ABGELEHNT' && standortReq.decisionNote ? ` – ${standortReq.decisionNote}` : ''}
              </span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full border border-amber-500" />
              <span aria-hidden>{ICON[target.kind]}</span>
              <span>{target.name} wird beim Speichern reserviert.</span>
            </>
          )}
        </p>
      ) : standortReq ? (
        <p className="text-xs text-slate-500">Reservation {prevName ? `von ${prevName} ` : ''}wird beim Speichern zurückgezogen.</p>
      ) : loc ? (
        <p className="text-xs text-slate-400">Ort ausserhalb des Katalogs – keine Reservation.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label !mb-0 mr-auto">Weitere Ressourcen</span>
        {canAdd &&
          (['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE'] as ResourceKind[]).map((k) => (
            <Button
              key={k}
              className="py-0.5 text-xs"
              disabled={!block && !d.title.trim()}
              title={block ? undefined : d.title.trim() ? 'Block speichern und anfragen' : 'Zuerst einen Titel erfassen'}
              onClick={() => (block ? setKind(k) : onRequestNew!(k))}
            >
              + {RESOURCE_KIND_LABEL[k]}
            </Button>
          ))}
      </div>
      {chips.length === 0 && rejected.length === 0 ? (
        <p className="text-xs text-slate-400">{block ? 'Noch nichts angefragt.' : 'Fahrzeuge, Anhänger, weitere Räume oder Gelände – der Block wird dafür gespeichert.'}</p>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {chips.map((c) => (
            <li key={c.key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[c.status]}`} />
              <span aria-hidden>{ICON[c.kind]}</span>
              <span className="truncate">{c.title}</span>
            </li>
          ))}
          {rejected.map((q) => (
            <li key={q.id} className="flex items-center gap-1.5 text-slate-400 line-through">
              <span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" />
              {ICON[q.kind]} {q.zweck} ({REQUEST_STATUS_LABEL[q.status]}{q.decisionNote ? `: ${q.decisionNote}` : ''})
            </li>
          ))}
        </ul>
      )}
      {kind && block && zugId !== undefined && (
        <RequestDialog
          detail={detail}
          initial={{ zugId, blockId: block.id, kind, date: block.date, startMin: block.startMin, endMin: block.endMin, zweck: block.title }}
          onClose={() => setKind(null)}
        />
      )}
    </div>
  );
}
