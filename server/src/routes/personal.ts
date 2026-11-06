// Personal: planned headcount per Zug and day, participant list, daily QR check-in and presence.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../db';
import { audit, tx } from '../db';
import { ensure, HttpError, idParam, parse, user, asyncRouter } from '../http';
import { loadWk, zuegeOfKp } from '../repo';
import { canEditStrength, canHandleHealth, canManagePersonnel, canMarkPresent, canViewPersonnel, canViewWk } from '../../../shared/permissions';
import {
  KDO_ID,
  type CheckIn,
  type CheckInDay,
  type Diet,
  type HealthCheck,
  type HealthPoint,
  type Participant,
  type PublicCheckIn,
  type SessionUser,
  type Strength,
  type Wk,
} from '../../../shared/types';
import { wkDays } from '../../../shared/util';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const diet = z.enum(['NORMAL', 'KEIN_SCHWEIN', 'VEGETARISCH']);
const healthAnswer = z.object({
  points: z.array(z.enum(['A', 'B', 'C', 'D', 'E'])).max(5).transform((x) => [...new Set(x)].sort() as HealthPoint[]),
  note: z.string().trim().max(1000).default(''),
});

const participantInput = z.object({
  nachname: z.string().trim().min(1, 'srv.nachnameErforderlich').max(80),
  vorname: z.string().trim().max(80).default(''),
  grad: z.string().trim().max(40).default(''),
  funktion: z.string().trim().max(80).default(''),
  zugId: z.number().int().nullable().default(null),
  email: z.string().trim().max(120).default(''),
  extId: z.string().trim().max(40).default(''),
  days: z.array(date).max(60).default([]),
});

const checkInInput = z.object({
  vorname: z.string().trim().min(1, 'srv.vornameErforderlich').max(80),
  nachname: z.string().trim().min(1, 'srv.nachnameErforderlich').max(80),
  // Optional: helps matching, but people without e-mail check in by name.
  email: z.union([z.literal(''), z.string().trim().email('srv.bitteEineGueltigeEMail').max(120)]).default(''),
  zugId: z.number().int().nullable().default(null),
  diet: diet.default('NORMAL'),
  intolerances: z.string().trim().max(300).default(''),
  health: healthAnswer.nullable().optional(),
});

/** «Müller-Weber», «Mueller Weber» and «muller weber» are the same. */
export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/([aou])e/g, '$1');

/**
 * The participant a check-in belongs to: same e-mail, or same first and last name (also swapped).
 * Only an unambiguous hit counts; everything else is matched by hand.
 */
export function matchParticipant(list: Pick<Participant, 'id' | 'vorname' | 'nachname' | 'email'>[], q: { vorname: string; nachname: string; email: string }) {
  const email = q.email.trim().toLowerCase();
  if (email) {
    const byMail = list.filter((p) => p.email.trim().toLowerCase() === email);
    if (byMail.length === 1) return byMail[0].id;
  }
  const v = normName(q.vorname);
  const n = normName(q.nachname);
  const byName = list.filter(
    (p) => (normName(p.nachname) === n && normName(p.vorname) === v) || (normName(p.nachname) === v && normName(p.vorname) === n),
  );
  return byName.length === 1 ? byName[0].id : null;
}

/** Today in Switzerland. */
export const todayCh = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(new Date());

const toParticipant = (r: any): Participant => ({
  id: r.id,
  wkId: r.wk_id,
  nachname: r.nachname,
  vorname: r.vorname,
  grad: r.grad,
  funktion: r.funktion,
  zugId: r.zug_id,
  email: r.email,
  extId: r.ext_id,
  days: JSON.parse(r.days || '[]'),
  diet: r.diet as Diet,
  intolerances: r.intolerances,
});

const toCheckIn = (r: any): CheckIn => ({
  id: r.id,
  date: r.date,
  participantId: r.participant_id,
  vorname: r.vorname,
  nachname: r.nachname,
  email: r.email,
  zugId: r.zug_id,
  diet: r.diet as Diet,
  intolerances: r.intolerances,
  source: r.source,
  createdAt: r.created_at,
});

