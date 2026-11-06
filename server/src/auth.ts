import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { audit, type DB } from './db';
import { HttpError, parse, user, asyncRouter } from './http';
import { toSessionUser } from './repo';
import { LANGS } from '../../shared/i18n';

const COOKIE = 'zs_session';
const SESSION_DAYS = 14;

export const hashPassword = (pw: string) => bcrypt.hashSync(pw, 10);

/** Password of the seeded demo accounts (…@demo.ch); also in the README. */
export const DEMO_PASSWORD = 'zivilschutz';
const isDemo = (email: string) => email.toLowerCase().endsWith('@demo.ch');
const ROLE_ORDER = "CASE role WHEN 'ADMIN' THEN 0 WHEN 'BAT' THEN 1 WHEN 'KPKDT' THEN 2 WHEN 'LOGOF' THEN 3 WHEN 'ZFHR' THEN 4 ELSE 5 END";

/** Attaches req.user when a valid session cookie is present. */
export function sessionMiddleware(db: DB) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[COOKIE];
      if (token) {
        const row = await db
          .prepare('SELECT app_user.* FROM session JOIN app_user ON app_user.id = session.user_id WHERE token = ? AND expires_at > ?')
          .get(token, Date.now());
        if (row) req.user = toSessionUser(row);
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'err.auth.required'));
  next();
}

/** Signs the user in (session cookie) and answers with the session user. */
export async function startSessionFor(db: DB, res: Response, row: any) {
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await db.prepare('DELETE FROM session WHERE expires_at < ?').run(Date.now());
  await db.prepare('INSERT INTO session (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, row.id, expires);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 86400_000,
  });
  res.json(toSessionUser(row));
}

export function authRouter(db: DB) {
  const r = asyncRouter();
  const startSession = (res: Response, row: any) => startSessionFor(db, res, row);

  r.post('/login', async (req, res) => {
    const { email, password } = parse(z.object({ email: z.string(), password: z.string() }), req.body);
    const row = (await db.prepare('SELECT * FROM app_user WHERE lower(email) = lower(?)').get(email.trim())) as any;
    if (!row || !bcrypt.compareSync(password, row.pw_hash)) {
      throw new HttpError(401, 'err.auth.wrong');
    }
    await startSession(res, row);
  });

  // ---- Demo: switch between the demo accounts without typing the password ----

  /** Demo accounts, for a user signed in with one of them. */
  r.get('/demo-accounts', async (req, res) => {
    const u = user(req);
    if (!isDemo(u.email)) return res.json([]);
    const rows = (await db.prepare(`SELECT email, name, role, funktion FROM app_user WHERE lower(email) LIKE '%@demo.ch' ORDER BY ${ROLE_ORDER}, name`).all()) as any[];
    res.json(rows.map((r) => ({ email: r.email, name: r.name, role: r.role, funktion: r.funktion })));
  });

  /** Only between demo accounts that still have the public demo password: no more than logging in with it. */
  r.post('/demo-switch', async (req, res) => {
    const u = user(req);
    const { email } = parse(z.object({ email: z.string() }), req.body);
    const row = (await db.prepare('SELECT * FROM app_user WHERE lower(email) = lower(?)').get(email.trim())) as any;
    if (!isDemo(u.email) || !row || !isDemo(row.email) || !bcrypt.compareSync(DEMO_PASSWORD, row.pw_hash)) {
      throw new HttpError(403, 'err.auth.demoOnly');
    }
    const token = req.cookies?.[COOKIE];
    if (token) await db.prepare('DELETE FROM session WHERE token = ?').run(token);
    await startSession(res, row);
  });

  r.post('/logout', async (req, res) => {
    const token = req.cookies?.[COOKIE];
    if (token) await db.prepare('DELETE FROM session WHERE token = ?').run(token);
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    res.json(user(req));
  });

  r.post('/password', async (req, res) => {
    const u = user(req);
    const { oldPassword, newPassword } = parse(
      z.object({ oldPassword: z.string(), newPassword: z.string().min(8) }),
      req.body,
    );
    const row = (await db.prepare('SELECT pw_hash FROM app_user WHERE id = ?').get(u.id)) as any;
    if (!bcrypt.compareSync(oldPassword, row.pw_hash)) throw new HttpError(400, 'err.auth.wrongPassword');
    if (oldPassword === newPassword) throw new HttpError(400, 'err.auth.samePassword');
    await db.prepare('UPDATE app_user SET pw_hash = ? WHERE id = ?').run(hashPassword(newPassword), u.id);
    // Other devices have to sign in again with the new password.
    await db.prepare('DELETE FROM session WHERE user_id = ? AND token != ?').run(u.id, req.cookies?.[COOKIE] ?? '');
    await audit(db, u.id, 'user', u.id, 'password');
    res.json({ ok: true });
  });

  /** Own language of the interface (null = the browser's). */
  r.post('/lang', async (req, res) => {
    const u = user(req);
    const { lang } = parse(z.object({ lang: z.enum(LANGS).nullable() }), req.body);
    await db.prepare('UPDATE app_user SET lang = ? WHERE id = ?').run(lang, u.id);
    res.json(toSessionUser((await db.prepare('SELECT * FROM app_user WHERE id = ?').get(u.id))!));
  });

  /** Own e-mail (= login); confirmed with the current password. */
  r.post('/email', async (req, res) => {
    const u = user(req);
    const { password, email } = parse(z.object({ password: z.string(), email: z.string().trim().toLowerCase().email('srv.ungueltigeEMailAdresse').max(200) }), req.body);
    const row = (await db.prepare('SELECT * FROM app_user WHERE id = ?').get(u.id)) as any;
    if (!bcrypt.compareSync(password, row.pw_hash)) throw new HttpError(400, 'err.auth.wrongPassword');
    if (await db.prepare('SELECT 1 FROM app_user WHERE lower(email) = lower(?) AND id != ?').get(email, u.id)) {
      throw new HttpError(409, 'err.auth.emailTaken');
    }
    await db.prepare('UPDATE app_user SET email = ? WHERE id = ?').run(email, u.id);
    await audit(db, u.id, 'user', u.id, 'email', { from: row.email, to: email });
    res.json(toSessionUser((await db.prepare('SELECT * FROM app_user WHERE id = ?').get(u.id))!));
  });

  return r;
}
