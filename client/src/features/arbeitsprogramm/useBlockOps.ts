import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Block, BlockInput } from '@shared/types';
import { api, ApiError, type WkDetail } from '../../api';
import { errMsg, useToast } from '../../components/ui';

const FIELDS = ['date', 'startMin', 'endMin', 'zugIds', 'title', 'type', 'locationId', 'verantwortlich', 'notes', 'locked'] as const;
export type BlockFields = Partial<Pick<Block, (typeof FIELDS)[number]>>;

export const toInput = (b: Block): BlockInput => {
  const out = {} as Record<string, unknown>;
  for (const f of FIELDS) out[f] = b[f];
  return out as BlockInput;
};

const pick = (b: Block, keys: string[]): BlockFields => {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (b as unknown as Record<string, unknown>)[k];
  return out as BlockFields;
};

type Op =
  | { kind: 'update'; id: number; before: BlockFields; after: BlockFields }
  | { kind: 'create'; id: number; data: BlockInput }
  | { kind: 'delete'; id: number; data: BlockInput };

/** Block mutations with optimistic cache updates, conflict handling and an undo/redo stack. */
export function useBlockOps(wkId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['wk', wkId];
  const undoStack = useRef<Op[]>([]);
  const redoStack = useRef<Op[]>([]);
  const [, rerender] = useState(0);
  const bump = () => rerender((n) => n + 1);

  const blocks = () => qc.getQueryData<WkDetail>(key)?.blocks ?? [];
  const setBlocks = (fn: (b: Block[]) => Block[]) =>
    qc.setQueryData<WkDetail>(key, (d) => (d ? { ...d, blocks: fn(d.blocks) } : d));

  // The server keeps the Standort reservation of a block in step with it.
  const refreshRequests = () => qc.invalidateQueries({ queryKey: ['requests', wkId] });

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) {
      toast(errMsg(e) + ' – Ansicht wurde aktualisiert.', 'error');
    } else {
      toast(errMsg(e), 'error');
    }
    qc.invalidateQueries({ queryKey: key });
  };

  const record = (op: Op) => {
    undoStack.current.push(op);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    bump();
  };

  const remap = (oldId: number, newId: number) => {
    for (const op of [...undoStack.current, ...redoStack.current]) if (op.id === oldId) op.id = newId;
  };

  const doPatch = async (id: number, fields: BlockFields): Promise<Block | null> => {
    const b = blocks().find((x) => x.id === id);
    if (!b) return null;
    setBlocks((list) => list.map((x) => (x.id === id ? { ...x, ...fields } : x)));
    try {
      const res = await api.updateBlock(wkId, id, { ...fields, version: b.version });
      setBlocks((list) => list.map((x) => (x.id === id ? res : x)));
      refreshRequests();
      return b;
    } catch (e) {
      setBlocks((list) => list.map((x) => (x.id === id ? b : x)));
      fail(e);
      return null;
    }
  };

  const doCreate = async (data: BlockInput): Promise<Block | null> => {
    try {
      const res = await api.createBlock(wkId, data);
      setBlocks((list) => [...list, res]);
      refreshRequests();
      return res;
    } catch (e) {
      fail(e);
      return null;
    }
  };

  const doDelete = async (id: number): Promise<Block | null> => {
    const b = blocks().find((x) => x.id === id);
    if (!b) return null;
    setBlocks((list) => list.filter((x) => x.id !== id));
    try {
      await api.deleteBlock(wkId, id);
      refreshRequests();
      return b;
    } catch (e) {
      setBlocks((list) => [...list, b]);
      fail(e);
      return null;
    }
  };

  const update = useCallback(async (id: number, fields: BlockFields) => {
    const before = await doPatch(id, fields);
    if (before) record({ kind: 'update', id, before: pick(before, Object.keys(fields)), after: fields });
    return !!before;
  }, [wkId]);

  const create = useCallback(async (data: BlockInput) => {
    const b = await doCreate(data);
    if (b) record({ kind: 'create', id: b.id, data });
    return b;
  }, [wkId]);

  const remove = useCallback(async (id: number) => {
    const b = await doDelete(id);
    if (b) record({ kind: 'delete', id, data: toInput(b) });
    return !!b;
  }, [wkId]);

  const undo = useCallback(async () => {
    const op = undoStack.current.pop();
    if (!op) return;
    bump();
    let ok = false;
    if (op.kind === 'update') ok = !!(await doPatch(op.id, op.before));
    if (op.kind === 'create') ok = !!(await doDelete(op.id));
    if (op.kind === 'delete') {
      const b = await doCreate(op.data);
      if (b) {
        remap(op.id, b.id);
        ok = true;
      }
    }
    if (ok) redoStack.current.push(op);
    bump();
  }, [wkId]);

  const redo = useCallback(async () => {
    const op = redoStack.current.pop();
    if (!op) return;
    bump();
    let ok = false;
    if (op.kind === 'update') ok = !!(await doPatch(op.id, op.after));
    if (op.kind === 'delete') ok = !!(await doDelete(op.id));
    if (op.kind === 'create') {
      const b = await doCreate(op.data);
      if (b) {
        remap(op.id, b.id);
        ok = true;
      }
    }
    if (ok) undoStack.current.push(op);
    bump();
  }, [wkId]);

  return {
    update,
    create,
    remove,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
