// Rapporte (protocol along the schema of the Handbuch) and Pendenzen.
import { z } from 'zod';
import type { DB } from '../db';
import { audit } from '../db';
import { ensure, HttpError, idParam, langOf, parse, user, asyncRouter } from '../http';
import { loadBlock, loadWk, zuegeOfKp } from '../repo';
import { canAssignPendenz, canCreateRapport, canEditRapport, canTickPendenz, canViewRapport, canViewWk } from '../../../shared/permissions';
import type { Pendenz, Rapport, SessionUser, Wk } from '../../../shared/types';
import { traktandenOf } from '../../../shared/rapport';
import { fmtTime } from '../../../shared/util';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.enum(['AUSB_VORB', 'AUSB_DURCH', 'EINSATZ_VOR', 'EINSATZ_WAEHREND', 'BEFEHL', 'FREI']);
const traktandum = z.object({
  key: z.string().min(1).max(40),
  title: z.string().trim().max(200),
  hint: z.string().max(500).default(''),
  notes: z.string().max(20000).default(''),
});

const rapportInput = z.object({
  zugId: z.number().int().nullable(),
  blockId: z.number().int().nullable().default(null),
  title: z.string().trim().min(1, 'srv.titelErforderlich').max(200),
  schema,
  date,
  startMin: z.number().int().min(0).max(1440).nullable().default(null),
  ort: z.string().max(200).default(''),
  leitungUserId: z.number().int().nullable().default(null),
  protokollUserId: z.number().int().nullable().default(null),
  teilnehmerIds: z.array(z.number().int()).max(200).default([]),
  abwesend: z.string().max(2000).default(''),
  gaeste: z.string().max(2000).default(''),
  traktanden: z.array(traktandum).max(60).optional(),
  status: z.enum(['OFFEN', 'ABGESCHLOSSEN']).default('OFFEN'),
});

const createInput = rapportInput.partial({ title: true, date: true, schema: true }).extend({
  /** Follow-up Rapport: takes over participants, place and schema. */
  fromRapportId: z.number().int().optional(),
});

const pendenzInput = z.object({
  rapportId: z.number().int().nullable().default(null),
  traktandumKey: z.string().max(40).nullable().default(null),
  zugId: z.number().int().nullable().default(null),
  text: z.string().trim().min(1, 'srv.textErforderlich').max(2000),
  responsibleUserId: z.number().int().nullable().default(null),
  dueDate: z.union([z.literal(''), date]).default(''),
});

const toRapport = (r: any): Rapport => ({
  id: r.id,
  wkId: r.wk_id,
  zugId: r.zug_id,
  blockId: r.block_id,
  title: r.title,
  schema: r.schema,
  date: r.date,
  startMin: r.start_min,
  ort: r.ort,
  leitungUserId: r.leitung_user_id,
  protokollUserId: r.protokoll_user_id,
  teilnehmerIds: JSON.parse(r.teilnehmer_ids || '[]'),
  abwesend: r.abwesend,
  gaeste: r.gaeste,
  traktanden: JSON.parse(r.traktanden || '[]'),
  status: r.status,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
});

