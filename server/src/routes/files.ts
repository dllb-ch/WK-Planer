// Files: attachments of Ausbildungsvorbereitungen and the file area of each Zug (stored in Postgres).
import express from 'express';
import type { Response } from 'express';
import type { DB } from '../db';
import { audit } from '../db';
import { asyncRouter, ensure, HttpError, idParam, user } from '../http';
import { loadWk, toAv } from '../repo';
import {
  canDeleteZugFile,
  canEditAv,
  canEditErkundung,
  canEditUebung,
  canUploadZugFiles,
  canViewAvFiles,
  canViewErkundung,
  canViewWk,
  canViewZugFiles,
} from '../../../shared/permissions';
import { normalizeUebung } from '../../../shared/einsatz';
import { MAX_UPLOAD_MB, type Attachment, type SessionUser } from '../../../shared/types';

// Opened in the browser; everything else is downloaded, so that uploaded HTML, SVG … never runs in the app.
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'text/plain']);

const upload = express.raw({ type: () => true, limit: `${MAX_UPLOAD_MB}mb` });

/** Name and type from the headers (the body is the raw file). */
function incoming(req: express.Request) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Leere Datei');
  const name = decodeURIComponent(String(req.headers['x-filename'] ?? 'Datei')).replace(/[\\/\0]/g, '_').trim().slice(0, 200) || 'Datei';
  const mime = String(req.headers['x-mime'] ?? '').toLowerCase();
  return { name, mime: /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : 'application/octet-stream', data: req.body as Buffer };
}

