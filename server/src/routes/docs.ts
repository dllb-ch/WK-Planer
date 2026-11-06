import express from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { audit, tx } from '../db';
import { ensure, HttpError, idParam, parse, user, asyncRouter, langOf } from '../http';
import { syncWksFromBefehl } from '../wkService';
import { loadWk, toComment, toZug } from '../repo';
import {
  canComment,
  canEditBefehl,
  canEditKonzept,
  canEditZfhr,
  canViewAuftrag,
  canViewBefehl,
  canViewWk,
  canViewZfhr,
} from '../../../shared/permissions';
import type { Ausbildungsbefehl, WkKonzept, ZfhrProgramm } from '../../../shared/types';

const isoDateOrEmpty = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

const befehlInput = z.object({
  dienstart: z.string().default(''),
  leitziel: z.string().default(''),
  absicht: z.string().default(''),
  organisation: z.string().default(''),
  besonderes: z.string().default(''),
  auftraege: z
    .array(
      z.object({
        kpId: z.number().int(),
        richtziele: z.string().default(''),
        teilnehmende: z.string().default(''),
        kvkDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(10).default([]),
        wkFrom: isoDateOrEmpty.default(''),
        wkTo: isoDateOrEmpty.default(''),
      }),
    )
    .default([]),
});

const konzeptInput = z.object({
  orientierung: z.string().default(''),
  organisation: z.string().default(''),
  absicht: z.string().default(''),
  // Earlier versions stored plain texts (for all Züge).
  zielsetzungen: z
    .array(z.union([z.string().transform((text) => ({ text, zugIds: [] as number[] })), z.object({ text: z.string(), zugIds: z.array(z.number().int()).default([]) })]))
    .default([]),
  verpflegung: z.string().default(''),
  material: z.string().default(''),
  standorte: z.string().default(''),
});

const zfhrInput = z.object({
  ziele: z.array(z.string()).default([]),
  gruppen: z.array(z.string()).default([]),
  posten: z
    .array(
      z.object({
        nr: z.number().int(),
        thema: z.string().default(''),
        ort: z.string().default(''),
        lernziel: z.string().default(''),
        material: z.string().default(''),
        postenchef: z.string().default(''),
      }),
    )
    .default([]),
  rotation: z.array(z.object({ blockId: z.number().int(), gruppe: z.string(), postenNr: z.number().int() })).default([]),
  zfhrAktivitaeten: z.string().default(''),
});

