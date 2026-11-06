import { z } from 'zod';
import type { DB } from '../db';
import { audit, tx } from '../db';
import { hashPassword } from '../auth';
import { ensure, HttpError, idParam, parse, user, asyncRouter } from '../http';
import { toBat, toKp, toUser, toZug, withGruppen } from '../repo';
import { canAdministrate, canEditZugAssignment, canManageOrg, canManageUser } from '../../../shared/permissions';
import type { SessionUser } from '../../../shared/types';

const userInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'BAT', 'KPKDT', 'LOGOF', 'ZFHR', 'KADER']),
  kpId: z.number().int().nullable(),
  zugId: z.number().int().nullable(),
  funktion: z.string().default(''),
  password: z.string().min(8).optional(),
});

const count = z.number().int().min(0).max(999);
const bestand = z.object({ zfhr: count, kader: count, sdt: count });

export function orgRouter(db: DB) {
  const r = asyncRouter();

  const kpOf = async (id: number) => {
    const row = await db.prepare('SELECT * FROM kompanie WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'srv.kompanieNichtGefunden');
    return toKp(row);
  };
  const zugOf = async (id: number) => {
    const row = await db.prepare('SELECT * FROM zug WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'srv.zugNichtGefunden');
    return (await withGruppen(db, [toZug(row)]))[0];
  };
  const ensureKpInBat = async (u: SessionUser, kpId: number) => {
    if ((await kpOf(kpId)).batId !== u.batId) throw new HttpError(403, 'srv.kompanieGehoertNichtZumBataillon');
  };

  /** Everything the current user may see of the organisation. */
  r.get('/org', async (req, res) => {
    const u = user(req);
    const bat = toBat((await db.prepare('SELECT * FROM bataillon WHERE id = ?').get(u.batId)));
    let kompanien = (await db.prepare('SELECT * FROM kompanie WHERE bat_id = ? ORDER BY name').all(u.batId)).map(toKp);
    if (u.role !== 'BAT') kompanien = kompanien.filter((k) => k.id === u.kpId);
    const kpIds = kompanien.map((k) => k.id);
    const zuege = await withGruppen(
      db,
      (await db.prepare('SELECT * FROM zug ORDER BY sort, id').all()).map(toZug).filter((z) => kpIds.includes(z.kpId)),
    );
    const users = (await db
      .prepare('SELECT * FROM app_user WHERE bat_id = ? ORDER BY role, name')
      .all(u.batId))
      .map(toUser)
      .filter((x) => u.role === 'BAT' || x.role === 'BAT' || x.kpId === u.kpId);
    res.json({ bataillon: bat, kompanien, zuege, users });
  });

  // ---- Bataillon: name, Region and logo for documents ----
  r.put('/bataillone/:id/settings', async (req, res) => {
    const u = user(req);
    const id = idParam(req);
    ensure(canAdministrate(u, id));
    const image = z
      .string()
      .max(700_000, 'srv.logoZuGrossMaxCa')
      .regex(/^data:image\/(png|jpeg|svg\+xml|webp);base64,/, 'srv.logoMussEinPngJpeg')
      .nullable()
      .default(null);
    const line = z.string().trim().max(200).default('');
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(100),
        regionName: z.string().trim().max(200).default(''),
        logo: image,
        kantonLogo: image,
        briefkopf: z.object({ amt: line, abteilung: line, adresse: line, telefon: line, web: line }).default({}),
        // Within Switzerland and its surroundings.
        mapView: z
          .object({ lat: z.number().min(45.5).max(48.2), lon: z.number().min(5.5).max(11), zoom: z.number().int().min(6).max(19) })
          .nullable()
          .default(null),
      }),
      req.body,
    );
    await db
      .prepare('UPDATE bataillon SET name = ?, region_name = ?, logo = ?, kanton_logo = ?, briefkopf = ?, map_view = ? WHERE id = ?')
      .run(b.name, b.regionName, b.logo, b.kantonLogo, JSON.stringify(b.briefkopf), b.mapView ? JSON.stringify(b.mapView) : null, id);
    await audit(db, u.id, 'bataillon', id, 'settings', { name: b.name, regionName: b.regionName, logo: !!b.logo });
    res.json(toBat((await db.prepare('SELECT * FROM bataillon WHERE id = ?').get(id))));
  });

  // ---- Kompanien (Bat only) ----
  r.post('/kompanien', async (req, res) => {
    const u = user(req);
    ensure(canManageOrg(u));
    const { name } = parse(z.object({ name: z.string().min(1) }), req.body);
    const { lastInsertRowid } = await db.prepare('INSERT INTO kompanie (bat_id, name) VALUES (?, ?)').run(u.batId, name);
    await audit(db, u.id, 'kompanie', Number(lastInsertRowid), 'create', { name });
    res.status(201).json((await kpOf(Number(lastInsertRowid))));
  });

  r.patch('/kompanien/:id', async (req, res) => {
    const u = user(req);
    ensure(canManageOrg(u));
    const id = idParam(req);
    await ensureKpInBat(u, id);
    const { name } = parse(z.object({ name: z.string().min(1) }), req.body);
    await db.prepare('UPDATE kompanie SET name = ? WHERE id = ?').run(name, id);
    res.json((await kpOf(id)));
  });

  r.delete('/kompanien/:id', async (req, res) => {
    const u = user(req);
    ensure(canManageOrg(u));
    const id = idParam(req);
    await ensureKpInBat(u, id);
    await db.prepare('DELETE FROM kompanie WHERE id = ?').run(id);
    await audit(db, u.id, 'kompanie', id, 'delete');
    res.json({ ok: true });
  });

  // ---- Züge (Bat or own Kp Kdt) ----
  r.post('/zuege', async (req, res) => {
    const u = user(req);
    const b = parse(z.object({ kpId: z.number().int(), name: z.string().min(1) }), req.body);
    await ensureKpInBat(u, b.kpId);
    ensure(canEditZugAssignment(u, b.kpId));
    const max = (await db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM zug WHERE kp_id = ?').get(b.kpId)) as any;
    const { lastInsertRowid } = await db
      .prepare('INSERT INTO zug (kp_id, name, sort) VALUES (?, ?, ?)')
      .run(b.kpId, b.name, max.m + 1);
    res.status(201).json((await zugOf(Number(lastInsertRowid))));
  });

  r.patch('/zuege/:id', async (req, res) => {
    const u = user(req);
    const zug = await zugOf(idParam(req));
    await ensureKpInBat(u, zug.kpId);
    ensure(canEditZugAssignment(u, zug.kpId));
    const b = parse(
      z.object({
        name: z.string().min(1).optional(),
        order: z.number().int().optional(),
        zfhrUserId: z.number().int().nullable().optional(),
        soll: bestand.optional(),
        ist: bestand.optional(),
      }),
      req.body,
    );
    if (b.zfhrUserId != null) {
      const zf = (await db.prepare('SELECT * FROM app_user WHERE id = ?').get(b.zfhrUserId)) as any;
      if (!zf || zf.role !== 'ZFHR' || zf.kp_id !== zug.kpId) throw new HttpError(400, 'srv.ungueltigeRZugfuehrerIn');
      await db.prepare('UPDATE app_user SET zug_id = ? WHERE id = ?').run(zug.id, zf.id);
    }
    await db.prepare(
      'UPDATE zug SET name = COALESCE(?, name), sort = COALESCE(?, sort), zfhr_user_id = CASE WHEN ?::int = 1 THEN ?::int ELSE zfhr_user_id END WHERE id = ?',
    ).run(b.name ?? null, b.order ?? null, b.zfhrUserId !== undefined ? 1 : 0, b.zfhrUserId ?? null, zug.id);
    if (b.soll || b.ist) {
      await db
        .prepare('UPDATE zug SET soll = COALESCE(?, soll), ist = COALESCE(?, ist) WHERE id = ?')
        .run(b.soll ? JSON.stringify(b.soll) : null, b.ist ? JSON.stringify(b.ist) : null, zug.id);
      await audit(db, u.id, 'zug', zug.id, 'bestand', { soll: b.soll, ist: b.ist });
    }
    res.json((await zugOf(zug.id)));
  });

  /** Gruppen of a Zug: the list as a whole (new ones without id, missing ones are removed). */
  r.put('/zuege/:id/gruppen', async (req, res) => {
    const u = user(req);
    const zug = await zugOf(idParam(req));
    await ensureKpInBat(u, zug.kpId);
    ensure(canEditZugAssignment(u, zug.kpId));
    const part = z.object({ kader: count, sdt: count }).transform((b) => ({ zfhr: 0, ...b }));
    const { items } = parse(
      z.object({
        items: z
          .array(z.object({ id: z.number().int().optional(), name: z.string().trim().min(1, 'srv.nameDerGruppeFehlt').max(60), leiterUserId: z.number().int().nullable().default(null), soll: part, ist: part }))
          .max(20),
      }),
      req.body,
    );
    for (const g of items.filter((x) => x.leiterUserId !== null)) {
      const l = (await db.prepare('SELECT kp_id, role FROM app_user WHERE id = ?').get(g.leiterUserId)) as any;
      if (!l || l.kp_id !== zug.kpId || l.role === 'BAT') throw new HttpError(400, 'srv.ungueltigeRGruppenfuehrerInBei', undefined, { a: g.name });
    }
    await tx(db, async () => {
      const keep = items.map((g) => g.id).filter((id): id is number => id !== undefined);
      const existing = ((await db.prepare('SELECT id FROM gruppe WHERE zug_id = ?').all(zug.id)) as any[]).map((x) => x.id as number);
      for (const id of existing.filter((x) => !keep.includes(x))) await db.prepare('DELETE FROM gruppe WHERE id = ?').run(id);
      for (const [i, g] of items.entries()) {
        const args = [g.name, i, g.leiterUserId, JSON.stringify(g.soll), JSON.stringify(g.ist)];
        if (g.id !== undefined && existing.includes(g.id)) await db.prepare('UPDATE gruppe SET name = ?, sort = ?, leiter_user_id = ?, soll = ?, ist = ? WHERE id = ?').run(...args, g.id);
        else await db.prepare('INSERT INTO gruppe (name, sort, leiter_user_id, soll, ist, zug_id) VALUES (?, ?, ?, ?, ?, ?)').run(...args, zug.id);
      }
    });
    await audit(db, u.id, 'zug', zug.id, 'gruppen', { count: items.length });
    res.json(await zugOf(zug.id));
  });

  r.delete('/zuege/:id', async (req, res) => {
    const u = user(req);
    const zug = await zugOf(idParam(req));
    await ensureKpInBat(u, zug.kpId);
    ensure(canEditZugAssignment(u, zug.kpId));
    const used = (await db.prepare('SELECT COUNT(*) AS n FROM block WHERE block.zug_ids::jsonb @> jsonb_build_array(?::int)').get(zug.id)) as any;
    if (used.n > 0) throw new HttpError(409, 'srv.zugWirdImArbeitsprogrammVerwendet');
    await db.prepare('DELETE FROM zug WHERE id = ?').run(zug.id);
    res.json({ ok: true });
  });

  // ---- Users ----
  const validateUserTarget = async (u: SessionUser, b: z.infer<typeof userInput>) => {
    if (b.role === 'BAT' || b.role === 'ADMIN') {
      b.kpId = null;
      b.zugId = null;
    } else {
      if (b.kpId == null) throw new HttpError(400, 'srv.kompanieErforderlich');
      await ensureKpInBat(u, b.kpId);
      if (b.role === 'KPKDT') b.zugId = null;
      if (b.zugId != null && (await zugOf(b.zugId)).kpId !== b.kpId) throw new HttpError(400, 'srv.zugGehoertNichtZurKompanie');
    }
    ensure(canManageUser(u, { role: b.role, kpId: b.kpId, batId: u.batId }));
  };

  r.post('/users', async (req, res) => {
    const u = user(req);
    const b = parse(userInput, req.body);
    await validateUserTarget(u, b);
    if (!b.password) throw new HttpError(400, 'srv.passwortErforderlichMindZeichen');
    const exists = await db.prepare('SELECT 1 FROM app_user WHERE lower(email) = lower(?)').get(b.email);
    if (exists) throw new HttpError(409, 'srv.eMailBereitsVergeben');
    const { lastInsertRowid } = await db
      .prepare('INSERT INTO app_user (name, email, pw_hash, role, bat_id, kp_id, zug_id, funktion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(b.name, b.email, hashPassword(b.password), b.role, u.batId, b.kpId, b.zugId, b.funktion);
    await audit(db, u.id, 'user', Number(lastInsertRowid), 'create', { email: b.email, role: b.role });
    res.status(201).json(toUser((await db.prepare('SELECT * FROM app_user WHERE id = ?').get(lastInsertRowid))!));
  });

  r.patch('/users/:id', async (req, res) => {
    const u = user(req);
    const id = idParam(req);
    const row = await db.prepare('SELECT * FROM app_user WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'srv.benutzerNichtGefunden');
    const existing = toUser(row);
    ensure(canManageUser(u, existing));
    const b = parse(userInput, { ...existing, ...req.body });
    await validateUserTarget(u, b);
    await db.prepare('UPDATE app_user SET name = ?, email = ?, role = ?, kp_id = ?, zug_id = ?, funktion = ? WHERE id = ?').run(
      b.name,
      b.email,
      b.role,
      b.kpId,
      b.zugId,
      b.funktion,
      id,
    );
    if (b.password) await db.prepare('UPDATE app_user SET pw_hash = ? WHERE id = ?').run(hashPassword(b.password), id);
    // Someone who leaves a Zug (or is no longer Zugführer) is no longer its main Zugführer.
    if (b.role !== 'ZFHR') await db.prepare('UPDATE zug SET zfhr_user_id = NULL WHERE zfhr_user_id = ?').run(id);
    else await db.prepare('UPDATE zug SET zfhr_user_id = NULL WHERE zfhr_user_id = ? AND id IS DISTINCT FROM ?::int').run(id, b.zugId);
    await audit(db, u.id, 'user', id, 'update', { role: b.role, kpId: b.kpId, zugId: b.zugId });
    res.json(toUser((await db.prepare('SELECT * FROM app_user WHERE id = ?').get(id))!));
  });

  r.delete('/users/:id', async (req, res) => {
    const u = user(req);
    const id = idParam(req);
    if (id === u.id) throw new HttpError(400, 'srv.eigenesKontoKannNichtGeloescht');
    const row = await db.prepare('SELECT * FROM app_user WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'srv.benutzerNichtGefunden');
    ensure(canManageUser(u, toUser(row)));
    await db.prepare('DELETE FROM app_user WHERE id = ?').run(id);
    await audit(db, u.id, 'user', id, 'delete');
    res.json({ ok: true });
  });

  return r;
}