const toHealth = (r: any): HealthCheck => ({
  id: r.id,
  participantId: r.participant_id,
  vorname: r.vorname,
  nachname: r.nachname,
  zugId: r.zug_id,
  points: JSON.parse(r.points || '[]'),
  note: r.note,
  status: r.status,
  restriction: r.restriction,
  source: r.source,
  createdAt: r.created_at,
});

/** Someone not (yet) on the list: the same person by e-mail, or by name when no e-mail was given. */
const samePerson = (who: { email: string; vorname: string; nachname: string }) =>
  who.email
    ? { sql: 'lower(email) = lower(?)', params: [who.email] }
    : { sql: "email = '' AND lower(vorname) = lower(?) AND lower(nachname) = lower(?)", params: [who.vorname, who.nachname] };

/** Earlier answer of a person in this WK (by list entry, otherwise by e-mail or name of an unmatched check-in). */
async function healthOf(db: DB, wkId: number, pid: number | null, who: { email: string; vorname: string; nachname: string }) {
  if (pid !== null) return (await db.prepare('SELECT * FROM health_check WHERE wk_id = ? AND participant_id = ?').get(wkId, pid)) as any;
  const m = samePerson(who);
  return (await db.prepare(`SELECT * FROM health_check WHERE wk_id = ? AND participant_id IS NULL AND ${m.sql}`).get(wkId, ...m.params)) as any;
}

const newToken = () => randomBytes(16).toString('base64url');