const toPendenz = (r: any): Pendenz => ({
  id: r.id,
  wkId: r.wk_id,
  rapportId: r.rapport_id,
  traktandumKey: r.traktandum_key,
  zugId: r.zug_id,
  text: r.text,
  responsibleUserId: r.responsible_user_id,
  responsibleName: r.responsible_name ?? '',
  dueDate: r.due_date,
  done: !!r.done_at,
  doneAt: r.done_at,
  doneByName: r.done_by_name ?? '',
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const PENDENZ_SELECT = `SELECT p.*, ru.name AS responsible_name, du.name AS done_by_name FROM pendenz p
  LEFT JOIN app_user ru ON ru.id = p.responsible_user_id LEFT JOIN app_user du ON du.id = p.done_by`;

export function rapportRouter(db: DB) {
  const r = asyncRouter();

  const loadRapport = async (wk: Wk, id: number) => {
    const row = await db.prepare('SELECT * FROM rapport WHERE id = ? AND wk_id = ?').get(id, wk.id);
    if (!row) throw new HttpError(404, 'srv.rapportNichtGefunden');
    return toRapport(row);
  };
  const loadPendenz = async (wk: Wk, id: number) => {
    const row = await db.prepare(`${PENDENZ_SELECT} WHERE p.id = ? AND p.wk_id = ?`).get(id, wk.id);
    if (!row) throw new HttpError(404, 'srv.pendenzNichtGefunden');
    return toPendenz(row);
  };
  const checkZug = async (wk: Wk, zugId: number | null) => {
    if (zugId !== null && !(await zuegeOfKp(db, wk.kpId)).some((z) => z.id === zugId)) throw new HttpError(400, 'srv.unbekannterZug');
  };
  /** People of the Bataillon only. */
  const checkUsers = async (wk: Wk, ids: (number | null)[]) => {
    const known = new Set(((await db.prepare('SELECT id FROM app_user WHERE bat_id = ?').all(wk.batId)) as any[]).map((x) => x.id));
    if (ids.some((id) => id !== null && !known.has(id))) throw new HttpError(400, 'srv.unbekanntePerson');
  };
  /** Who may change a Pendenz: editors of its Rapport; without Rapport the Kp Kdt, the Zfhr of the Zug and who created it. */
  const canEditPendenz = async (u: SessionUser, wk: Wk, p: Pick<Pendenz, 'rapportId' | 'zugId' | 'createdBy'>) => {
    if (p.rapportId !== null) {
      const rap = await db.prepare('SELECT * FROM rapport WHERE id = ?').get(p.rapportId);
      if (rap) return canEditRapport(u, wk, toRapport(rap));
    }
    return canCreateRapport(u, wk, p.zugId) || (canViewWk(u, wk) && p.createdBy === u.id);
  };

  // ---- Rapporte ----

  r.get('/wks/:id/rapporte', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(u, wk));
    const list = ((await db.prepare('SELECT * FROM rapport WHERE wk_id = ? ORDER BY date, start_min, id').all(wk.id)) as any[]).map(toRapport);
    res.json(list.filter((x) => canViewRapport(u, wk, x)));
  });

  r.get('/wks/:id/rapporte/:rid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const rap = await loadRapport(wk, idParam(req, 'rid'));
    ensure(canViewRapport(u, wk, rap));
    res.json(rap);
  });

  r.post('/wks/:id/rapporte', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const b = parse(createInput, req.body);
    ensure(canCreateRapport(u, wk, b.zugId));
    await checkZug(wk, b.zugId);
    const from = b.fromRapportId ? (await loadRapport(wk, b.fromRapportId)) : null;
    if (from) ensure(canViewRapport(u, wk, from));
    const block = b.blockId ? (await loadBlock(db, wk.id, b.blockId)) : null;
    const sch = b.schema ?? from?.schema ?? 'AUSB_DURCH';
    const dateOf = b.date ?? block?.date;
    if (!dateOf) throw new HttpError(400, 'srv.datumErforderlich');
    const title = b.title ?? block?.title ?? 'Rapport';
    const leitung = b.leitungUserId ?? from?.leitungUserId ?? u.id;
    const teilnehmer = b.teilnehmerIds?.length ? b.teilnehmerIds : (from?.teilnehmerIds ?? []);
    await checkUsers(wk, [leitung, b.protokollUserId ?? null, ...teilnehmer]);
    const id = Number(
      (await db
        .prepare(
          `INSERT INTO rapport (wk_id, zug_id, block_id, title, schema, date, start_min, ort, leitung_user_id, protokoll_user_id, teilnehmer_ids, traktanden, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          wk.id,
          b.zugId,
          block?.id ?? null,
          title,
          sch,
          dateOf,
          b.startMin ?? block?.startMin ?? null,
          b.ort || from?.ort || '',
          leitung,
          b.protokollUserId ?? from?.protokollUserId ?? null,
          JSON.stringify(teilnehmer),
          JSON.stringify(b.traktanden ?? traktandenOf(sch, langOf(req))),
          u.id,
        )).lastInsertRowid,
    );
    await audit(db, u.id, 'rapport', id, 'create');
    res.status(201).json((await loadRapport(wk, id)));
  });

  r.put('/wks/:id/rapporte/:rid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const rap = await loadRapport(wk, idParam(req, 'rid'));
    ensure(canEditRapport(u, wk, rap));
    const b = parse(rapportInput, req.body);
    if (rap.status === 'ABGESCHLOSSEN' && b.status === 'ABGESCHLOSSEN') throw new HttpError(409, 'srv.derRapportIstAbgeschlossenZuerst');
    if (b.zugId !== rap.zugId) ensure(canCreateRapport(u, wk, b.zugId));
    await checkZug(wk, b.zugId);
    await checkUsers(wk, [b.leitungUserId, b.protokollUserId, ...b.teilnehmerIds]);
    await db.prepare(
      `UPDATE rapport SET zug_id = ?, block_id = ?, title = ?, schema = ?, date = ?, start_min = ?, ort = ?, leitung_user_id = ?, protokoll_user_id = ?,
       teilnehmer_ids = ?, abwesend = ?, gaeste = ?, traktanden = ?, status = ?, updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
    ).run(
      b.zugId,
      b.blockId,
      b.title,
      b.schema,
      b.date,
      b.startMin,
      b.ort,
      b.leitungUserId,
      b.protokollUserId,
      JSON.stringify(b.teilnehmerIds),
      b.abwesend,
      b.gaeste,
      JSON.stringify(b.traktanden ?? rap.traktanden),
      b.status,
      rap.id,
    );
    if (b.status !== rap.status) await audit(db, u.id, 'rapport', rap.id, b.status === 'ABGESCHLOSSEN' ? 'close' : 'reopen');
    res.json((await loadRapport(wk, rap.id)));
  });

  r.delete('/wks/:id/rapporte/:rid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const rap = await loadRapport(wk, idParam(req, 'rid'));
    ensure(canEditRapport(u, wk, rap));
    // Its Pendenzen stay (without Rapport).
    await db.prepare('DELETE FROM rapport WHERE id = ?').run(rap.id);
    await audit(db, u.id, 'rapport', rap.id, 'delete', { title: rap.title, date: rap.date, start: rap.startMin === null ? '' : fmtTime(rap.startMin) });
    res.json({ ok: true });
  });

  // ---- Pendenzen ----

  r.get('/wks/:id/pendenzen', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(u, wk));
    const list = ((await db.prepare(`${PENDENZ_SELECT} WHERE p.wk_id = ? ORDER BY p.done_at IS NOT NULL, p.due_date = '', p.due_date, p.id`).all(wk.id)) as any[]).map(
      toPendenz,
    );
    // Own Pendenzen always; others like their Rapport.
    res.json(list.filter((p) => p.responsibleUserId === u.id || canViewRapport(u, wk, p)));
  });

  const resolveScope = async (wk: Wk, b: z.infer<typeof pendenzInput>) => {
    if (b.rapportId !== null) {
      const rap = await loadRapport(wk, b.rapportId);
      if (b.traktandumKey && !rap.traktanden.some((t) => t.key === b.traktandumKey)) throw new HttpError(400, 'srv.unbekanntesTraktandum');
      return { ...b, zugId: rap.zugId };
    }
    await checkZug(wk, b.zugId);
    return { ...b, traktandumKey: null };
  };

  r.post('/wks/:id/pendenzen', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const b = await resolveScope(wk, parse(pendenzInput, req.body));
    await checkUsers(wk, [b.responsibleUserId]);
    if (b.rapportId === null && b.responsibleUserId !== null) {
      // Directly for a person (Pendenzen view): oneself or a subordinate; it belongs to that person's Zug.
      const target = (await db.prepare('SELECT id, kp_id, zug_id FROM app_user WHERE id = ?').get(b.responsibleUserId)) as any;
      ensure(canAssignPendenz(u, wk, { id: target.id, kpId: target.kp_id, zugId: target.zug_id }));
      b.zugId = target.kp_id === wk.kpId ? target.zug_id : null;
    } else {
      ensure((await canEditPendenz(u, wk, { ...b, createdBy: u.id })) && (b.rapportId !== null || canCreateRapport(u, wk, b.zugId)));
    }
    const id = Number(
      (await db
        .prepare('INSERT INTO pendenz (wk_id, rapport_id, traktandum_key, zug_id, text, responsible_user_id, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(wk.id, b.rapportId, b.traktandumKey, b.zugId, b.text, b.responsibleUserId, b.dueDate, u.id)).lastInsertRowid,
    );
    res.status(201).json((await loadPendenz(wk, id)));
  });

  r.put('/wks/:id/pendenzen/:pid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const p = await loadPendenz(wk, idParam(req, 'pid'));
    ensure((await canEditPendenz(u, wk, p)));
    const b = await resolveScope(wk, parse(pendenzInput, { ...req.body, rapportId: p.rapportId, zugId: req.body?.zugId ?? p.zugId }));
    await checkUsers(wk, [b.responsibleUserId]);
    await db.prepare('UPDATE pendenz SET traktandum_key = ?, zug_id = ?, text = ?, responsible_user_id = ?, due_date = ? WHERE id = ?').run(
      b.traktandumKey,
      b.zugId,
      b.text,
      b.responsibleUserId,
      b.dueDate,
      p.id,
    );
    res.json((await loadPendenz(wk, p.id)));
  });

  r.post('/wks/:id/pendenzen/:pid/done', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const p = await loadPendenz(wk, idParam(req, 'pid'));
    ensure(canTickPendenz(u, wk, p, (await canEditPendenz(u, wk, p))));
    const { done } = parse(z.object({ done: z.boolean() }), req.body);
    if (done) await db.prepare("UPDATE pendenz SET done_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'), done_by = ? WHERE id = ?").run(u.id, p.id);
    else await db.prepare('UPDATE pendenz SET done_at = NULL, done_by = NULL WHERE id = ?').run(p.id);
    res.json((await loadPendenz(wk, p.id)));
  });

  r.delete('/wks/:id/pendenzen/:pid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const p = await loadPendenz(wk, idParam(req, 'pid'));
    ensure((await canEditPendenz(u, wk, p)));
    await db.prepare('DELETE FROM pendenz WHERE id = ?').run(p.id);
    res.json({ ok: true });
  });

  return r;
}
