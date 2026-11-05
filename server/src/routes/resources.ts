// Fahrzeuge, Räume und Geländeabschnitte: catalogue per Kp and requests per WK.
import { z } from 'zod';
import type { DB } from '../db';
import { audit } from '../db';
import { ensure, HttpError, idParam, parse, user, asyncRouter } from '../http';
import { loadBlock, loadWk, occupied as occupiedIn, toRequest, toResource, zuegeOfKp } from '../repo';
import {
  canAdministrate,
  canDecideRequest,
  canEditRequest,
  canManageResources,
  canRequestResource,
  canViewRequests,
  canViewZug,
} from '../../../shared/permissions';
import { KDO_ID, type Availability, type Booking, type Wk } from '../../../shared/types';
import { pickVehicles, wkDays } from '../../../shared/util';

const kind = z.enum(['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE']);
const area = z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).min(3).max(200).nullable();
const minutes = z.number().int().min(0).max(24 * 60);

const resourceInput = z.object({
  kind,
  category: z.string().trim().max(60).default(''),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(''),
  capacity: z.string().max(100).default(''),
  seats: z.number().int().min(0).max(100).default(0),
  nr: z.number().int().min(0).max(9999).nullable().default(null),
  area: area.default(null),
});

/** Vehicles, trailers, rooms, terrain; Bataillon material first; numbered ones by number, then by name. */
const RES_ORDER = `ORDER BY CASE kind WHEN 'FAHRZEUG' THEN 0 WHEN 'ANHAENGER' THEN 1 WHEN 'RAUM' THEN 2 ELSE 3 END,
  kp_id IS NOT NULL, nr IS NULL, nr, name`;

/** Seats from the field, or else from a capacity like «9 Pl.». */
const seatsOf = (b: { kind: string; seats: number; capacity: string }) =>
  b.kind !== 'FAHRZEUG' ? 0 : b.seats || Number(b.capacity.match(/(\d+)/)?.[1] ?? 0);