function send(res: Response, f: { name: string; mime: string; data: Buffer }) {
  const inline = INLINE.has(f.mime);
  res.setHeader('Content-Type', inline ? f.mime : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (f.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; media-src 'self'");
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(f.data);
}

const LIST = `SELECT a.id, a.name, a.mime, a.size, a.uploaded_at, a.uploaded_by, app_user.name AS uploaded_by_name
  FROM attachment a LEFT JOIN app_user ON app_user.id = a.uploaded_by`;

export function filesRouter(db: DB) {
  const r = asyncRouter();

  const avOf = async (id: number) => {
    const row = await db.prepare('SELECT * FROM ausbildungsvorbereitung WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Ausbildungsvorbereitung nicht gefunden');
    const av = toAv(row);
    return { av, wk: await loadWk(db, av.wkId) };
  };
  const zugOf = async (id: number) => {
    const z = (await db.prepare('SELECT zug.id, zug.kp_id, kompanie.bat_id FROM zug JOIN kompanie ON kompanie.id = zug.kp_id WHERE zug.id = ?').get(id)) as any;
    if (!z) throw new HttpError(404, 'Zug nicht gefunden');
    return { id: z.id as number, kpId: z.kp_id as number, batId: z.bat_id as number };
  };
  const list = async (where: string, id: number, canDelete: (uploadedBy: number | null) => boolean): Promise<Attachment[]> =>
    ((await db.prepare(`${LIST} WHERE ${where} = ? ORDER BY a.uploaded_at DESC, a.id DESC`).all(id)) as any[]).map((a) => ({
      id: a.id,
      name: a.name,
      mime: a.mime,
      size: a.size,
      uploadedAt: a.uploaded_at,
      uploadedByName: a.uploaded_by_name ?? '',
      canDelete: canDelete(a.uploaded_by),
    }));
  const insert = async (u: SessionUser, owner: 'av_id' | 'zug_id' | 'erkundung_id' | 'uebung_id', id: number, f: ReturnType<typeof incoming>) => {
    const { lastInsertRowid } = await db
      .prepare(`INSERT INTO attachment (${owner}, name, mime, size, data, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, f.name, f.mime, f.data.length, f.data, u.id);
    await audit(db, u.id, 'attachment', Number(lastInsertRowid), 'upload', { [owner]: id, name: f.name, size: f.data.length });
    return Number(lastInsertRowid);
  };

  // ---- Ausbildungsvorbereitung ----

  r.get('/avs/:avId/attachments', async (req, res) => {
    const u = user(req);
    const { av, wk } = await avOf(idParam(req, 'avId'));
    ensure(canViewAvFiles(u, wk, av));
    const editable = canEditAv(u, wk, av);
    res.json(await list('a.av_id', av.id, () => editable));
  });

  r.post('/avs/:avId/attachments', upload, async (req, res) => {
    const u = user(req);
    const { av, wk } = await avOf(idParam(req, 'avId'));
    ensure(canEditAv(u, wk, av));
    const id = await insert(u, 'av_id', av.id, incoming(req));
    res.status(201).json({ id });
  });

  /** «Als Vorlage verwenden»: the attachments of the original come along. */
  r.post('/avs/:avId/attachments/copy', async (req, res) => {
    const u = user(req);
    const { av, wk } = await avOf(idParam(req, 'avId'));
    ensure(canEditAv(u, wk, av));
    const from = await avOf(Number(req.body?.fromAvId));
    ensure(canViewAvFiles(u, from.wk, from.av));
    const { changes } = await db
      .prepare('INSERT INTO attachment (av_id, name, mime, size, data, uploaded_by) SELECT ?::int, name, mime, size, data, ?::int FROM attachment WHERE av_id = ?')
      .run(av.id, u.id, from.av.id);
    res.json({ copied: changes });
  });

  // ---- Erkundung (Skizze, Fotos) and Übung (Übungsunterlagen) ----

  const erkundungOf = async (id: number) => {
    const row = (await db.prepare('SELECT id, wk_id, zug_id, created_by FROM erkundung WHERE id = ?').get(id)) as any;
    if (!row) throw new HttpError(404, 'Erkundung nicht gefunden');
    return { e: { id: row.id as number, zugId: row.zug_id as number | null, createdBy: row.created_by as number }, wk: await loadWk(db, row.wk_id) };
  };
  const uebungOf = async (id: number) => {
    const row = (await db.prepare('SELECT id, wk_id, created_by, data FROM uebung WHERE id = ?').get(id)) as any;
    if (!row) throw new HttpError(404, 'Übung nicht gefunden');
    const data = normalizeUebung(JSON.parse(row.data || '{}'));
    return { x: { id: row.id as number, createdBy: row.created_by as number, leitungUserIds: data.leitungUserIds }, wk: await loadWk(db, row.wk_id) };
  };

  r.get('/erkundungen/:eid/attachments', async (req, res) => {
    const u = user(req);
    const { e, wk } = await erkundungOf(idParam(req, 'eid'));
    ensure(canViewErkundung(u, wk, e));
    const editable = canEditErkundung(u, wk, e);
    res.json(await list('a.erkundung_id', e.id, () => editable));
  });
  r.post('/erkundungen/:eid/attachments', upload, async (req, res) => {
    const u = user(req);
    const { e, wk } = await erkundungOf(idParam(req, 'eid'));
    ensure(canEditErkundung(u, wk, e));
    res.status(201).json({ id: await insert(u, 'erkundung_id', e.id, incoming(req)) });
  });
  r.get('/uebungen/:uid/attachments', async (req, res) => {
    const u = user(req);
    const { x, wk } = await uebungOf(idParam(req, 'uid'));
    ensure(canViewWk(u, wk));
    const editable = canEditUebung(u, wk, x);
    res.json(await list('a.uebung_id', x.id, () => editable));
  });
  r.post('/uebungen/:uid/attachments', upload, async (req, res) => {
    const u = user(req);
    const { x, wk } = await uebungOf(idParam(req, 'uid'));
    ensure(canEditUebung(u, wk, x));
    res.status(201).json({ id: await insert(u, 'uebung_id', x.id, incoming(req)) });
  });

  // ---- File area of a Zug ----

  r.get('/zuege/:zugId/files', async (req, res) => {
    const u = user(req);
    const z = await zugOf(idParam(req, 'zugId'));
    ensure(canViewZugFiles(u, z));
    res.json(await list('a.zug_id', z.id, (by) => canDeleteZugFile(u, z, by)));
  });

  r.post('/zuege/:zugId/files', upload, async (req, res) => {
    const u = user(req);
    const z = await zugOf(idParam(req, 'zugId'));
    ensure(canUploadZugFiles(u, z));
    const id = await insert(u, 'zug_id', z.id, incoming(req));
    res.status(201).json({ id });
  });

  // ---- Download and delete (both kinds) ----

  /** May the user see (and delete) this file? */
  const access = async (u: SessionUser, id: number) => {
    const f = (await db.prepare('SELECT id, av_id, zug_id, erkundung_id, uebung_id, uploaded_by, name FROM attachment WHERE id = ?').get(id)) as any;
    if (!f) throw new HttpError(404, 'Datei nicht gefunden');
    if (f.erkundung_id) {
      const { e, wk } = await erkundungOf(f.erkundung_id);
      return { f, view: canViewErkundung(u, wk, e), del: canEditErkundung(u, wk, e) };
    }
    if (f.uebung_id) {
      const { x, wk } = await uebungOf(f.uebung_id);
      return { f, view: canViewWk(u, wk), del: canEditUebung(u, wk, x) };
    }
    if (f.av_id) {
      const { av, wk } = await avOf(f.av_id);
      return { f, view: canViewAvFiles(u, wk, av), del: canEditAv(u, wk, av) };
    }
    const z = await zugOf(f.zug_id);
    return { f, view: canViewZugFiles(u, z), del: canDeleteZugFile(u, z, f.uploaded_by) };
  };

  r.get('/attachments/:id', async (req, res) => {
    const u = user(req);
    const { f, view } = await access(u, idParam(req));
    ensure(view);
    const row = (await db.prepare('SELECT name, mime, data FROM attachment WHERE id = ?').get(f.id)) as any;
    send(res, { name: row.name, mime: row.mime, data: Buffer.from(row.data) });
  });

  r.delete('/attachments/:id', async (req, res) => {
    const u = user(req);
    const { f, del } = await access(u, idParam(req));
    ensure(del);
    await db.prepare('DELETE FROM attachment WHERE id = ?').run(f.id);
    await audit(db, u.id, 'attachment', f.id, 'delete', { name: f.name });
    res.json({ ok: true });
  });

  return r;
}
