import { normalizeDayDuty } from '../../../shared/ranks';
import { z } from 'zod';
import type { DB } from '../db';
import { audit, tx } from '../db';
import { ensure, HttpError, idParam, parse, user, asyncRouter, langOf } from '../http';
import { createWk } from '../wkService';
import { loadBlock, loadWk, toBlock, toDetail, toGroup, toLocation, toWk, touchWk, zuegeOfKp } from '../repo';
import {
  apEditable,
  canCreateBlock,
  canArchiveWk,
  canCreateWk,
  canEditApStructure,
  canEditBlock,
  canLockBlocks,
  canReopen,
  canReview,
  canSpanZuege,
  canSubmit,
  canUpdateBlock,
  canViewWk,
} from '../../../shared/permissions';
import { BLOCK_TYPES, KDO_ID, type Block, type SessionUser, type Wk } from '../../../shared/types';
import { blockFitsDay, dateRange, defaultDuty, servesOnDay, wkDays } from '../../../shared/util';
import { effectiveTemplate, insertMilestones, openCounts } from '../vorbereitung';
import { syncStandort } from '../standort';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minutes = z.number().int().min(0).max(24 * 60);

const blockInput = z.object({
  date: isoDate,
  startMin: minutes,
  endMin: minutes,
  zugIds: z.array(z.number().int()).min(1),
  title: z.string().trim().min(1).max(200),
  type: z.enum(BLOCK_TYPES),
  locationId: z.number().int().nullable().default(null),
  verantwortlich: z.string().max(200).default(''),
  notes: z.string().max(4000).default(''),
  locked: z.boolean().default(false),
});
type BlockIn = z.infer<typeof blockInput>;

const wkSettings = z.object({
  title: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  dayStart: minutes,
  dayEnd: minutes,
  snapMin: z.number().int().refine((n) => [5, 10, 15, 30, 60].includes(n)),
  avorDays: z.array(isoDate).max(10).default([]),
  kvkDays: z.array(isoDate).max(10).default([]),
  // zugId → duty of the Zug; «zugId.rank» → its Zugführer, Kader or Soldaten; «zugId.g<id>» → one of its Gruppen.
  dayDuty: z.record(isoDate, z.record(z.string().regex(/^\d+(\.(zfhr|kader|sdt|g\d+))?$/), z.enum(['WK', 'KVK', 'AVOR', 'NONE']))).default({}),
});

