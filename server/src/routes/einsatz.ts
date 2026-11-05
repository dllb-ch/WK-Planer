// Erkundungsprotokolle, Übungen (Konzept, Drehbuch, Unterlagen, Besprechung) and the Tagesbefehl.
import { z } from 'zod';
import type { DB } from '../db';
import { audit } from '../db';
import { asyncRouter, ensure, HttpError, idParam, parse, user } from '../http';
import { loadBlock, loadWk, zuegeOfKp } from '../repo';
import {
  canCreateErkundung,
  canCreateUebung,
  canEditErkundung,
  canEditTagesbefehl,
  canViewTagesbefehl,
  canEditUebung,
  canViewErkundung,
  canViewWk,
} from '../../../shared/permissions';
import type { Erkundung, SessionUser, Tagesbefehl, Uebung, Wk } from '../../../shared/types';
import { emptyTagesbefehl, normalizeErkundung, normalizeUebung } from '../../../shared/einsatz';
import { wkDays } from '../../../shared/util';

const s = (max = 20000) => z.string().max(max).default('');
const risk = z.enum(['', 'HOCH', 'MITTEL', 'TIEF']).default('');
const area = z.array(z.tuple([z.number(), z.number()])).min(3).max(500).nullable().default(null);

const erkundungData = z.object({
  datum: s(10),
  zeit: s(5),
  formation: s(300),
  ort: s(300),
  koordinaten: s(100),
  area,
  dauerVon: s(10),
  dauerBis: s(10),
  kontakte: z.array(z.object({ institution: s(200), telefon: s(60), email: s(200) })).max(30).default([]),
  auftraege: s(),
  gefahren: z.object({ mensch: s(), material: s(), methode: s(), mitwelt: s() }).default({}),
  risiken: z.array(z.object({ risiko: s(2000), massnahmen: s(2000), wer: s(200), restrisiko: risk })).max(40).default([]),
  beurteilung: risk,
  notfall: z
    .object({ ort: s(300), spital: s(300), spitalTel: s(60), ambulanz: s(300), ambulanzTel: s(60), luftrettung: s(300), luftrettungTel: s(60), massnahmen: s() })
    .default({}),
  arbeiten: z.array(z.object({ was: s(2000), personal: s(60), verantwortung: s(200), mittel: s(2000) })).max(40).default([]),
  logistik: s(),
  checkliste: z.record(z.string().max(40), z.object({ state: z.enum(['', 'OK', 'OFFEN', 'NA']).default(''), note: s(1000) })).default({}),
  notizen: s(),
  verfasser: s(200),
});
const erkundungInput = erkundungData.extend({
  zugId: z.number().int().nullable(),
  blockId: z.number().int().nullable().default(null),
  title: z.string().trim().min(1, 'Titel erforderlich').max(200),
});

const uebungData = z.object({
  art: s(100),
  datum: s(10),
  zeitVon: s(5),
  zeitBis: s(5),
  ort: s(300),
  area,
  leitung: s(300),
  leitungUserIds: z.array(z.number().int()).max(20).default([]),
  beuebteZugIds: z.array(z.number().int()).max(20).default([]),
  zweck: s(),
  ziele: z.array(z.object({ text: s(2000), erreicht: z.enum(['', 'JA', 'TEILWEISE', 'NEIN']).default(''), bemerkung: s(2000) })).max(30).default([]),
  ausgangslage: s(),
  anlage: s(),
  mittel: s(),
  sicherheit: s(),
  beobachter: s(),
  verbindungen: s(),
  besonderes: s(),
  drehbuch: z
    .array(z.object({ zeit: s(5), von: s(200), an: s(200), einspielung: s(4000), erwartet: s(4000), mittel: s(200), erledigt: z.boolean().default(false) }))
    .max(300)
    .default([]),
  unterlagenLage: s(),
  unterlagenAuftrag: s(),
  unterlagenHinweise: s(),
  besprechung: z.object({ datum: s(10), verlauf: s(), positiv: s(), verbessern: s(), massnahmen: s() }).default({}),
});
const uebungInput = uebungData.extend({
  blockId: z.number().int().nullable().default(null),
  title: z.string().trim().min(1, 'Titel erforderlich').max(200),
});

const tagesbefehlInput = z.object({
  tagesverantwortlicher: s(300),
  tenue: s(1000),
  besonderes: s(),
  sicherheit: s(),
  erreichbarkeit: s(),
});

const NOW = "to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')";
const count = (col: string, table: string) => `(SELECT COUNT(*) FROM attachment a WHERE a.${col} = ${table}.id) AS attachment_count`;

