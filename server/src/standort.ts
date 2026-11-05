// A block's Standort that is a catalogue room or terrain is reserved by a request of the block («standort»),
// kept in step with the block: created, moved, switched to another room or withdrawn.
import type { DB } from './db';
import { audit } from './db';
import { occupied } from './repo';
import { canDecideRequest } from '../../shared/permissions';
import type { Block, SessionUser, Wk } from '../../shared/types';

export async function syncStandort(db: DB, u: SessionUser, wk: Wk, block: Block) {
  const loc = block.locationId != null ? ((await db.prepare('SELECT resource_id FROM location WHERE id = ?').get(block.locationId)) as any) : undefined;
  const resourceId: number | null = loc?.resource_id ?? null;
  const existing = (await db.prepare('SELECT * FROM resource_request WHERE block_id = ? AND standort').get(block.id)) as any;
  if (resourceId == null) {
    if (existing) {
      await db.prepare('DELETE FROM resource_request WHERE id = ?').run(existing.id);
      await audit(db, u.id, 'request', existing.id, 'delete', { standort: true });
    }
    return;
  }
  const res = (await db.prepare('SELECT kind, category FROM resource WHERE id = ?').get(resourceId)) as any;
  const zugId = existing && block.zugIds.includes(existing.zug_id) ? existing.zug_id : block.zugIds[0];
  const same =
    existing &&
    existing.resource_id === resourceId &&
    existing.zug_id === zugId &&
    existing.date === block.date &&
    existing.start_min === block.startMin &&
    existing.end_min === block.endMin;
  if (same) {
    if (existing.zweck !== block.title) await db.prepare('UPDATE resource_request SET zweck = ? WHERE id = ?').run(block.title, existing.id);
    return;
  }
  // New or changed: approved right away when an approver plans it and it is free, else open for the Kp Kdt / Log Of.
  const taken = (await occupied(db, wk.batId, block.date, block.startMin, block.endMin, existing?.id ?? -1)).has(resourceId);
  const approve = canDecideRequest(u, wk) && !taken;
  const status = approve ? 'BEWILLIGT' : 'BEANTRAGT';
  const decidedBy = approve ? u.id : null;
  if (existing) {
    await db
      .prepare(
        `UPDATE resource_request SET zug_id = ?, resource_id = ?, kind = ?, category = ?, quantity = 1, persons = 0, date = ?, start_min = ?, end_min = ?,
           zweck = ?, area = NULL, status = ?, assigned_ids = '[]', decided_by = ?, decision_note = '' WHERE id = ?`,
      )
      .run(zugId, resourceId, res.kind, res.category, block.date, block.startMin, block.endMin, block.title, status, decidedBy, existing.id);
    return;
  }
  const { lastInsertRowid } = await db
    .prepare(
      `INSERT INTO resource_request (wk_id, zug_id, block_id, resource_id, kind, category, quantity, persons, date, start_min, end_min, zweck, standort, status, requested_by, decided_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, true, ?, ?, ?)`,
    )
    .run(wk.id, zugId, block.id, resourceId, res.kind, res.category, block.date, block.startMin, block.endMin, block.title, status, u.id, decidedBy);
  await audit(db, u.id, 'request', Number(lastInsertRowid), 'create', { standort: true });
}