export function wkRouter(db: DB) {
  const r = asyncRouter();

  const viewWk = async (u: SessionUser, id: number) => {
    const wk = await loadWk(db, id);
    ensure(canViewWk(u, wk));
    return wk;
  };

  /** Validates block geometry against the WK and the Kp's Züge. */
  async function checkBlock(wk: Wk, b: BlockIn) {
    if (b.endMin <= b.startMin) throw new HttpError(400, 'srv.endeMussNachBeginnLiegen');
    if (b.startMin < wk.dayStart || b.endMin > wk.dayEnd) throw new HttpError(400, 'srv.blockLiegtAusserhalbDerTageszeit');
    if (!wkDays(wk).includes(b.date)) throw new HttpError(400, 'srv.datumLiegtAusserhalbDesWk');
    // The Kdo column comes first, then the Züge in their order.
    const order = [KDO_ID, ...(await zuegeOfKp(db, wk.kpId)).map((z) => z.id)];
    const idx = b.zugIds.map((id) => order.indexOf(id)).sort((a, c) => a - c);
    if (idx.some((i) => i < 0)) throw new HttpError(400, 'srv.unbekannterZug');
    if (idx.some((i, k) => k > 0 && i !== idx[k - 1] + 1)) throw new HttpError(400, 'srv.zuegeMuessenNebeneinanderLiegen');
    b.zugIds = idx.map((i) => order[i]);
    // Only Züge serving on that day (AVOR days: Kdo and the Züge added for the day); blocks across several
    // columns (Mittagessen for all …) may cross a Zug without service.
    const off = b.zugIds.filter((id) => !servesOnDay(wk, b.date, id));
    if (!blockFitsDay(wk, b.date, b.zugIds)) {
      const names = (await zuegeOfKp(db, wk.kpId)).filter((z) => off.includes(z.id)).map((z) => z.name);
      throw new HttpError(400, 'srv.noServiceThatDay', undefined, { a: names.join(', ') });
    }
    if (b.locationId != null) {
      const loc = await db.prepare('SELECT 1 FROM location WHERE id = ? AND wk_id = ?').get(b.locationId, wk.id);
      if (!loc) throw new HttpError(400, 'srv.unbekannterStandort');
    }
  }

  async function insertBlock(u: SessionUser, wk: Wk, b: BlockIn): Promise<Block> {
    const source = u.role === 'BAT' ? 'BAT' : 'KP';
    if (source === 'BAT') b.locked = true;
    if (b.locked && source === 'KP' && !canLockBlocks(u)) throw new HttpError(403, 'srv.nurDerKpKdtKann2');
    if (b.zugIds.length > 1 && !canSpanZuege(u)) throw new HttpError(403, 'srv.nurDerKpKdtKann');
    await checkBlock(wk, b);
    ensure(canCreateBlock(u, wk, { ...b, source }));
    const { lastInsertRowid } = await db
      .prepare(
        `INSERT INTO block (wk_id, date, start_min, end_min, zug_ids, title, type, location_id, verantwortlich, notes, locked, source, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        wk.id,
        b.date,
        b.startMin,
        b.endMin,
        JSON.stringify(b.zugIds),
        b.title,
        b.type,
        b.locationId,
        b.verantwortlich,
        b.notes,
        b.locked ? 1 : 0,
        source,
        u.id,
      );
    const block = await loadBlock(db, wk.id, Number(lastInsertRowid));
    await syncStandort(db, u, wk, block);
    return block;
  }

  /** Detail items follow their block: shifted when it moves, clipped when it shrinks. */
  async function syncDetails(before: Block, after: BlockIn) {
    const delta = after.startMin - before.startMin;
    const sameLength = after.endMin - after.startMin === before.endMin - before.startMin;
    if (sameLength && delta !== 0) {
      await db.prepare('UPDATE block_detail SET start_min = start_min + ?, end_min = end_min + ? WHERE block_id = ?').run(delta, delta, before.id);
    } else if (!sameLength) {
      await db.prepare('UPDATE block_detail SET start_min = GREATEST(start_min, ?::int), end_min = LEAST(end_min, ?::int) WHERE block_id = ?').run(
        after.startMin,
        after.endMin,
        before.id,
      );
      await db.prepare('DELETE FROM block_detail WHERE block_id = ? AND end_min <= start_min').run(before.id);
    }
    if (before.zugIds.length === 1 && after.zugIds.length === 1 && before.zugIds[0] !== after.zugIds[0]) {
      // A single-Zug block handed to another Zug takes its detail plan along.
      await db.prepare("UPDATE block_detail SET zug_id = ?, group_ids = '[]' WHERE block_id = ?").run(after.zugIds[0], before.id);
      return;
    }
    const removed = before.zugIds.filter((z) => !after.zugIds.includes(z));
    for (const z of removed) await db.prepare('DELETE FROM block_detail WHERE block_id = ? AND zug_id = ?').run(before.id, z);
  }

  // ---- WK list / create / settings ----

  r.get('/wks', async (req, res) => {
    const u = user(req);
    const rows = (await db
      .prepare(
        `SELECT wk.*, kompanie.bat_id, kompanie.name AS kp_name,
           (SELECT COUNT(*) FROM block WHERE block.wk_id = wk.id) AS block_count
         FROM wk JOIN kompanie ON kompanie.id = wk.kp_id
         WHERE kompanie.bat_id = ? ORDER BY wk.start_date DESC`,
      )
      .all(u.batId)) as any[];
    const today = new Date().toISOString().slice(0, 10);
    res.json(
      await Promise.all(
        rows
          .map((row) => ({ ...toWk(row), kpName: row.kp_name, blockCount: row.block_count }))
          .filter((wk) => canViewWk(u, wk))
          .map(async (wk) => {
            const c = await openCounts(db, wk, u, today);
            return { ...wk, openMilestones: c.open, overdueMilestones: c.overdue };
          }),
      ),
    );
  });

  r.post('/wks', async (req, res) => {
    const u = user(req);
    ensure(canCreateWk(u));
    const b = parse(wkSettings.extend({ kpId: z.number().int() }), req.body);
    const kp = await db.prepare('SELECT * FROM kompanie WHERE id = ? AND bat_id = ?').get(b.kpId, u.batId);
    if (!kp) throw new HttpError(400, 'srv.unbekannteKompanie');
    const id = await createWk(db, u.id, u.batId, b, langOf(req));
    res.status(201).json((await loadWk(db, id)));
  });

  r.get('/wks/:id', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    res.json({
      wk,
      zuege: (await zuegeOfKp(db, wk.kpId)),
      locations: (await db.prepare('SELECT * FROM location WHERE wk_id = ? ORDER BY nr').all(wk.id)).map(toLocation),
      blocks: (await db.prepare('SELECT * FROM block WHERE wk_id = ? ORDER BY date, start_min').all(wk.id)).map(toBlock),
      details: (await db
        .prepare('SELECT block_detail.* FROM block_detail JOIN block ON block.id = block_detail.block_id WHERE block.wk_id = ? ORDER BY start_min')
        .all(wk.id))
        .map(toDetail),
      groups: (await db.prepare('SELECT * FROM zug_group WHERE wk_id = ? ORDER BY zug_id, sort, id').all(wk.id)).map(toGroup),
    });
  });

  r.patch('/wks/:id', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    ensure(canEditApStructure(u, wk) || (u.role === 'BAT' && wk.status !== 'FREIGEGEBEN'));
    const b = parse(wkSettings, { ...wk, ...req.body });
    if (b.endDate < b.startDate || dateRange(b.startDate, b.endDate).length > 21) {
      throw new HttpError(400, 'srv.wkDauerMussZwischenUnd');
    }
    if (b.dayEnd - b.dayStart < 60) throw new HttpError(400, 'srv.tageszeitZuKurz');
    // A day is either AVOR (Kdo) or KVK (all).
    b.kvkDays = [...new Set(b.kvkDays)].filter((d) => !b.avorDays.includes(d)).sort();
    b.avorDays = [...new Set(b.avorDays)].sort();
    const days = wkDays(b);
    const zuegeOfWk = await zuegeOfKp(db, wk.kpId);
    // Keep what differs from the rules (type of the day, ranks after their Zug), for days and Züge of the WK.
    b.dayDuty = normalizeDayDuty(b, b.dayDuty, zuegeOfWk);
    const blocks = (await db.prepare('SELECT date, start_min, end_min, zug_ids FROM block WHERE wk_id = ?').all(wk.id)) as any[];
    const outside = blocks.filter((x) => !days.includes(x.date) || x.start_min < b.dayStart || x.end_min > b.dayEnd).length;
    if (outside > 0) throw new HttpError(409, 'srv.blockBloeckeLaegenAusserhalbDes', undefined, { a: outside });
    const offDuty = blocks.filter((x) => days.includes(x.date) && !blockFitsDay(b, x.date, JSON.parse(x.zug_ids) as number[])).length;
    if (offDuty > 0) throw new HttpError(409, 'srv.blockBloeckeVonZuegenLaegen', undefined, { a: offDuty });
    await db
      .prepare(
        "UPDATE wk SET title = ?, start_date = ?, end_date = ?, day_start = ?, day_end = ?, snap_min = ?, avor_days = ?, kvk_days = ?, day_duty = ?, updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?",
      )
      .run(b.title, b.startDate, b.endDate, b.dayStart, b.dayEnd, b.snapMin, JSON.stringify(b.avorDays), JSON.stringify(b.kvkDays), JSON.stringify(b.dayDuty), wk.id);
    res.json((await loadWk(db, wk.id)));
  });

  // Archive (or restore) a WK: it leaves the lists and becomes read only.
  r.post('/wks/:id/archive', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    ensure(canArchiveWk(u, wk));
    const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
    await db.prepare('UPDATE wk SET archived = ?::int::boolean WHERE id = ?').run(archived, wk.id);
    await audit(db, u.id, 'wk', wk.id, archived ? 'archive' : 'restore');
    res.json(await loadWk(db, wk.id));
  });

  r.delete('/wks/:id', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    ensure(canArchiveWk(u, wk));
    await db.prepare('DELETE FROM wk WHERE id = ?').run(wk.id);
    await audit(db, u.id, 'wk', wk.id, 'delete');
    res.json({ ok: true });
  });

  // ---- Status workflow ----

  const setStatus = async (u: SessionUser, wk: Wk, status: Wk['status'], note: string | null, action: string) => {
    await db.prepare("UPDATE wk SET status = ?, review_note = COALESCE(?, review_note), updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?").run(
      status,
      note,
      wk.id,
    );
    await audit(db, u.id, 'wk', wk.id, action, { from: wk.status, to: status, note });
    return loadWk(db, wk.id);
  };

  r.post('/wks/:id/submit', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    ensure(canSubmit(u, wk));
    res.json((await setStatus(u, wk, 'EINGEREICHT', null, 'submit')));
  });

  r.post('/wks/:id/approve', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    ensure(canReview(u, wk));
    const { note } = parse(z.object({ note: z.string().default('') }), req.body ?? {});
    res.json((await setStatus(u, wk, 'FREIGEGEBEN', note, 'approve')));
  });

  r.post('/wks/:id/reject', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    ensure(canReview(u, wk));
    const { note } = parse(z.object({ note: z.string().min(1, 'srv.begruendungErforderlich') }), req.body ?? {});
    res.json((await setStatus(u, wk, 'ZURUECKGEWIESEN', note, 'reject')));
  });

  r.post('/wks/:id/reopen', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    ensure(canReopen(u, wk));
    res.json((await setStatus(u, wk, 'ENTWURF', null, 'reopen')));
  });

  // ---- Locations (legend) ----

  r.put('/wks/:id/locations', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    ensure(canEditApStructure(u, wk));
    // resourceId: catalogue room or terrain behind the Standort; left out = unchanged.
    const list = parse(
      z.array(
        z.object({
          id: z.number().int().optional(),
          nr: z.number().int().min(0),
          name: z.string().trim().min(1),
          resourceId: z.number().int().nullable().optional(),
        }),
      ),
      req.body,
    );
    for (const l of list) {
      if (l.resourceId == null) continue;
      const res = (await db.prepare('SELECT kind, kp_id, bat_id FROM resource WHERE id = ?').get(l.resourceId)) as any;
      const usable = res && (res.kp_id === wk.kpId || (res.kp_id === null && res.bat_id === wk.batId));
      if (!usable || (res.kind !== 'RAUM' && res.kind !== 'GELAENDE')) throw new HttpError(400, 'srv.standortNurRaeumeUndGelaende');
    }
    await tx(db, async () => {
      const keep = list.filter((l) => l.id).map((l) => l.id!);
      const existing = (await db.prepare('SELECT id, resource_id FROM location WHERE wk_id = ?').all(wk.id)) as { id: number; resource_id: number | null }[];
      // Blocks whose Standort goes away or points to another room: their reservation follows.
      const changed = existing
        .filter((e) => !keep.includes(e.id) || list.some((l) => l.id === e.id && l.resourceId !== undefined && l.resourceId !== e.resource_id))
        .map((e) => e.id);
      const affected = changed.length
        ? ((await db.prepare(`SELECT id FROM block WHERE location_id IN (${changed.map(() => '?').join(', ')})`).all(...changed)) as { id: number }[])
        : [];
      for (const e of existing) if (!keep.includes(e.id)) await db.prepare('DELETE FROM location WHERE id = ?').run(e.id);
      for (const l of list) {
        const prev = existing.find((e) => e.id === l.id);
        const resourceId = l.resourceId !== undefined ? l.resourceId : (prev?.resource_id ?? null);
        if (prev) {
          await db.prepare('UPDATE location SET nr = ?, name = ?, resource_id = ? WHERE id = ?').run(l.nr, l.name, resourceId, prev.id);
        } else {
          await db.prepare('INSERT INTO location (wk_id, nr, name, resource_id) VALUES (?, ?, ?, ?)').run(wk.id, l.nr, l.name, resourceId);
        }
      }
      for (const { id } of affected) await syncStandort(db, u, wk, await loadBlock(db, wk.id, id));
      await touchWk(db, wk.id);
    });
    res.json((await db.prepare('SELECT * FROM location WHERE wk_id = ? ORDER BY nr').all(wk.id)).map(toLocation));
  });

  // ---- Blocks ----

  r.post('/wks/:id/blocks', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    const b = parse(blockInput, req.body);
    const block = await insertBlock(u, wk, b);
    await touchWk(db, wk.id);
    res.status(201).json(block);
  });

  /** Create several blocks at once (Standardtag, templates); all or nothing. */
  r.post('/wks/:id/blocks/bulk', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    const list = parse(z.array(blockInput).max(500), req.body);
    const created = await tx(db, async () => {
      const out = [];
      for (const b of list) out.push(await insertBlock(u, wk, b));
      return out;
    });
    await touchWk(db, wk.id);
    res.status(201).json(created);
  });

  r.patch('/wks/:id/blocks/:blockId', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    const before = await loadBlock(db, wk.id, idParam(req, 'blockId'));
    const { version, ...patch } = parse(blockInput.partial().extend({ version: z.number().int() }), req.body);
    if (version !== before.version) {
      throw new HttpError(409, 'srv.derBlockWurdeInzwischenVon', { current: before });
    }
    ensure(canEditBlock(u, wk, before));
    const after: BlockIn = { ...before, ...patch };
    if (before.source === 'BAT') after.locked = true;
    if (after.locked !== before.locked && !canLockBlocks(u)) throw new HttpError(403, 'srv.nurDerKpKdtKann2');
    if (after.zugIds.length > 1 && !canSpanZuege(u)) throw new HttpError(403, 'srv.nurDerKpKdtKann');
    await checkBlock(wk, after);
    ensure(canUpdateBlock(u, wk, before, { ...after, source: before.source }));
    await db.prepare(
      `UPDATE block SET date = ?, start_min = ?, end_min = ?, zug_ids = ?, title = ?, type = ?, location_id = ?,
         verantwortlich = ?, notes = ?, locked = ?, version = version + 1, updated_by = ? WHERE id = ?`,
    ).run(
      after.date,
      after.startMin,
      after.endMin,
      JSON.stringify(after.zugIds),
      after.title,
      after.type,
      after.locationId,
      after.verantwortlich,
      after.notes,
      after.locked ? 1 : 0,
      u.id,
      before.id,
    );
    await syncDetails(before, after);
    const saved = await loadBlock(db, wk.id, before.id);
    await syncStandort(db, u, wk, saved);
    await touchWk(db, wk.id);
    res.json(saved);
  });

  r.delete('/wks/:id/blocks/:blockId', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    const block = await loadBlock(db, wk.id, idParam(req, 'blockId'));
    ensure(canEditBlock(u, wk, block));
    // The Standort is no longer needed; other requests of the block stay (without block).
    await db.prepare('DELETE FROM resource_request WHERE block_id = ? AND standort').run(block.id);
    await db.prepare('DELETE FROM block WHERE id = ?').run(block.id);
    await audit(db, u.id, 'block', block.id, 'delete', block);
    await touchWk(db, wk.id);
    res.json({ ok: true });
  });

  /** Copy all Kp blocks of another WK of the same Kp, shifted to this WK's start date. */
  r.post('/wks/:id/copy-from/:srcId', async (req, res) => {
    const u = user(req);
    const wk = await viewWk(u, idParam(req));
    const src = await viewWk(u, idParam(req, 'srcId'));
    ensure(canEditApStructure(u, wk) && apEditable(wk));
    if (src.kpId !== wk.kpId || src.id === wk.id) throw new HttpError(400, 'srv.nurWksDerselbenKompanieKoennen');
    const days = dateRange(wk.startDate, wk.endDate);
    const srcDays = dateRange(src.startDate, src.endDate);
    const blocks = (await db
      .prepare("SELECT * FROM block WHERE wk_id = ? AND source = 'KP'")
      .all(src.id))
      .map(toBlock)
      .filter((b) => srcDays.indexOf(b.date) < days.length && b.startMin >= wk.dayStart && b.endMin <= wk.dayEnd);
    const created = await tx(db, async () => {
      // Locations are copied by number.
      const srcLocs = (await db.prepare('SELECT * FROM location WHERE wk_id = ?').all(src.id)).map(toLocation);
      const locMap = new Map<number, number>();
      for (const l of srcLocs) {
        const existing = (await db.prepare('SELECT id FROM location WHERE wk_id = ? AND nr = ?').get(wk.id, l.nr)) as any;
        const id = existing
          ? existing.id
          : Number((await db.prepare('INSERT INTO location (wk_id, nr, name, resource_id) VALUES (?, ?, ?, ?)').run(wk.id, l.nr, l.name, l.resourceId)).lastInsertRowid);
        locMap.set(l.id, id);
      }
      const out = [];
      for (const b of blocks) {
        out.push(
          await insertBlock(u, wk, {
            ...b,
            date: days[srcDays.indexOf(b.date)],
            locationId: b.locationId != null ? (locMap.get(b.locationId) ?? null) : null,
          }),
        );
      }
      return out;
    });
    await touchWk(db, wk.id);
    res.status(201).json({ created: created.length });
  });

  return r;
}