const toErkundung = (r: any): Erkundung => ({
  ...normalizeErkundung(JSON.parse(r.data || '{}')),
  id: r.id,
  wkId: r.wk_id,
  zugId: r.zug_id,
  blockId: r.block_id,
  title: r.title,
  createdBy: r.created_by,
  createdByName: r.created_by_name ?? '',
  updatedAt: r.updated_at,
  attachmentCount: r.attachment_count ?? 0,
});

const toUebung = (r: any): Uebung => ({
  ...normalizeUebung(JSON.parse(r.data || '{}')),
  id: r.id,
  wkId: r.wk_id,
  blockId: r.block_id,
  title: r.title,
  createdBy: r.created_by,
  createdByName: r.created_by_name ?? '',
  updatedAt: r.updated_at,
  attachmentCount: r.attachment_count ?? 0,
});

/** Who is not part of the Übungsleitung does not see the Drehbuch (the Beübte should not know what comes). */
const forViewer = (u: SessionUser, wk: Wk, x: Uebung): Uebung => (canEditUebung(u, wk, x) ? x : { ...x, drehbuch: [], drehbuchHidden: true });

export function einsatzRouter(db: DB) {
  const r = asyncRouter();

  const ERK = `SELECT erkundung.*, app_user.name AS created_by_name, ${count('erkundung_id', 'erkundung')} FROM erkundung JOIN app_user ON app_user.id = created_by`;
  const UEB = `SELECT uebung.*, app_user.name AS created_by_name, ${count('uebung_id', 'uebung')} FROM uebung JOIN app_user ON app_user.id = created_by`;

  const checkRefs = async (wk: Wk, b: { zugId?: number | null; blockId: number | null; leitungUserIds?: number[]; beuebteZugIds?: number[] }) => {
    const zuege = new Set((await zuegeOfKp(db, wk.kpId)).map((z) => z.id));
    if (b.zugId != null && !zuege.has(b.zugId)) throw new HttpError(400, 'Unbekannter Zug');
    if (b.beuebteZugIds?.some((id) => !zuege.has(id))) throw new HttpError(400, 'Unbekannter Zug');
    if (b.blockId != null) await loadBlock(db, wk.id, b.blockId);
    if (b.leitungUserIds?.length) {
      // People of the Kp, and the Bat Kommando.
      const known = new Set(
        ((await db.prepare("SELECT id FROM app_user WHERE kp_id = ? OR (bat_id = ? AND role = 'BAT')").all(wk.kpId, wk.batId)) as any[]).map((x) => x.id),
      );
      if (b.leitungUserIds.some((id) => !known.has(id))) throw new HttpError(400, 'Übungsleitung: Person gehört nicht zur Kompanie');
    }
  };

  // ---- Erkundungen ----

  const loadErkundung = async (wk: Wk, id: number) => {
    const row = await db.prepare(`${ERK} WHERE erkundung.id = ? AND wk_id = ?`).get(id, wk.id);
    if (!row) throw new HttpError(404, 'Erkundung nicht gefunden');
    return toErkundung(row);
  };

  r.get('/wks/:id/erkundungen', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(u, wk));
    const list = ((await db.prepare(`${ERK} WHERE wk_id = ? ORDER BY erkundung.id`).all(wk.id)) as any[]).map(toErkundung);
    res.json(list.filter((e) => canViewErkundung(u, wk, e)));
  });

  r.get('/wks/:id/erkundungen/:eid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const e = await loadErkundung(wk, idParam(req, 'eid'));
    ensure(canViewErkundung(u, wk, e));
    res.json(e);
  });

  r.post('/wks/:id/erkundungen', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    // New protocol: the form's defaults (144, 1414 …) unless given.
    const { zugId, blockId, title, ...data } = parse(erkundungInput, { ...req.body, ...normalizeErkundung(req.body ?? {}) });
    ensure(canCreateErkundung(u, wk, zugId));
    await checkRefs(wk, { zugId, blockId });
    const { lastInsertRowid } = await db
      .prepare('INSERT INTO erkundung (wk_id, zug_id, block_id, title, data, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(wk.id, zugId, blockId, title, JSON.stringify({ ...data, verfasser: data.verfasser || u.name }), u.id);
    await audit(db, u.id, 'erkundung', Number(lastInsertRowid), 'create', { title });
    res.status(201).json(await loadErkundung(wk, Number(lastInsertRowid)));
  });

  r.put('/wks/:id/erkundungen/:eid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const e = await loadErkundung(wk, idParam(req, 'eid'));
    ensure(canEditErkundung(u, wk, e));
    const { zugId, blockId, title, ...data } = parse(erkundungInput, req.body);
    if (zugId !== e.zugId) ensure(canCreateErkundung(u, wk, zugId));
    await checkRefs(wk, { zugId, blockId });
    await db
      .prepare(`UPDATE erkundung SET zug_id = ?, block_id = ?, title = ?, data = ?, updated_at = ${NOW} WHERE id = ?`)
      .run(zugId, blockId, title, JSON.stringify(data), e.id);
    res.json(await loadErkundung(wk, e.id));
  });

  r.delete('/wks/:id/erkundungen/:eid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const e = await loadErkundung(wk, idParam(req, 'eid'));
    ensure(canEditErkundung(u, wk, e));
    await db.prepare('DELETE FROM erkundung WHERE id = ?').run(e.id);
    await audit(db, u.id, 'erkundung', e.id, 'delete', { title: e.title });
    res.json({ ok: true });
  });

  // ---- Übungen ----

  const loadUebung = async (wk: Wk, id: number) => {
    const row = await db.prepare(`${UEB} WHERE uebung.id = ? AND wk_id = ?`).get(id, wk.id);
    if (!row) throw new HttpError(404, 'Übung nicht gefunden');
    return toUebung(row);
  };

  r.get('/wks/:id/uebungen', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(u, wk));
    const list = ((await db.prepare(`${UEB} WHERE wk_id = ? ORDER BY uebung.id`).all(wk.id)) as any[]).map(toUebung);
    res.json(list.map((x) => forViewer(u, wk, x)));
  });

  r.get('/wks/:id/uebungen/:uid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(u, wk));
    res.json(forViewer(u, wk, await loadUebung(wk, idParam(req, 'uid'))));
  });

  r.post('/wks/:id/uebungen', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canCreateUebung(u, wk));
    const { blockId, title, ...data } = parse(uebungInput, { ...req.body, ...normalizeUebung(req.body ?? {}) });
    await checkRefs(wk, { blockId, leitungUserIds: data.leitungUserIds, beuebteZugIds: data.beuebteZugIds });
    const leitung = data.leitungUserIds.length ? data : { ...data, leitungUserIds: [u.id], leitung: data.leitung || u.name };
    const { lastInsertRowid } = await db
      .prepare('INSERT INTO uebung (wk_id, block_id, title, data, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(wk.id, blockId, title, JSON.stringify(leitung), u.id);
    await audit(db, u.id, 'uebung', Number(lastInsertRowid), 'create', { title });
    res.status(201).json(await loadUebung(wk, Number(lastInsertRowid)));
  });

  r.put('/wks/:id/uebungen/:uid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const x = await loadUebung(wk, idParam(req, 'uid'));
    ensure(canEditUebung(u, wk, x));
    const { blockId, title, ...data } = parse(uebungInput, req.body);
    await checkRefs(wk, { blockId, leitungUserIds: data.leitungUserIds, beuebteZugIds: data.beuebteZugIds });
    await db.prepare(`UPDATE uebung SET block_id = ?, title = ?, data = ?, updated_at = ${NOW} WHERE id = ?`).run(blockId, title, JSON.stringify(data), x.id);
    res.json(await loadUebung(wk, x.id));
  });

  r.delete('/wks/:id/uebungen/:uid', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const x = await loadUebung(wk, idParam(req, 'uid'));
    ensure(canEditUebung(u, wk, x));
    await db.prepare('DELETE FROM uebung WHERE id = ?').run(x.id);
    await audit(db, u.id, 'uebung', x.id, 'delete', { title: x.title });
    res.json({ ok: true });
  });

  // ---- Tagesbefehl (the part written by hand; the rest is generated in the client) ----

  r.get('/wks/:id/tagesbefehle', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewTagesbefehl(u, wk));
    const rows = new Map(((await db.prepare('SELECT date, data FROM tagesbefehl WHERE wk_id = ?').all(wk.id)) as any[]).map((x) => [x.date, JSON.parse(x.data)]));
    const out: Tagesbefehl[] = wkDays(wk).map((date) => ({ ...emptyTagesbefehl(), ...rows.get(date), wkId: wk.id, date }));
    res.json(out);
  });

  r.put('/wks/:id/tagesbefehle/:date', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canEditTagesbefehl(u, wk));
    const date = String(req.params.date);
    if (!wkDays(wk).includes(date)) throw new HttpError(400, 'Der Tag liegt nicht im WK');
    const data = parse(tagesbefehlInput, req.body);
    await db.prepare('INSERT INTO tagesbefehl (wk_id, date, data) VALUES (?, ?, ?) ON CONFLICT (wk_id, date) DO UPDATE SET data = excluded.data').run(
      wk.id,
      date,
      JSON.stringify(data),
    );
    res.json({ ...data, wkId: wk.id, date });
  });

  return r;
}