export function personalRouter(db: DB) {
  const r = asyncRouter();

  const zugIds = async (wk: Wk) => new Set((await zuegeOfKp(db, wk.kpId)).map((z) => z.id));
  const checkZug = async (wk: Wk, zugId: number | null) => {
    if (zugId !== null && !(await zugIds(wk)).has(zugId)) throw new HttpError(400, 'err.checkin.unknownZug');
  };
  const checkDate = (wk: Wk, d: string) => {
    if (!wkDays(wk).includes(d)) throw new HttpError(400, 'srv.derTagLiegtNichtIm');
  };
  const participantsOf = async (wkId: number) =>
    ((await db.prepare('SELECT * FROM participant WHERE wk_id = ? ORDER BY nachname, vorname').all(wkId)) as any[]).map(toParticipant);
  const loadParticipant = async (wk: Wk, id: number) => {
    const row = await db.prepare('SELECT * FROM participant WHERE id = ? AND wk_id = ?').get(id, wk.id);
    if (!row) throw new HttpError(404, 'srv.personNichtGefunden');
    return toParticipant(row);
  };
  const loadCheckIn = async (wk: Wk, id: number) => {
    const row = await db.prepare('SELECT * FROM checkin WHERE id = ? AND wk_id = ?').get(id, wk.id);
    if (!row) throw new HttpError(404, 'srv.checkInNichtGefunden');
    return toCheckIn(row);
  };
  /** A Zfhr sees the people of the own Zug only. */
  const visibleFor = (u: SessionUser) => (zugId: number | null) => u.role !== 'ZFHR' || zugId === u.zugId;

  // ---- Sollbestand ----

  r.get('/wks/:id/strength', async (req, res) => {
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(user(req), wk));
    const rows = (await db.prepare('SELECT zug_id, date, planned FROM zug_strength WHERE wk_id = ?').all(wk.id)) as any[];
    res.json(rows.map((x): Strength => ({ zugId: x.zug_id, date: x.date, planned: x.planned })));
  });

  r.put('/wks/:id/strength', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const { entries } = parse(
      z.object({ entries: z.array(z.object({ zugId: z.number().int(), date, planned: z.number().int().min(0).max(999) })).max(500) }),
      req.body,
    );
    for (const e of entries) {
      ensure(canEditStrength(u, wk, e.zugId));
      if (e.zugId !== KDO_ID) await checkZug(wk, e.zugId);
      checkDate(wk, e.date);
    }
    const up = db.prepare(
      'INSERT INTO zug_strength (wk_id, zug_id, date, planned) VALUES (?, ?, ?, ?) ON CONFLICT (wk_id, zug_id, date) DO UPDATE SET planned = excluded.planned',
    );
    await tx(db, async () => {
      for (const e of entries) await up.run(wk.id, e.zugId, e.date, e.planned);
    });
    await audit(db, u.id, 'strength', wk.id, 'update', { count: entries.length });
    res.json({ ok: true });
  });

  // ---- Teilnehmerliste ----

  r.get('/wks/:id/participants', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewPersonnel(u, wk));
    res.json((await participantsOf(wk.id)).filter((p) => visibleFor(u)(p.zugId)));
  });

  const writeParticipant = async (wk: Wk, b: z.infer<typeof participantInput>, id?: number) => {
    await checkZug(wk, b.zugId);
    b.days.forEach((d) => checkDate(wk, d));
    if (id) {
      await db.prepare('UPDATE participant SET nachname = ?, vorname = ?, grad = ?, funktion = ?, zug_id = ?, email = ?, ext_id = ?, days = ? WHERE id = ?').run(
        b.nachname,
        b.vorname,
        b.grad,
        b.funktion,
        b.zugId,
        b.email,
        b.extId,
        JSON.stringify(b.days),
        id,
      );
      return id;
    }
    return Number(
      (await db
        .prepare('INSERT INTO participant (wk_id, nachname, vorname, grad, funktion, zug_id, email, ext_id, days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(wk.id, b.nachname, b.vorname, b.grad, b.funktion, b.zugId, b.email, b.extId, JSON.stringify(b.days))).lastInsertRowid,
    );
  };

  r.post('/wks/:id/participants', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const id = await writeParticipant(wk, parse(participantInput, req.body));
    res.status(201).json((await loadParticipant(wk, id)));
  });

  /** Several people at once: Zug and/or days of service. */
  r.post('/wks/:id/participants/bulk', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const b = parse(
      z.object({ ids: z.array(z.number().int()).min(1).max(2000), zugId: z.number().int().nullable().optional(), days: z.array(date).max(60).optional() }),
      req.body,
    );
    if (b.zugId !== undefined) await checkZug(wk, b.zugId);
    b.days?.forEach((d) => checkDate(wk, d));
    const all = wkDays(wk);
    // All days = the whole WK.
    const days = b.days && b.days.length === all.length ? [] : b.days;
    const n = await tx(db, async () => {
      let count = 0;
      for (const id of new Set(b.ids)) {
        const r = await db
          .prepare(
            `UPDATE participant SET zug_id = CASE WHEN ?::int = 1 THEN ?::int ELSE zug_id END, days = COALESCE(?, days) WHERE id = ? AND wk_id = ?`,
          )
          .run(b.zugId !== undefined ? 1 : 0, b.zugId ?? null, days ? JSON.stringify([...new Set(days)].sort()) : null, id, wk.id);
        count += r.changes;
      }
      return count;
    });
    await audit(db, u.id, 'participant', wk.id, 'bulk', { count: n, zugId: b.zugId, days: b.days?.length });
    res.json({ updated: n });
  });

  /** Remove several people (check-ins stay, without person). */
  r.post('/wks/:id/participants/bulk-delete', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const { ids } = parse(z.object({ ids: z.array(z.number().int()).min(1).max(5000) }), req.body);
    const n = await tx(db, async () => {
      let count = 0;
      for (const id of new Set(ids)) count += (await db.prepare('DELETE FROM participant WHERE id = ? AND wk_id = ?').run(id, wk.id)).changes;
      return count;
    });
    await audit(db, u.id, 'participant', wk.id, 'bulk-delete', { count: n });
    res.json({ deleted: n });
  });

  r.put('/wks/:id/participants/:pid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const p = await loadParticipant(wk, idParam(req, 'pid'));
    await writeParticipant(wk, parse(participantInput, req.body), p.id);
    res.json((await loadParticipant(wk, p.id)));
  });

  r.delete('/wks/:id/participants/:pid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const p = await loadParticipant(wk, idParam(req, 'pid'));
    await db.prepare('DELETE FROM participant WHERE id = ?').run(p.id);
    res.json({ ok: true });
  });

  /**
   * Import of the list from the personnel system. «merge» updates people found by number or name and adds the rest;
   * «replace» also removes people missing in the file (their check-ins remain, unassigned).
   */
  r.post('/wks/:id/participants/import', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const b = parse(z.object({ mode: z.enum(['merge', 'replace']).default('merge'), items: z.array(participantInput).min(1).max(2000) }), req.body);
    const result = await tx(db, async () => {
      const existing = await participantsOf(wk.id);
      const key = (p: { extId: string; vorname: string; nachname: string }) => (p.extId ? `#${p.extId}` : `${normName(p.nachname)}|${normName(p.vorname)}`);
      const byKey = new Map(existing.map((p) => [key(p), p]));
      const byName = new Map(existing.map((p) => [`${normName(p.nachname)}|${normName(p.vorname)}`, p]));
      const seen = new Set<number>();
      let added = 0;
      let updated = 0;
      for (const item of b.items) {
        const hit = byKey.get(key(item)) ?? byName.get(`${normName(item.nachname)}|${normName(item.vorname)}`);
        if (hit && !seen.has(hit.id)) {
          // Keep values the file does not have.
          await writeParticipant(wk, { ...item, email: item.email || hit.email, zugId: item.zugId ?? hit.zugId, extId: item.extId || hit.extId }, hit.id);
          seen.add(hit.id);
          updated++;
        } else {
          seen.add((await writeParticipant(wk, item)));
          added++;
        }
      }
      let removed = 0;
      if (b.mode === 'replace') {
        for (const p of existing.filter((x) => !seen.has(x.id))) {
          await db.prepare('DELETE FROM participant WHERE id = ?').run(p.id);
          removed++;
        }
      }
      return { added, updated, removed };
    });
    await audit(db, u.id, 'participant', wk.id, 'import', result);
    res.json(result);
  });

  // ---- QR codes per day ----

  /** One row per WK day, created on first use. */
  const daysOf = async (wk: Wk): Promise<CheckInDay[]> => {
    const rows = new Map(((await db.prepare('SELECT * FROM checkin_day WHERE wk_id = ?').all(wk.id)) as any[]).map((x) => [x.date, x]));
    const out: CheckInDay[] = [];
    for (const d of wkDays(wk)) {
      let row = rows.get(d);
      if (!row) {
        row = { date: d, token: newToken(), mode: 'AUTO' };
        // Two requests at once: the first one wins.
        await db.prepare('INSERT INTO checkin_day (wk_id, date, token) VALUES (?, ?, ?) ON CONFLICT (wk_id, date) DO NOTHING').run(wk.id, d, row.token);
        row = (await db.prepare('SELECT * FROM checkin_day WHERE wk_id = ? AND date = ?').get(wk.id, d)) ?? row;
      }
      out.push({ date: d, token: row.token, mode: row.mode });
    }
    return out;
  };

  r.get('/wks/:id/checkin-days', async (req, res) => {
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(user(req), wk));
    res.json((await daysOf(wk)));
  });

  r.put('/wks/:id/checkin-days/:date', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const d = parse(date, req.params.date);
    checkDate(wk, d);
    const b = parse(z.object({ mode: z.enum(['AUTO', 'OPEN', 'CLOSED']).optional(), renew: z.boolean().optional() }), req.body);
    await daysOf(wk);
    if (b.mode) await db.prepare('UPDATE checkin_day SET mode = ? WHERE wk_id = ? AND date = ?').run(b.mode, wk.id, d);
    // A new code makes printed or forwarded old ones invalid.
    if (b.renew) await db.prepare('UPDATE checkin_day SET token = ? WHERE wk_id = ? AND date = ?').run(newToken(), wk.id, d);
    res.json((await daysOf(wk)).find((x) => x.date === d));
  });

  // ---- Präsenz ----

  r.get('/wks/:id/checkins', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewPersonnel(u, wk));
    const zugOf = new Map((await participantsOf(wk.id)).map((p) => [p.id, p.zugId]));
    const rows = ((await db.prepare('SELECT * FROM checkin WHERE wk_id = ? ORDER BY date, created_at').all(wk.id)) as any[]).map(toCheckIn);
    res.json(rows.filter((c) => visibleFor(u)(c.participantId !== null ? (zugOf.get(c.participantId) ?? null) : c.zugId)));
  });

  /** Marks a person of the list present (or not) by hand, e.g. at the morning Appell. */
  r.post('/wks/:id/presence', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const b = parse(z.object({ participantId: z.number().int(), date, present: z.boolean() }), req.body);
    const p = await loadParticipant(wk, b.participantId);
    ensure(canMarkPresent(u, wk, p.zugId));
    checkDate(wk, b.date);
    if (!b.present) {
      await db.prepare('DELETE FROM checkin WHERE wk_id = ? AND date = ? AND participant_id = ?').run(wk.id, b.date, p.id);
    } else if (!(await db.prepare('SELECT 1 FROM checkin WHERE wk_id = ? AND date = ? AND participant_id = ?').get(wk.id, b.date, p.id))) {
      await db.prepare(
        "INSERT INTO checkin (wk_id, date, participant_id, vorname, nachname, email, zug_id, diet, intolerances, source, matched_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?)",
      ).run(wk.id, b.date, p.id, p.vorname, p.nachname, p.email, p.zugId, p.diet, p.intolerances, u.id);
    }
    res.json({ ok: true });
  });

  /** Manual matching: assign a check-in to a person of the list, or add the person to the list. */
  r.post('/wks/:id/checkins/:cid/match', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const c = await loadCheckIn(wk, idParam(req, 'cid'));
    const b = parse(z.object({ participantId: z.number().int().nullable().optional(), create: participantInput.optional() }), req.body);
    const result = await tx(db, async () => {
      let pid: number | null;
      if (b.create) pid = (await writeParticipant(wk, b.create));
      else if (b.participantId != null) pid = (await loadParticipant(wk, b.participantId)).id;
      else pid = null;
      if (pid !== null) {
        // Already checked in that day (e.g. marked by hand): keep one entry.
        const dup = (await db.prepare('SELECT id FROM checkin WHERE wk_id = ? AND date = ? AND participant_id = ? AND id != ?').get(wk.id, c.date, pid, c.id)) as any;
        if (dup) await db.prepare('DELETE FROM checkin WHERE id = ?').run(dup.id);
        await db.prepare('UPDATE participant SET diet = ?, intolerances = ?, email = CASE WHEN email = \'\' THEN ? ELSE email END WHERE id = ?').run(
          c.diet,
          c.intolerances,
          c.email,
          pid,
        );
      }
      await db.prepare('UPDATE checkin SET participant_id = ?, matched_by = ? WHERE id = ?').run(pid, pid === null ? null : u.id, c.id);
      // The Eintrittsbefragung given with this check-in belongs to the person as well (unless the person has one already).
      if (pid !== null && !(await healthOf(db, wk.id, pid, c))) {
        await db.prepare('UPDATE health_check SET participant_id = ? WHERE wk_id = ? AND checkin_id = ? AND participant_id IS NULL').run(pid, wk.id, c.id);
      }
      return loadCheckIn(wk, c.id);
    });
    await audit(db, u.id, 'checkin', c.id, 'match', { participantId: result.participantId });
    res.json(result);
  });

  r.delete('/wks/:id/checkins/:cid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canManagePersonnel(u, wk));
    const c = await loadCheckIn(wk, idParam(req, 'cid'));
    await db.prepare('DELETE FROM checkin WHERE id = ?').run(c.id);
    res.json({ ok: true });
  });

  // ---- Sanitarische Eintrittsbefragung ----

  /** Kp Kdt: all answers; Zugführer: status and restrictions of the own Zug (no health details). */
  r.get('/wks/:id/health', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewPersonnel(u, wk));
    const zugOf = new Map((await participantsOf(wk.id)).map((p) => [p.id, p.zugId]));
    const rows = ((await db.prepare('SELECT * FROM health_check WHERE wk_id = ? ORDER BY created_at').all(wk.id)) as any[])
      .map(toHealth)
      .map((h) => ({ ...h, zugId: h.participantId !== null ? (zugOf.get(h.participantId) ?? h.zugId) : h.zugId }));
    if (canHandleHealth(u, wk)) return res.json(rows);
    res.json(
      rows
        .filter((h) => visibleFor(u)(h.zugId))
        .map((h) => ({ ...h, points: [], note: '', status: h.status === 'GESUND' ? 'GESUND' : h.status === 'ERLEDIGT' ? 'ERLEDIGT' : 'MELDUNG' })),
    );
  });

  /** Asked in person (e.g. marked present by hand): the Kp Kdt records the answer. */
  r.post('/wks/:id/health', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canHandleHealth(u, wk));
    const b = parse(healthAnswer.extend({ participantId: z.number().int() }), req.body);
    const p = await loadParticipant(wk, b.participantId);
    if (await healthOf(db, wk.id, p.id, p)) throw new HttpError(409, 'srv.fuerDiesePersonIstDie');
    const id = (
      await db
        .prepare(
          "INSERT INTO health_check (wk_id, participant_id, vorname, nachname, email, zug_id, points, note, status, source, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?)",
        )
        .run(wk.id, p.id, p.vorname, p.nachname, p.email, p.zugId, JSON.stringify(b.points), b.note, b.points.length ? 'MELDUNG' : 'GESUND', u.id)
    ).lastInsertRowid;
    await audit(db, u.id, 'health_check', Number(id), 'create', { participantId: p.id });
    res.status(201).json(toHealth(await db.prepare('SELECT * FROM health_check WHERE id = ?').get(id)));
  });

  /** Follow-up by the Kp Kdt: taken to the Kursarzt, restrictions for the superiors, closed. */
  r.put('/wks/:id/health/:hid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canHandleHealth(u, wk));
    const b = parse(
      z.object({ status: z.enum(['GESUND', 'MELDUNG', 'KURSARZT', 'ERLEDIGT']).optional(), restriction: z.string().trim().max(1000).optional() }),
      req.body,
    );
    const row = (await db.prepare('SELECT * FROM health_check WHERE id = ? AND wk_id = ?').get(idParam(req, 'hid'), wk.id)) as any;
    if (!row) throw new HttpError(404, 'srv.eintragNichtGefunden');
    await db
      .prepare('UPDATE health_check SET status = ?, restriction = ?, updated_by = ? WHERE id = ?')
      .run(b.status ?? row.status, b.restriction ?? row.restriction, u.id, row.id);
    await audit(db, u.id, 'health_check', row.id, 'update', { status: b.status });
    res.json(toHealth(await db.prepare('SELECT * FROM health_check WHERE id = ?').get(row.id)));
  });

  r.delete('/wks/:id/health/:hid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canHandleHealth(u, wk));
    await db.prepare('DELETE FROM health_check WHERE id = ? AND wk_id = ?').run(idParam(req, 'hid'), wk.id);
    res.json({ ok: true });
  });

  return r;
}