const requestInput = z.object({
  zugId: z.number().int(),
  blockId: z.number().int().nullable().default(null),
  resourceId: z.number().int().nullable().default(null),
  kind,
  category: z.string().trim().max(60).default(''),
  quantity: z.number().int().min(1).max(20).default(1),
  persons: z.number().int().min(0).max(500).default(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: minutes,
  endMin: minutes,
  zweck: z.string().trim().min(1, 'Zweck erforderlich').max(300),
  note: z.string().max(2000).default(''),
  area: area.default(null),
});

const REQ_SELECT = 'SELECT resource_request.*, app_user.name AS requested_by_name FROM resource_request JOIN app_user ON app_user.id = requested_by';

export function resourceRouter(db: DB) {
  const r = asyncRouter();

  const loadResource = async (id: number) => {
    const row = await db.prepare('SELECT * FROM resource WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Ressource nicht gefunden');
    return toResource(row);
  };
  const loadRequest = async (wkId: number, id: number) => {
    const row = await db.prepare(`${REQ_SELECT} WHERE resource_request.id = ? AND wk_id = ?`).get(id, wkId);
    if (!row) throw new HttpError(404, 'Anfrage nicht gefunden');
    return toRequest(row);
  };

  // ---- Catalogue ----

  const kpRef = async (kpId: number) => {
    const kp = (await db.prepare('SELECT bat_id FROM kompanie WHERE id = ?').get(kpId)) as any;
    if (!kp) throw new HttpError(404, 'Kompanie nicht gefunden');
    return { kpId, batId: kp.bat_id as number };
  };

  /** Material a Kp can use: its own and the shared material of its Bataillon. */
  r.get('/kompanien/:kpId/resources', async (req, res) => {
    const u = user(req);
    const kp = await kpRef(idParam(req, 'kpId'));
    ensure(canManageResources(u, kp) || (kp.batId === u.batId && (u.role === 'BAT' || u.kpId === kp.kpId)));
    res.json(
      (await db
        .prepare(`SELECT * FROM resource WHERE kp_id = ? OR (bat_id = ? AND kp_id IS NULL) ${RES_ORDER}`)
        .all(kp.kpId, kp.batId))
        .map(toResource),
    );
  });

  /** All material of a Bataillon (shared and per Kp), for the material overview. */
  r.get('/bataillone/:batId/resources', async (req, res) => {
    const u = user(req);
    const batId = idParam(req, 'batId');
    ensure(canAdministrate(u, batId));
    res.json((await db.prepare(`SELECT * FROM resource WHERE bat_id = ? ${RES_ORDER}`).all(batId)).map(toResource));
  });

  const scopeOf = async (batId: number, kpId: number | null) => {
    if (kpId !== null && (await kpRef(kpId)).batId !== batId) throw new HttpError(400, 'Kompanie gehört nicht zum Bataillon');
    return { batId, kpId };
  };

  const insertResource = async (batId: number, kpId: number | null, b: z.infer<typeof resourceInput>) =>
    Number(
      (await db
        .prepare('INSERT INTO resource (bat_id, kp_id, kind, category, name, description, capacity, seats, nr, area) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(batId, kpId, b.kind, b.category || b.name, b.name, b.description, b.capacity, seatsOf(b), b.nr, b.area ? JSON.stringify(b.area) : null))
        .lastInsertRowid,
    );

  r.post('/resources', async (req, res) => {
    const u = user(req);
    const b = parse(resourceInput.extend({ batId: z.number().int(), kpId: z.number().int().nullable() }), req.body);
    ensure(canManageResources(u, (await scopeOf(b.batId, b.kpId))));
    res.status(201).json((await loadResource((await insertResource(b.batId, b.kpId, b)))));
  });

  r.post('/kompanien/:kpId/resources', async (req, res) => {
    const u = user(req);
    const kp = await kpRef(idParam(req, 'kpId'));
    ensure(canManageResources(u, kp));
    res.status(201).json((await loadResource((await insertResource(kp.batId, kp.kpId, parse(resourceInput, req.body))))));
  });

  r.put('/resources/:id', async (req, res) => {
    const u = user(req);
    const existing = await loadResource(idParam(req));
    ensure(canManageResources(u, existing));
    const b = parse(resourceInput.extend({ kpId: z.number().int().nullable().optional() }), req.body);
    // Moving material between Kp and Bataillon needs the right on both sides.
    const kpId = b.kpId === undefined ? existing.kpId : b.kpId;
    ensure(canManageResources(u, (await scopeOf(existing.batId, kpId))));
    await db.prepare('UPDATE resource SET kp_id = ?, kind = ?, category = ?, name = ?, description = ?, capacity = ?, seats = ?, nr = ?, area = ? WHERE id = ?').run(
      kpId,
      b.kind,
      b.category || b.name,
      b.name,
      b.description,
      b.capacity,
      seatsOf(b),
      b.nr,
      b.area ? JSON.stringify(b.area) : null,
      existing.id,
    );
    res.json((await loadResource(existing.id)));
  });

  r.delete('/resources/:id', async (req, res) => {
    const u = user(req);
    const existing = await loadResource(idParam(req));
    ensure(canManageResources(u, existing));
    await db.prepare('DELETE FROM resource WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  });

  // ---- Occupancy ----

  /** Material a Kp can use: its own and the shared material of its Bataillon. */
  const usableResources = async (wk: Wk) =>
    (await db.prepare(`SELECT * FROM resource WHERE kp_id = ? OR (bat_id = ? AND kp_id IS NULL) ${RES_ORDER}`).all(wk.kpId, wk.batId)).map(toResource);

  const occupied = (batId: number, date: string, startMin: number, endMin: number, excludeId: number) =>
    occupiedIn(db, batId, date, startMin, endMin, excludeId);

  async function availability(wk: Wk, q: { kind: string; category: string; date: string; startMin: number; endMin: number; id: number }): Promise<Availability> {
    // Transport of people: any vehicle with seats, unless a type was chosen.
    const candidates = (await usableResources(wk)).filter((r) =>
      q.kind === 'FAHRZEUG' && q.category === '' ? r.kind === 'FAHRZEUG' && r.seats > 0 : r.kind === q.kind && r.category === q.category,
    );
    const used = await occupied(wk.batId, q.date, q.startMin, q.endMin, q.id);
    return { total: candidates.length, free: candidates.filter((r) => !used.has(r.id)) };
  }

  r.get('/wks/:id/availability', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewRequests(u, wk));
    const b = parse(
      z.object({
        kind,
        category: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start: z.coerce.number().int(),
        end: z.coerce.number().int(),
        exclude: z.coerce.number().int().default(-1),
      }),
      req.query,
    );
    res.json((await availability(wk, { kind: b.kind, category: b.category, date: b.date, startMin: b.start, endMin: b.end, id: b.exclude })));
  });

  // ---- Bookings across Kompanien ----

  /** One booking per vehicle/room held by a request; requests by amount without assignment yet appear once without resource. */
  async function bookingsOf(batId: number): Promise<Booking[]> {
    const rows = (await db
      .prepare(
        `SELECT q.*, wk.title AS wk_title, k.id AS kp_id, k.name AS kp_name, COALESCE(z.name, 'Kdo') AS zug_name, u.name AS requested_by_name
         FROM resource_request q
         JOIN wk ON wk.id = q.wk_id
         JOIN kompanie k ON k.id = wk.kp_id
         LEFT JOIN zug z ON z.id = q.zug_id
         JOIN app_user u ON u.id = q.requested_by
         WHERE k.bat_id = ? AND (q.resource_id IS NOT NULL OR q.kind != 'GELAENDE')
         ORDER BY q.date, q.start_min`,
      )
      .all(batId)) as any[];
    return rows.flatMap((r): Booking[] => {
      const base = {
        requestId: r.id,
        wkId: r.wk_id,
        wkTitle: r.wk_title,
        kpId: r.kp_id,
        kpName: r.kp_name,
        zugName: r.zug_name,
        date: r.date,
        startMin: r.start_min,
        endMin: r.end_min,
        zweck: r.zweck,
        status: r.status,
        requestedByName: r.requested_by_name,
        category: r.category,
        quantity: r.resource_id ? 1 : r.quantity,
        persons: r.persons,
      };
      const ids: number[] = r.resource_id ? [r.resource_id] : JSON.parse(r.assigned_ids);
      return ids.length ? ids.map((resourceId) => ({ ...base, resourceId })) : [{ ...base, resourceId: null }];
    });
  }

  /** Bookings of shared material by other WKs on the days of this WK (to warn about double bookings). */
  r.get('/wks/:id/bookings', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewRequests(u, wk));
    const days = wkDays(wk);
    const shared = new Set((await usableResources(wk)).filter((x) => x.kpId === null).map((x) => x.id));
    res.json(
      (await bookingsOf(wk.batId)).filter(
        (b) => b.wkId !== wk.id && b.status !== 'ABGELEHNT' && b.resourceId !== null && shared.has(b.resourceId) && days.includes(b.date),
      ),
    );
  });

  /** Every booking of the Bataillon's material (shared and per Kp). */
  r.get('/bataillone/:batId/bookings', async (req, res) => {
    const u = user(req);
    const batId = idParam(req, 'batId');
    ensure(canAdministrate(u, batId));
    res.json((await bookingsOf(batId)));
  });

  // ---- Requests ----

  async function validate(wk: Wk, b: z.infer<typeof requestInput>) {
    if (b.endMin <= b.startMin) throw new HttpError(400, 'Ende muss nach Beginn liegen');
    if (!wkDays(wk).includes(b.date)) throw new HttpError(400, 'Datum liegt ausserhalb des WK');
    if (b.zugId !== KDO_ID && !(await zuegeOfKp(db, wk.kpId)).some((z) => z.id === b.zugId)) throw new HttpError(400, 'Unbekannter Zug');
    if (b.blockId != null && !(await loadBlock(db, wk.id, b.blockId)).zugIds.includes(b.zugId)) {
      throw new HttpError(400, 'Der Block gehört nicht zu diesem Zug');
    }
    if (b.resourceId != null) {
      const res = await loadResource(b.resourceId);
      const usable = res.kpId === wk.kpId || (res.kpId === null && res.batId === wk.batId);
      if (!usable) throw new HttpError(400, 'Ressource gehört nicht zur Kompanie oder zum Bataillon');
      if (res.kind !== b.kind) throw new HttpError(400, 'Ressource passt nicht zur Art');
      // A specific vehicle or room counts as one of its type.
      b.category = res.category;
      b.quantity = 1;
      b.persons = 0;
    } else if (b.kind === 'GELAENDE') {
      if (!b.area) throw new HttpError(400, 'Bitte einen Geländeabschnitt wählen oder auf der Karte einzeichnen');
    } else if (b.persons > 0) {
      if (b.kind !== 'FAHRZEUG') throw new HttpError(400, 'Nach Anzahl Personen werden nur Fahrzeuge angefragt');
      if (b.category && !(await usableResources(wk)).some((x) => x.kind === 'FAHRZEUG' && x.category === b.category)) {
        throw new HttpError(400, `«${b.category}» gibt es im Katalog nicht`);
      }
      b.quantity = 1;
    } else {
      if (!b.category) throw new HttpError(400, 'Bitte einen Typ wählen (z. B. Mannschaftsbus) oder ein bestimmtes Fahrzeug bzw. einen Raum');
      if (!(await usableResources(wk)).some((x) => x.kind === b.kind && x.category === b.category)) {
        throw new HttpError(400, `«${b.category}» gibt es im Katalog nicht`);
      }
    }
  }

  r.get('/wks/:id/requests', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewRequests(u, wk));
    const list = (await db
      .prepare(`${REQ_SELECT} WHERE wk_id = ? ORDER BY date, start_min`)
      .all(wk.id))
      .map(toRequest)
      .filter((q) => q.zugId === KDO_ID || canViewZug(u, wk, q.zugId));
    res.json(list);
  });

  r.post('/wks/:id/requests', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const b = parse(requestInput, req.body);
    ensure(canRequestResource(u, wk, b.zugId));
    await validate(wk, b);
    const { lastInsertRowid } = await db
      .prepare(
        `INSERT INTO resource_request (wk_id, zug_id, block_id, resource_id, kind, category, quantity, persons, date, start_min, end_min, zweck, note, area, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        wk.id,
        b.zugId,
        b.blockId,
        b.resourceId,
        b.kind,
        b.category,
        b.quantity,
        b.persons,
        b.date,
        b.startMin,
        b.endMin,
        b.zweck,
        b.note,
        b.area ? JSON.stringify(b.area) : null,
        u.id,
      );
    await audit(db, u.id, 'request', Number(lastInsertRowid), 'create');
    res.status(201).json((await loadRequest(wk.id, Number(lastInsertRowid))));
  });

  r.put('/wks/:id/requests/:rid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const q = await loadRequest(wk.id, idParam(req, 'rid'));
    ensure(canEditRequest(u, wk, q));
    const b = parse(requestInput, req.body);
    ensure(canRequestResource(u, wk, b.zugId) || canDecideRequest(u, wk));
    await validate(wk, b);
    // A changed request needs a new decision.
    await db.prepare(
      `UPDATE resource_request SET zug_id = ?, block_id = ?, resource_id = ?, kind = ?, category = ?, quantity = ?, persons = ?, date = ?, start_min = ?,
         end_min = ?, zweck = ?, note = ?, area = ?, status = 'BEANTRAGT', assigned_ids = '[]', decided_by = NULL, decision_note = '' WHERE id = ?`,
    ).run(
      b.zugId,
      b.blockId,
      b.resourceId,
      b.kind,
      b.category,
      b.quantity,
      b.persons,
      b.date,
      b.startMin,
      b.endMin,
      b.zweck,
      b.note,
      b.area ? JSON.stringify(b.area) : null,
      q.id,
    );
    res.json((await loadRequest(wk.id, q.id)));
  });

  /**
   * Approve, reject or reopen. Approving a request by amount assigns concrete vehicles/rooms: the ones the
   * approver picked, or else the first free ones of the type.
   */
  r.post('/wks/:id/requests/:rid/decide', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const q = await loadRequest(wk.id, idParam(req, 'rid'));
    ensure(canDecideRequest(u, wk));
    const b = parse(
      z.object({
        status: z.enum(['BEWILLIGT', 'ABGELEHNT', 'BEANTRAGT']),
        note: z.string().max(1000).default(''),
        assignedIds: z.array(z.number().int()).max(20).optional(),
      }),
      req.body,
    );
    let assigned: number[] = [];
    if (b.status === 'BEWILLIGT') {
      const used = await occupied(wk.batId, q.date, q.startMin, q.endMin, q.id);
      if (q.resourceId != null) {
        if (used.has(q.resourceId)) throw new HttpError(409, 'Die Ressource ist in diesem Zeitraum bereits vergeben');
      } else if (q.persons > 0) {
        const { free } = await availability(wk, q);
        const seats = (ids: number[]) => ids.reduce((a, id) => a + (free.find((x) => x.id === id)?.seats ?? 0), 0);
        if (b.assignedIds) {
          if (b.assignedIds.some((id) => !free.some((x) => x.id === id))) {
            throw new HttpError(409, 'Mindestens ein gewähltes Fahrzeug ist in diesem Zeitraum nicht frei');
          }
          assigned = [...new Set(b.assignedIds)];
          if (seats(assigned) < q.persons) throw new HttpError(400, `Die gewählten Fahrzeuge haben ${seats(assigned)} von ${q.persons} Plätzen`);
        } else {
          assigned = pickVehicles(free, q.persons);
          if (!assigned.length) {
            const total = free.reduce((a, x) => a + x.seats, 0);
            throw new HttpError(409, `Nur ${total} von ${q.persons} Plätzen sind in diesem Zeitraum frei`);
          }
        }
      } else if (q.kind !== 'GELAENDE') {
        const { free } = await availability(wk, q);
        if (b.assignedIds) {
          const freeIds = new Set(free.map((x) => x.id));
          if (b.assignedIds.length !== q.quantity) throw new HttpError(400, `Bitte genau ${q.quantity} zuteilen`);
          const taken = b.assignedIds.filter((id) => !freeIds.has(id));
          if (taken.length) throw new HttpError(409, 'Mindestens eine gewählte Ressource ist in diesem Zeitraum nicht frei');
          assigned = [...new Set(b.assignedIds)];
        } else {
          if (free.length < q.quantity) {
            throw new HttpError(409, `Nur ${free.length} von ${q.quantity} «${q.category}» sind in diesem Zeitraum frei`);
          }
          assigned = free.slice(0, q.quantity).map((x) => x.id);
        }
      }
    }
    if (b.status === 'ABGELEHNT' && !b.note.trim()) throw new HttpError(400, 'Begründung erforderlich');
    await db.prepare('UPDATE resource_request SET status = ?, decision_note = ?, decided_by = ?, assigned_ids = ? WHERE id = ?').run(
      b.status,
      b.note,
      u.id,
      JSON.stringify(assigned),
      q.id,
    );
    await audit(db, u.id, 'request', q.id, 'decide', { ...b, assigned });
    res.json((await loadRequest(wk.id, q.id)));
  });

  r.delete('/wks/:id/requests/:rid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const q = await loadRequest(wk.id, idParam(req, 'rid'));
    ensure(canEditRequest(u, wk, q));
    await db.prepare('DELETE FROM resource_request WHERE id = ?').run(q.id);
    res.json({ ok: true });
  });

  return r;
}
