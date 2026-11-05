import { z } from 'zod';
import type { DB } from '../db';
import { audit, tx } from '../db';
import { ensure, HttpError, idParam, parse, user, asyncRouter } from '../http';
import { loadWk, toBat, toKp } from '../repo';
import { canEditMilestones, canEditStandardBlocks, canEditTemplates, canTickMilestone, canViewMilestones, canViewTemplate } from '../../../shared/permissions';
import { effectiveTemplate, insertMilestones, milestonesFor, saveTemplate } from '../vorbereitung';
import { BLOCK_TYPES, type StandardBlock } from '../../../shared/types';
import { DEFAULT_STANDARD_BLOCKS } from '../../../shared/util';

const role = z.enum(['BAT', 'KPKDT', 'LOGOF', 'ZFHR', 'KADER']);

const milestoneInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(2000).default(''),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ownerRole: role,
});

const standardBlocks = z
  .array(
    z
      .object({
        title: z.string().trim().min(1).max(200),
        type: z.enum(BLOCK_TYPES),
        startMin: z.number().int().min(0).max(1440),
        endMin: z.number().int().min(0).max(1440),
        scope: z.enum(['ALLE', 'ZUEGE', 'KDO']),
        locked: z.boolean().default(false),
      })
      .refine((b) => b.endMin > b.startMin, 'Ende muss nach Beginn liegen'),
  )
  .max(30);

const templateItems = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(300),
      description: z.string().max(2000).default(''),
      daysBefore: z.number().int().min(-365).max(1000),
      ownerRole: role,
    }),
  )
  .max(100);