/** Check-in form behind the QR code: no login, only the token of the day. */
export function publicRouter(db: DB) {
  const r = asyncRouter();

  const dayOf = async (token: string) => {
    const row = (await db
      .prepare(
        `SELECT d.*, w.title, w.kp_id, w.archived, k.name AS kp_name, b.region_name, b.logo
         FROM checkin_day d JOIN wk w ON w.id = d.wk_id JOIN kompanie k ON k.id = w.kp_id JOIN bataillon b ON b.id = k.bat_id
         WHERE d.token = ?`,
      )
      .get(token)) as any;
    if (!row) throw new HttpError(404, 'err.checkin.invalidCode');
    const open = !row.archived && (row.mode === 'OPEN' || (row.mode === 'AUTO' && row.date === todayCh()));
    return { row, open };
  };

  r.get('/checkin/:token', async (req, res) => {
    const { row, open } = await dayOf(req.params.token);
    const out: PublicCheckIn = {
      wkId: row.wk_id,
      wkTitle: row.title,
      kpName: row.kp_name,
      regionName: row.region_name ?? '',
      logo: row.logo ?? '',
      date: row.date,
      open,
      zuege: (await zuegeOfKp(db, row.kp_id)).map((z) => ({ id: z.id, name: z.name })),
    };
    res.json(out);
  });

  r.post('/checkin/:token', async (req, res) => {
    const { row, open } = await dayOf(req.params.token);
    if (!open) throw new HttpError(409, 'err.checkin.closed');
    const b = parse(checkInInput, req.body);
    if (b.zugId !== null && !(await zuegeOfKp(db, row.kp_id)).some((z) => z.id === b.zugId)) throw new HttpError(400, 'srv.unbekannterZug');
    const wkId: number = row.wk_id;
    const list = ((await db.prepare('SELECT * FROM participant WHERE wk_id = ?').all(wkId)) as any[]).map(toParticipant);
    const pid = matchParticipant(list, b);
    // Art. 6: at the start of the service everyone answers the sanitarische Eintrittsbefragung once.
    const earlier = await healthOf(db, wkId, pid, b);
    const same = samePerson(b);
    if (!earlier && !b.health) throw new HttpError(409, 'err.checkin.healthRequired', { code: 'HEALTH_REQUIRED' });
    let health: HealthCheck['status'] | null = earlier ? earlier.status : null;
    await tx(db, async () => {
      // Checking in twice updates the first entry.
      const prev = (
        pid !== null
          ? (await db.prepare('SELECT id FROM checkin WHERE wk_id = ? AND date = ? AND participant_id = ?').get(wkId, row.date, pid))
          : (await db.prepare(`SELECT id FROM checkin WHERE wk_id = ? AND date = ? AND participant_id IS NULL AND ${same.sql}`).get(wkId, row.date, ...same.params))
      ) as any;
      let checkinId: number;
      if (prev) {
        checkinId = prev.id;
        await db.prepare('UPDATE checkin SET vorname = ?, nachname = ?, email = ?, zug_id = ?, diet = ?, intolerances = ? WHERE id = ?').run(
          b.vorname,
          b.nachname,
          b.email,
          b.zugId,
          b.diet,
          b.intolerances,
          prev.id,
        );
      } else {
        checkinId = Number(
          (
            await db
              .prepare(
                "INSERT INTO checkin (wk_id, date, participant_id, vorname, nachname, email, zug_id, diet, intolerances, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SELF')",
              )
              .run(wkId, row.date, pid, b.vorname, b.nachname, b.email, b.zugId, b.diet, b.intolerances)
          ).lastInsertRowid,
        );
      }
      if (b.health) {
        const status = b.health.points.length ? 'MELDUNG' : 'GESUND';
        if (!earlier) {
          await db
            .prepare(
              "INSERT INTO health_check (wk_id, participant_id, checkin_id, vorname, nachname, email, zug_id, points, note, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SELF')",
            )
            .run(wkId, pid, checkinId, b.vorname, b.nachname, b.email, b.zugId, JSON.stringify(b.health.points), b.health.note, status);
          health = status;
        } else if (b.health.points.length && earlier.status === 'GESUND') {
          // Reported later on (e.g. changed the answer): becomes a report for the Kursarzt.
          await db.prepare("UPDATE health_check SET points = ?, note = ?, status = 'MELDUNG' WHERE id = ?").run(JSON.stringify(b.health.points), b.health.note, earlier.id);
          health = 'MELDUNG';
        }
      }
      if (pid !== null) {
        await db.prepare("UPDATE participant SET diet = ?, intolerances = ?, email = CASE WHEN email = '' THEN ? ELSE email END WHERE id = ?").run(
          b.diet,
          b.intolerances,
          b.email,
          pid,
        );
      }
    });
    res.status(201).json({ matched: pid !== null, health });
  });

  return r;
}
