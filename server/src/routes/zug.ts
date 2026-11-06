// Zugansicht: Detailplanung inside Grobprogramm blocks and Ausbildungsvorbereitungen.
import { z } from 'zod';
import type { DB } from '../db';
import { audit, tx } from '../db';
import { ensure, HttpError, idParam, parse, user, asyncRouter } from '../http';
import { loadBlock, loadWk, toAv, toDetail, toGroup, zuegeOfKp } from '../repo';
import { canCreateAv, canEditAv, canEditDetails, canViewAv, canViewLibrary, canViewWk } from '../../../shared/permissions';
import { KDO_ID, type LibraryEntry, type MyAusbildung } from '../../../shared/types';
import { normalizeAv } from '../../../shared/av';

const minutes = z.number().int().min(0).max(24 * 60);
const time = z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/)]);

const detailInput = z.object({
  startMin: minutes,
  endMin: minutes,
  title: z.string().trim().min(1).max(300),
  verantwortlich: z.string().max(100).default(''),
  groupIds: z.array(z.number().int()).max(20).default([]),
});

const avInput = z.object({
  blockId: z.number().int().nullable(),
  zugId: z.number().int(),
  ausbildungsart: z.string().default(''),
  thema: z.string().trim().min(1, 'srv.themaErforderlich'),
  fachbereiche: z.array(z.enum(['BETREUUNG', 'FU', 'PIONIER', 'KGS'])).max(4).default([]),
  datum: z.string().default(''),
  zeitVon: time.default(''),
  zeitBis: time.default(''),
  zeit: z.string().default(''),
  teilnehmer: z.string().default(''),
  arbeitsplatz: z.string().default(''),
  leiter: z.string().default(''),
  leiterUserIds: z.array(z.number().int()).max(12).default([]),
  grundlagen: z.string().default(''),
  stufe: z.enum(['', 'ANLERNEN', 'FESTIGEN', 'ANWENDEN']).default(''),
  zielsetzungen: z.array(z.string()).default([]),
  persAusruestung: z.string().default(''),
  postenplakat: z.string().default(''),
  fahrzeug: z.string().default(''),
  material: z.string().default(''),
  unterlagen: z.string().default(''),
  bemerkungen: z.string().default(''),
  controlling: z.string().default(''),
  ablauf: z
    .array(z.object({ dauer: z.number().int().min(0).max(1440).default(0), phase: z.enum(['', 'P', 'I', 'T1', 'T2']), text: z.string() }))
    .max(60)
    .default([]),
});

const AV_SELECT =
  'SELECT ausbildungsvorbereitung.*, app_user.name AS created_by_name, (SELECT COUNT(*) FROM attachment a WHERE a.av_id = ausbildungsvorbereitung.id) AS attachment_count FROM ausbildungsvorbereitung JOIN app_user ON app_user.id = created_by';