export function docsRouter(db: DB) {
  const r = asyncRouter();

  // ---- Comments ----

  r.get('/wks/:id/comments', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(u, wk));
    const rows = await db
      .prepare(
        `SELECT comment.*, app_user.name AS user_name FROM comment JOIN app_user ON app_user.id = comment.user_id
         WHERE wk_id = ? ORDER BY created_at, comment.id`,
      )
      .all(wk.id);
    res.json(rows.map(toComment));
  });

  r.post('/wks/:id/comments', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canComment(u, wk));
    const b = parse(z.object({ text: z.string().trim().min(1).max(4000), blockId: z.number().int().nullable().default(null) }), req.body);
    if (b.blockId != null && !(await db.prepare('SELECT 1 FROM block WHERE id = ? AND wk_id = ?').get(b.blockId, wk.id))) {
      throw new HttpError(400, 'srv.unbekannterBlock');
    }
    const { lastInsertRowid } = await db
      .prepare('INSERT INTO comment (wk_id, block_id, user_id, text) VALUES (?, ?, ?, ?)')
      .run(wk.id, b.blockId, u.id, b.text);
    const row = (await db
      .prepare('SELECT comment.*, app_user.name AS user_name FROM comment JOIN app_user ON app_user.id = comment.user_id WHERE comment.id = ?')
      .get(lastInsertRowid))!;
    res.status(201).json(toComment(row));
  });

  r.delete('/wks/:id/comments/:cid', async (req, res) => {
    const u = user(req);
    const row = (await db.prepare('SELECT * FROM comment WHERE id = ? AND wk_id = ?').get(idParam(req, 'cid'), idParam(req))) as any;
    if (!row) throw new HttpError(404, 'srv.kommentarNichtGefunden');
    ensure(row.user_id === u.id);
    await db.prepare('DELETE FROM comment WHERE id = ?').run(row.id);
    res.json({ ok: true });
  });

  // ---- Ausbildungsbefehl (per Bat and year) ----

  const loadBefehl = async (batId: number, year: number): Promise<Ausbildungsbefehl | null> => {
    const row = (await db.prepare('SELECT * FROM befehl WHERE bat_id = ? AND year = ?').get(batId, year)) as any;
    if (!row) return null;
    const auftraege = (
      (await db
        .prepare('SELECT a.*, (SELECT MIN(id) FROM wk WHERE wk.befehl_id = a.befehl_id AND wk.kp_id = a.kp_id) AS wk_id FROM auftrag_kp a WHERE befehl_id = ?')
        .all(row.id)) as any[]
    ).map((a) => ({
      kpId: a.kp_id,
      richtziele: a.richtziele,
      teilnehmende: a.teilnehmende,
      kvkDates: JSON.parse(a.kvk_dates ?? '[]'),
      wkFrom: a.wk_from,
      wkTo: a.wk_to,
      wkId: a.wk_id ?? null,
    }));
    return {
      id: row.id,
      batId: row.bat_id,
      year: row.year,
      dienstart: row.dienstart,
      leitziel: row.leitziel,
      absicht: row.absicht,
      organisation: row.organisation,
      besonderes: row.besonderes,
      auftraege,
      files: ((await db.prepare('SELECT id, name, size, uploaded_at FROM befehl_file WHERE befehl_id = ? ORDER BY id').all(row.id)) as any[]).map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        uploadedAt: f.uploaded_at,
      })),
    };
  };

  r.get('/befehle', async (req, res) => {
    const u = user(req);
    ensure(canViewBefehl(u));
    res.json((await db.prepare('SELECT year FROM befehl WHERE bat_id = ? ORDER BY year DESC').all(u.batId)).map((x: any) => x.year));
  });

  r.get('/befehle/:year', async (req, res) => {
    const u = user(req);
    ensure(canViewBefehl(u));
    const b = await loadBefehl(u.batId, idParam(req, 'year'));
    if (!b) return res.json(null);
    b.auftraege = b.auftraege.filter((a) => canViewAuftrag(u, a.kpId));
    res.json(b);
  });

  r.put('/befehle/:year', async (req, res) => {
    const u = user(req);
    ensure(canEditBefehl(u));
    const year = idParam(req, 'year');
    const b = parse(befehlInput, req.body);
    const kpIds = (await db.prepare('SELECT id FROM kompanie WHERE bat_id = ?').all(u.batId)).map((x: any) => x.id as number);
    if (b.auftraege.some((a) => !kpIds.includes(a.kpId))) throw new HttpError(400, 'srv.unbekannteKompanie');
    const wks = await tx(db, async () => {
      await db.prepare(
        `INSERT INTO befehl (bat_id, year, dienstart, leitziel, absicht, organisation, besonderes) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (bat_id, year) DO UPDATE SET dienstart = excluded.dienstart, leitziel = excluded.leitziel,
           absicht = excluded.absicht, organisation = excluded.organisation, besonderes = excluded.besonderes`,
      ).run(u.batId, year, b.dienstart, b.leitziel, b.absicht, b.organisation, b.besonderes);
      const { id } = (await db.prepare('SELECT id FROM befehl WHERE bat_id = ? AND year = ?').get(u.batId, year)) as any;
      await db.prepare('DELETE FROM auftrag_kp WHERE befehl_id = ?').run(id);
      const ins = db.prepare(
        'INSERT INTO auftrag_kp (befehl_id, kp_id, richtziele, teilnehmende, kvk_dates, wk_from, wk_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const a of b.auftraege) await ins.run(id, a.kpId, a.richtziele, a.teilnehmende, JSON.stringify([...new Set(a.kvkDates)].sort()), a.wkFrom, a.wkTo);
      await audit(db, u.id, 'befehl', id, 'save');
      // Each Kp with WK dates gets its WK.
      const auftraege = b.auftraege.map((a) => ({ ...a, kvkDates: [...new Set(a.kvkDates)].sort() }));
      return syncWksFromBefehl(db, u.id, u.batId, { id, year, dienstart: b.dienstart }, auftraege, langOf(req));
    });
    res.json({ ...(await loadBefehl(u.batId, year)), wks });
  });

  // ---- Attachments of the Befehl (PDF) ----

  const befehlIdOf = async (batId: number, year: number, create: boolean) => {
    const row = (await db.prepare('SELECT id FROM befehl WHERE bat_id = ? AND year = ?').get(batId, year)) as any;
    if (row) return row.id as number;
    if (!create) throw new HttpError(404, 'srv.keinAusbildungsbefehlFuerDiesesJahr');
    return Number((await db.prepare('INSERT INTO befehl (bat_id, year) VALUES (?, ?)').run(batId, year)).lastInsertRowid);
  };

  r.post('/befehle/:year/files', express.raw({ type: 'application/pdf', limit: '20mb' }), async (req, res) => {
    const u = user(req);
    ensure(canEditBefehl(u));
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'srv.bitteEinePdfDateiSenden');
    if (req.body.subarray(0, 5).toString() !== '%PDF-') throw new HttpError(400, 'srv.dieDateiIstKeinPdf');
    const name = decodeURIComponent(String(req.headers['x-filename'] ?? 'Ausbildungsbefehl.pdf')).slice(0, 200);
    const befehlId = await befehlIdOf(u.batId, idParam(req, 'year'), true);
    const { lastInsertRowid } = await db
      .prepare('INSERT INTO befehl_file (befehl_id, name, mime, size, data, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(befehlId, name, 'application/pdf', req.body.length, req.body, u.id);
    await audit(db, u.id, 'befehl_file', Number(lastInsertRowid), 'upload', { name });
    res.status(201).json({ id: Number(lastInsertRowid), name, size: req.body.length });
  });

  r.get('/befehle/:year/files/:fileId', async (req, res) => {
    const u = user(req);
    ensure(canViewBefehl(u));
    const befehlId = await befehlIdOf(u.batId, idParam(req, 'year'), false);
    const f = (await db.prepare('SELECT * FROM befehl_file WHERE id = ? AND befehl_id = ?').get(idParam(req, 'fileId'), befehlId)) as any;
    if (!f) throw new HttpError(404, 'srv.dateiNichtGefunden');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.send(Buffer.from(f.data));
  });

  r.delete('/befehle/:year/files/:fileId', async (req, res) => {
    const u = user(req);
    ensure(canEditBefehl(u));
    const befehlId = await befehlIdOf(u.batId, idParam(req, 'year'), false);
    await db.prepare('DELETE FROM befehl_file WHERE id = ? AND befehl_id = ?').run(idParam(req, 'fileId'), befehlId);
    res.json({ ok: true });
  });

  // ---- WK-Konzept ----

  const emptyKonzept = (wkId: number): WkKonzept => ({ wkId, ...konzeptInput.parse({}) });

  r.get('/wks/:id/konzept', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canViewWk(u, wk));
    const row = (await db.prepare('SELECT data FROM konzept WHERE wk_id = ?').get(wk.id)) as any;
    res.json(row ? { wkId: wk.id, ...konzeptInput.parse(JSON.parse(row.data)) } : emptyKonzept(wk.id));
  });

  r.put('/wks/:id/konzept', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    ensure(canEditKonzept(u, wk));
    const data = parse(konzeptInput, req.body);
    const own = new Set(((await db.prepare('SELECT id FROM zug WHERE kp_id = ?').all(wk.kpId)) as any[]).map((z) => z.id as number));
    data.zielsetzungen = data.zielsetzungen.map((z) => ({ ...z, zugIds: z.zugIds.filter((id) => own.has(id)) }));
    await db.prepare('INSERT INTO konzept (wk_id, data) VALUES (?, ?) ON CONFLICT (wk_id) DO UPDATE SET data = excluded.data').run(
      wk.id,
      JSON.stringify(data),
    );
    res.json({ wkId: wk.id, ...data });
  });

  // ---- Zugführerarbeitsprogramm ----

  const zugOfWk = async (kpId: number, zugId: number) => {
    const row = await db.prepare('SELECT * FROM zug WHERE id = ? AND kp_id = ?').get(zugId, kpId);
    if (!row) throw new HttpError(404, 'srv.zugNichtGefunden');
    return toZug(row);
  };

  r.get('/wks/:id/zfhr/:zugId', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const zug = await zugOfWk(wk.kpId, idParam(req, 'zugId'));
    ensure(canViewZfhr(u, wk, zug.id));
    const row = (await db.prepare('SELECT data FROM zfhr_programm WHERE wk_id = ? AND zug_id = ?').get(wk.id, zug.id)) as any;
    const data: ZfhrProgramm = { wkId: wk.id, zugId: zug.id, ...zfhrInput.parse(row ? JSON.parse(row.data) : {}) };
    res.json(data);
  });

  r.put('/wks/:id/zfhr/:zugId', async (req, res) => {
    const u = user(req);
    const wk = await loadWk(db, idParam(req));
    const zug = await zugOfWk(wk.kpId, idParam(req, 'zugId'));
    ensure(canEditZfhr(u, wk, zug.id));
    const data = parse(zfhrInput, req.body);
    await db.prepare(
      'INSERT INTO zfhr_programm (wk_id, zug_id, data) VALUES (?, ?, ?) ON CONFLICT (wk_id, zug_id) DO UPDATE SET data = excluded.data',
    ).run(wk.id, zug.id, JSON.stringify(data));
    res.json({ wkId: wk.id, zugId: zug.id, ...data });
  });

  return r;
}
