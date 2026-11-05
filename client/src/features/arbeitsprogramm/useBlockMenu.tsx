// Right-click menu for blocks and empty grid space (Arbeitsprogramm, Zugansicht).
import { useCallback, useState, type ReactNode } from 'react';
import type { Block, BlockInput, ResourceKind } from '@shared/types';
import { BLOCK_TYPE_INFO, RESOURCE_KIND_LABEL } from '@shared/types';
import { canCreateBlock, canEditBlock, canLockBlocks, canRequestResource } from '@shared/permissions';
import { blockFitsDay, fmtDate, fmtTime, weekday } from '@shared/util';
import type { WkDetail } from '../../api';
import { useUser } from '../../auth';
import { ContextMenu, type MenuItem, type MenuState } from '../../components/ContextMenu';
import { RequestDialog } from '../ressourcen/RequestDialog';
import { toInput, type useBlockOps } from './useBlockOps';

const ICON: Record<'FAHRZEUG' | 'RAUM' | 'GELAENDE', string> = { FAHRZEUG: '🚐', RAUM: '🏠', GELAENDE: '⛰' };

export function useBlockMenu(opts: {
  detail: WkDetail;
  ops: ReturnType<typeof useBlockOps>;
  /** Days shown, in order (for «Kopie am nächsten Tag»). */
  days: string[];
  onEdit: (id: number) => void;
  onDuplicate: (initial: BlockInput) => void;
  /** New block at a place; omitted when no new block may be drawn there. */
  onNew?: (at: { date: string; zugId: number; min: number }) => void;
  canCreateAt?: (zugId: number) => boolean;
  /** Further entries for a block (e.g. Ausbildungsvorbereitung in the Zugansicht). */
  extraBlockItems?: (b: Block) => MenuItem[];
  /** Further entries for empty space. */
  extraEmptyItems?: () => MenuItem[];
}) {
  const me = useUser();
  const { wk, blocks } = opts.detail;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [request, setRequest] = useState<{ block: Block; zugId: number; kind: ResourceKind } | null>(null);
  const close = useCallback(() => setMenu(null), []);

  const onBlockMenu = (id: number, x: number, y: number) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const editable = canEditBlock(me, wk, b);
    const source = me.role === 'BAT' ? 'BAT' : 'KP';
    const mayCopy = canCreateBlock(me, wk, { zugIds: b.zugIds, locked: me.role === 'BAT' || b.locked, source });
    const nextDay = opts.days.slice(opts.days.indexOf(b.date) + 1).find((d) => blockFitsDay(wk, d, b.zugIds));
    const requestZug = b.zugIds.find((z) => canRequestResource(me, wk, z));
    const items: MenuItem[] = [
      { label: editable ? 'Bearbeiten' : 'Anzeigen', icon: '✎', onClick: () => opts.onEdit(b.id), hint: 'Doppelklick' },
      ...(mayCopy
        ? ([
            { label: 'Duplizieren …', icon: '⧉', onClick: () => opts.onDuplicate({ ...toInput(b), locked: me.role === 'BAT' || b.locked }) },
            {
              label: nextDay ? `Kopie am ${weekday(nextDay).slice(0, 2)} ${fmtDate(nextDay).slice(0, 6)}` : 'Kopie am nächsten Tag',
              icon: '↷',
              disabled: !nextDay,
              onClick: () => nextDay && opts.ops.create({ ...toInput(b), date: nextDay }),
            },
          ] as MenuItem[])
        : []),
      ...(editable && canLockBlocks(me) && b.source === 'KP'
        ? ([{ label: b.locked ? 'Lösen (Zugführer dürfen verschieben)' : 'Fixieren', icon: b.locked ? '🔓' : '🔒', onClick: () => opts.ops.update(b.id, { locked: !b.locked }) }] as MenuItem[])
        : []),
      ...(requestZug !== undefined
        ? (['separator', ...(['FAHRZEUG', 'RAUM', 'GELAENDE'] as const).map((k) => ({ label: `${RESOURCE_KIND_LABEL[k]} anfragen …`, icon: ICON[k], onClick: () => setRequest({ block: b, zugId: requestZug, kind: k }) }))] as MenuItem[])
        : []),
      ...(opts.extraBlockItems ? opts.extraBlockItems(b) : []),
      ...(editable
        ? (['separator', { label: 'Löschen', icon: '🗑', danger: true, hint: 'Entf', onClick: () => confirm(`«${b.title}» löschen?`) && opts.ops.remove(b.id) }] as MenuItem[])
        : []),
    ];
    // No two separators in a row, none at the end.
    const clean = items.filter((it, i, all) => it !== 'separator' || (i > 0 && all[i - 1] !== 'separator' && i < all.length - 1));
    setMenu({ x, y, title: `${b.title} · ${fmtTime(b.startMin)}–${fmtTime(b.endMin)} · ${BLOCK_TYPE_INFO[b.type].label}`, items: clean });
  };

  const onEmptyMenu = (at: { date: string; zugId: number; min: number }, x: number, y: number) => {
    const items: MenuItem[] = [
      ...(opts.onNew && (opts.canCreateAt?.(at.zugId) ?? true) ? ([{ label: `Neuer Block hier (${fmtTime(at.min)})`, icon: '+', onClick: () => opts.onNew!(at) }] as MenuItem[]) : []),
      ...(opts.extraEmptyItems ? opts.extraEmptyItems() : []),
    ];
    if (items.length) setMenu({ x, y, title: `${weekday(at.date)}, ${fmtDate(at.date)}`, items });
  };

  const element: ReactNode = (
    <>
      {menu && <ContextMenu menu={menu} onClose={close} />}
      {request && (
        <RequestDialog
          detail={opts.detail}
          initial={{ zugId: request.zugId, blockId: request.block.id, kind: request.kind, date: request.block.date, startMin: request.block.startMin, endMin: request.block.endMin, zweck: request.block.title }}
          onClose={() => setRequest(null)}
        />
      )}
    </>
  );
  return { onBlockMenu, onEmptyMenu, element };
}