export function vorbereitungRouter(db: DB) {
  const r = asyncRouter();

  // ---- Standardblöcke of a Kp (inserted into the Arbeitsprogramm) ----

  const kpOf = async (id: number) => {
    const kp = (await db.prepare('SELECT id, bat_id FROM kompanie WHERE id = ?').get(id)) as any;
    if (!kp) throw new HttpError(404, 'Kompanie nicht gefunden');
    return { id: kp.id as number, batId: kp.bat_id as number };
  };

  r.get('/kompanien/:kpId/standardbloecke', async (req, res) => {
    const u = user(req);
    const kp = await kpOf(idParam(req, 'kpId'));
    ensure(u.kpId === kp.id || canEditStandardBlocks(u, kp));
    const rows = (await db.prepare('SELECT * FROM standard_block WHERE kp_id = ? ORDER BY sort, id').all(kp.id)) as any[];
    const items: StandardBlock[] = rows.map((x) => ({ title: x.title, type: x.type, startMin: x.start_min, endMin: x.end_min, scope: x.scope, locked: !!x.locked }));
    res.json({ source: rows.length ? 'KP' : 'DEFAULT', items: rows.length ? items : DEFAULT_STANDARD_BLOCKS });
  });

  r.put('/kompanien/:kpId/standardbloecke', async (req, res) => {
    const u = user(req);
    const kp = await kpOf(idParam(req, 'kpId'));
    ensure(canEditStandardBlocks(u, kp));
    const items = parse(standardBlocks, req.body);
    await tx(db, async () => {
      await db.prepare('DELETE FROM standard_block WHERE kp_id = ?').run(kp.id);
      const ins = db.prepare('INSERT INTO standard_block (kp_id, sort, title, type, start_min, end_min, scope, locked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const [i, b] of items.entries()) await ins.run(kp.id, i, b.title, b.type, b.startMin, b.endMin, b.scope, b.locked ? 1 : 0);
      await audit(db, u.id, 'standard_block', kp.id, 'save', { count: items.length });
    });
    res.json({ source: 'KP', items });
  });

  const loadMilestone = async (wkId: number, id: number) => {
    const row = (await db.prepare('SELECT * FROM milestone WHERE id = ? AND wk_id = ?').get(id, wkId)) as any;
    if (!row) throw new HttpError(404, 'Eintrag nicht gefunden');
    return { id: row.id as number, ownerRole: row.owner_role };
  };

  // ---- Vorbereitung of a WK ----

  r.get('/wks/:id/milestones', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewMilestones(u, wk));
    res.json((await milestonesFor(db, wk, u)));
  });

  /** Tick off (or reopen) an item for oneself. */
  r.post('/wks/:id/milestones/:mid/done', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const m = await loadMilestone(wk.id, idParam(req, 'mid'));
    ensure(canTickMilestone(u, wk, m));
    const { done } = parse(z.object({ done: z.boolean() }), req.body);
    if (done) await db.prepare('INSERT INTO milestone_done (milestone_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(m.id, u.id);
    else await db.prepare('DELETE FROM milestone_done WHERE milestone_id = ? AND user_id = ?').run(m.id, u.id);
    res.json((await milestonesFor(db, wk, u)).find((x) => x.id === m.id));
  });

  r.post('/wks/:id/milestones', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canEditMilestones(u, wk));
    const b = parse(milestoneInput, req.body);
    const { lastInsertRowid } = await db
      .prepare('INSERT INTO milestone (wk_id, title, description, due_date, owner_role) VALUES (?, ?, ?, ?, ?)')
      .run(wk.id, b.title, b.description, b.dueDate, b.ownerRole);
    res.status(201).json((await milestonesFor(db, wk, u)).find((x) => x.id === Number(lastInsertRowid)));
  });

  r.patch('/wks/:id/milestones/:mid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canEditMilestones(u, wk));
    const m = await loadMilestone(wk.id, idParam(req, 'mid'));
    const b = parse(milestoneInput.partial(), req.body);
    const cur = (await db.prepare('SELECT * FROM milestone WHERE id = ?').get(m.id)) as any;
    await db.prepare('UPDATE milestone SET title = ?, description = ?, due_date = ?, owner_role = ? WHERE id = ?').run(
      b.title ?? cur.title,
      b.description ?? cur.description,
      b.dueDate ?? cur.due_date,
      b.ownerRole ?? cur.owner_role,
      m.id,
    );
    // A different owner role means different people have to complete it.
    if (b.ownerRole && b.ownerRole !== cur.owner_role) await db.prepare('DELETE FROM milestone_done WHERE milestone_id = ?').run(m.id);
    res.json((await milestonesFor(db, wk, u)).find((x) => x.id === m.id));
  });

  r.delete('/wks/:id/milestones/:mid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canEditMilestones(u, wk));
    const m = await loadMilestone(wk.id, idParam(req, 'mid'));
    await db.prepare('DELETE FROM milestone WHERE id = ?').run(m.id);
    res.json({ ok: true });
  });

  /** Add the items of the current template that the WK does not have yet (matched by title). */
  r.post('/wks/:id/milestones/apply-template', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canEditMilestones(u, wk));
    const existing = new Set(((await db.prepare('SELECT title FROM milestone WHERE wk_id = ?').all(wk.id)) as any[]).map((x) => x.title));
    const missing = (await effectiveTemplate(db, wk.batId, wk.kpId)).items.filter((it) => !existing.has(it.title));
    await insertMilestones(db, wk.id, wk.startDate, missing);
    res.json({ added: missing.length });
  });

  // ---- Templates (Org Admin) ----

  /** Bataillone and Kompanien with the source of their template. */
  r.get('/admin/org', async (req, res) => {
    const u = user(req);
    const bats = ((await db.prepare('SELECT * FROM bataillon ORDER BY name').all()) as any[]).filter((b) => canEditTemplates(u, b.id));
    ensure(bats.length > 0);
    res.json(
      await Promise.all(
        bats.map(async (b) => ({
          ...toBat(b),
          source: (await effectiveTemplate(db, b.id, null)).source,
          kompanien: await Promise.all(
            (await db.prepare('SELECT * FROM kompanie WHERE bat_id = ? ORDER BY name').all(b.id))
              .map(toKp)
              .map(async (k) => ({ ...k, source: (await effectiveTemplate(db, b.id, k.id)).source })),
          ),
        })),
      ),
    );
  });

  const scope = async (q: Record<string, unknown>) => {
    const batId = Number(q.batId);
    const kpId = q.kpId ? Number(q.kpId) : null;
    if (!Number.isInteger(batId)) throw new HttpError(400, 'batId erforderlich');
    if (kpId !== null && !(await db.prepare('SELECT 1 FROM kompanie WHERE id = ? AND bat_id = ?').get(kpId, batId))) {
      throw new HttpError(400, 'Kompanie gehört nicht zum Bataillon');
    }
    return { batId, kpId };
  };

  r.get('/templates', async (req, res) => {
    const u = user(req);
    const { batId, kpId } = await scope(req.query);
    ensure(canViewTemplate(u, batId, kpId));
    res.json((await effectiveTemplate(db, batId, kpId)));
  });

  r.put('/templates', async (req, res) => {
    const u = user(req);
    const { batId, kpId } = await scope(req.query);
    ensure(canEditTemplates(u, batId));
    const items = parse(templateItems, req.body);
    await tx(db, () => saveTemplate(db, batId, kpId, items));
    await audit(db, u.id, 'template', kpId ?? batId, 'save', { batId, kpId, count: items.length });
    res.json((await effectiveTemplate(db, batId, kpId)));
  });

  /** Remove an own template: a Kp falls back to its Bat, a Bat to the built-in default. */
  r.delete('/templates', async (req, res) => {
    const u = user(req);
    const { batId, kpId } = await scope(req.query);
    ensure(canEditTemplates(u, batId));
    await tx(db, () => saveTemplate(db, batId, kpId, []));
    res.json((await effectiveTemplate(db, batId, kpId)));
  });

  return r;
}