export function zugRouter(db: DB) {
  const r = asyncRouter();

  // ---- Gruppen and Detailplanung ----

  const groupsOf = async (wkId: number, zugId: number) =>
    (await db.prepare('SELECT * FROM zug_group WHERE wk_id = ? AND zug_id = ? ORDER BY sort, id').all(wkId, zugId)).map(toGroup);

  /** Replace the groups of a Zug in this WK (ids keep existing groups, new ones are created). */
  r.put('/wks/:id/zuege/:zugId/groups', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const zugId = idParam(req, 'zugId');
    ensure(canEditDetails(u, wk, zugId));
    if (!(await zuegeOfKp(db, wk.kpId)).some((z) => z.id === zugId)) throw new HttpError(404, 'srv.zugNichtGefunden');
    const list = parse(z.array(z.object({ id: z.number().int().optional(), name: z.string().trim().min(1).max(40) })).max(12), req.body);
    const saved = await tx(db, async () => {
      const existing = (await groupsOf(wk.id, zugId)).map((g) => g.id);
      const keep = list.filter((g) => g.id && existing.includes(g.id)).map((g) => g.id!);
      const removed = existing.filter((id) => !keep.includes(id));
      for (const id of removed) await db.prepare('DELETE FROM zug_group WHERE id = ?').run(id);
      for (const [i, g] of list.entries()) {
        if (g.id && keep.includes(g.id)) await db.prepare('UPDATE zug_group SET name = ?, sort = ? WHERE id = ?').run(g.name, i, g.id);
        else await db.prepare('INSERT INTO zug_group (wk_id, zug_id, name, sort) VALUES (?, ?, ?, ?)').run(wk.id, zugId, g.name, i);
      }
      if (removed.length) {
        // Sequences of removed groups: drop the group; sequences left without any group are deleted.
        const rows = (await db
          .prepare('SELECT d.* FROM block_detail d JOIN block b ON b.id = d.block_id WHERE b.wk_id = ? AND d.zug_id = ?')
          .all(wk.id, zugId))
          .map(toDetail);
        for (const d of rows) {
          if (!d.groupIds.some((g) => removed.includes(g))) continue;
          const rest = d.groupIds.filter((g) => !removed.includes(g));
          if (rest.length) await db.prepare('UPDATE block_detail SET group_ids = ? WHERE id = ?').run(JSON.stringify(rest), d.id);
          else await db.prepare('DELETE FROM block_detail WHERE id = ?').run(d.id);
        }
      }
      return groupsOf(wk.id, zugId);
    });
    res.json(saved);
  });

  /** Replace the detail items of one block for one Zug. */
  r.put('/wks/:id/blocks/:blockId/details/:zugId', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const block = await loadBlock(db, wk.id, idParam(req, 'blockId'));
    const zugId = idParam(req, 'zugId');
    ensure(canEditDetails(u, wk, zugId));
    if (!block.zugIds.includes(zugId)) throw new HttpError(400, 'srv.derBlockGehoertNichtZu');
    const list = parse(z.array(detailInput).max(120), req.body);
    const groupIds = (await groupsOf(wk.id, zugId)).map((g) => g.id);
    for (const d of list) {
      if (d.groupIds.some((g) => !groupIds.includes(g))) throw new HttpError(400, 'srv.unbekannteGruppe', undefined, { a: d.title });
      // All groups selected is the same as the whole Zug.
      d.groupIds = groupIds.length && groupIds.every((g) => d.groupIds.includes(g)) ? [] : [...new Set(d.groupIds)];
      if (d.endMin <= d.startMin) throw new HttpError(400, 'srv.endeMussNachBeginnLiegen2', undefined, { a: d.title });
      if (d.startMin < block.startMin || d.endMin > block.endMin) {
        throw new HttpError(400, 'srv.liegtAusserhalbDesZeitfenstersDes', undefined, { a: d.title });
      }
    }
    const saved = await tx(db, async () => {
      await db.prepare('DELETE FROM block_detail WHERE block_id = ? AND zug_id = ?').run(block.id, zugId);
      const ins = db.prepare(
        'INSERT INTO block_detail (block_id, zug_id, start_min, end_min, title, verantwortlich, group_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const d of list) await ins.run(block.id, zugId, d.startMin, d.endMin, d.title, d.verantwortlich, JSON.stringify(d.groupIds));
      return (await db.prepare('SELECT * FROM block_detail WHERE block_id = ? AND zug_id = ? ORDER BY start_min').all(block.id, zugId)).map(toDetail);
    });
    res.json(saved);
  });

  // ---- Ausbildungsvorbereitung ----

  const loadAv = async (wkId: number, id: number) => {
    const row = await db.prepare(`${AV_SELECT} WHERE ausbildungsvorbereitung.id = ? AND wk_id = ?`).get(id, wkId);
    if (!row) throw new HttpError(404, 'srv.ausbildungsvorbereitungNichtGefunden');
    return toAv(row);
  };

  const checkAvTarget = async (wkId: number, b: z.infer<typeof avInput>) => {
    const kp = ((await db.prepare('SELECT kp_id FROM wk WHERE id = ?').get(wkId)) as any).kp_id;
    for (const id of b.leiterUserIds) {
      if (!(await db.prepare('SELECT 1 FROM app_user WHERE id = ? AND kp_id = ?').get(id, kp))) throw new HttpError(400, 'srv.zugeteiltePersonGehoertNichtZur');
    }
    b.leiterUserIds = [...new Set(b.leiterUserIds)];
    if (b.zugId === KDO_ID) throw new HttpError(400, 'srv.ausbildungsvorbereitungenGehoerenZuEinemZug');
    if (b.blockId != null && !(await loadBlock(db, wkId, b.blockId)).zugIds.includes(b.zugId)) {
      throw new HttpError(400, 'srv.derBlockGehoertNichtZu');
    }
  };

  const dataOf = (b: z.infer<typeof avInput>) => {
    const { blockId: _b, zugId: _z, ...data } = b;
    return JSON.stringify(normalizeAv(data));
  };

  r.get('/wks/:id/avs', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(u, wk));
    const list = (await db
      .prepare(`${AV_SELECT} WHERE wk_id = ? ORDER BY ausbildungsvorbereitung.id`)
      .all(wk.id))
      .map(toAv)
      .filter((av) => canViewAv(u, wk, av));
    res.json(list);
  });

  /** Library: all Ausbildungsvorbereitungen of the user's Bataillon, newest WK first. */
  r.get('/library', async (req, res) => {
    const u = user(req);
    ensure(canViewLibrary(u));
    const rows = (await db
      .prepare(
        `${AV_SELECT.replace('FROM ausbildungsvorbereitung', ', wk.title AS wk_title, wk.start_date AS wk_start, k.id AS kp_id, k.name AS kp_name, zug.name AS zug_name FROM ausbildungsvorbereitung')}
         JOIN wk ON wk.id = ausbildungsvorbereitung.wk_id JOIN zug ON zug.id = ausbildungsvorbereitung.zug_id JOIN kompanie k ON k.id = zug.kp_id
         WHERE k.bat_id = ? ORDER BY wk.start_date DESC, ausbildungsvorbereitung.id`,
      )
      .all(u.batId)) as any[];
    const list: LibraryEntry[] = rows.map((row) => ({
      av: toAv(row),
      wkTitle: row.wk_title,
      wkStart: row.wk_start,
      kpId: row.kp_id,
      kpName: row.kp_name,
      zugName: row.zug_name,
    }));
    res.json(list);
  });

  /** All Ausbildungsvorbereitungen of the user across WKs: assigned or own; for Zugführer also the rest of the Zug. */
  r.get('/me/ausbildungen', async (req, res) => {
    const u = user(req);
    const rows = (await db
      .prepare(
        `${AV_SELECT.replace('FROM ausbildungsvorbereitung', ', wk.title AS wk_title, zug.name AS zug_name FROM ausbildungsvorbereitung')}
         JOIN wk ON wk.id = ausbildungsvorbereitung.wk_id JOIN zug ON zug.id = ausbildungsvorbereitung.zug_id
         WHERE zug.kp_id = ?`,
      )
      .all(u.kpId ?? -1)) as any[];
    const wks = new Map<number, Awaited<ReturnType<typeof loadWk>>>();
    for (const id of new Set(rows.map((row) => row.wk_id as number))) wks.set(id, await loadWk(db, id));
    const list: MyAusbildung[] = rows
      .map((row) => ({ av: toAv(row), wkTitle: row.wk_title as string, zugName: row.zug_name as string, wk: wks.get(row.wk_id)! }))
      .filter(({ av, wk }) => canViewAv(u, wk, av))
      .map(({ av, wkTitle, zugName }) => ({ av, wkTitle, zugName, mine: av.leiterUserIds.includes(u.id) || av.createdBy === u.id }))
      .filter((x) => x.mine || (u.role === 'ZFHR' && u.zugId === x.av.zugId))
      .sort((a, b) => (a.av.datum || '9').localeCompare(b.av.datum || '9') || a.av.zeitVon.localeCompare(b.av.zeitVon));
    res.json(list);
  });

  r.get('/wks/:id/avs/:avId', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const av = await loadAv(wk.id, idParam(req, 'avId'));
    ensure(canViewAv(u, wk, av));
    res.json(av);
  });

  r.post('/wks/:id/avs', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const b = parse(avInput, req.body);
    ensure(canCreateAv(u, wk, b.zugId));
    await checkAvTarget(wk.id, b);
    const { lastInsertRowid } = await db
      .prepare('INSERT INTO ausbildungsvorbereitung (wk_id, block_id, zug_id, created_by, data) VALUES (?, ?, ?, ?, ?)')
      .run(wk.id, b.blockId, b.zugId, u.id, dataOf(b));
    await audit(db, u.id, 'av', Number(lastInsertRowid), 'create');
    res.status(201).json((await loadAv(wk.id, Number(lastInsertRowid))));
  });

  r.put('/wks/:id/avs/:avId', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const av = await loadAv(wk.id, idParam(req, 'avId'));
    ensure(canEditAv(u, wk, av));
    const b = parse(avInput, req.body);
    // The Zug of an existing document cannot change.
    b.zugId = av.zugId;
    await checkAvTarget(wk.id, b);
    await db.prepare("UPDATE ausbildungsvorbereitung SET block_id = ?, data = ?, updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?").run(b.blockId, dataOf(b), av.id);
    res.json((await loadAv(wk.id, av.id)));
  });

  r.delete('/wks/:id/avs/:avId', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const av = await loadAv(wk.id, idParam(req, 'avId'));
    ensure(canEditAv(u, wk, av));
    await db.prepare('DELETE FROM ausbildungsvorbereitung WHERE id = ?').run(av.id);
    await audit(db, u.id, 'av', av.id, 'delete');
    res.json({ ok: true });
  });

  return r;
}
