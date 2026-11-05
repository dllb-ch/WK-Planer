import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DB } from './db';
import { authRouter, requireAuth, sessionMiddleware } from './auth';
import { errorHandler, HttpError } from './http';
import { gate } from './gate';
import { orgRouter } from './routes/org';
import { wkRouter } from './routes/wks';
import { docsRouter } from './routes/docs';
import { zugRouter } from './routes/zug';
import { resourceRouter } from './routes/resources';
import { vorbereitungRouter } from './routes/vorbereitung';
import { personalRouter, publicRouter } from './routes/personal';
import { rapportRouter } from './routes/rapporte';
import { filesRouter } from './routes/files';
import { einsatzRouter } from './routes/einsatz';

export function createApp(db: DB, env: NodeJS.ProcessEnv = process.env) {
  const app = express();
  app.disable('x-powered-by');
  // Behind Traefik: the client address comes from X-Forwarded-For.
  if (env.TRUST_PROXY) app.set('trust proxy', Number(env.TRUST_PROXY) || env.TRUST_PROXY);
  if (env.GATE_PASSWORD) app.use(gate({ user: env.GATE_USER || 'zivilschutz', password: env.GATE_PASSWORD }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware(db));

  app.use('/api/auth', authRouter(db));
  // QR check-in: without login.
  app.use('/api/public', publicRouter(db));
  // An archived WK is read only; it can only be restored or deleted.
  app.use('/api/wks/:id', requireAuth, async (req, _res, next) => {
    if (req.method === 'GET' || (req.method === 'POST' && req.path === '/archive') || (req.method === 'DELETE' && req.path === '/')) return next();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return next();
    try {
      const row = (await db.prepare('SELECT archived FROM wk WHERE id = ?').get(id)) as { archived: boolean } | undefined;
      next(row?.archived ? new HttpError(409, 'Der WK ist archiviert – zuerst wiederherstellen') : undefined);
    } catch (e) {
      next(e);
    }
  });
  app.use('/api', requireAuth, orgRouter(db), wkRouter(db), docsRouter(db), zugRouter(db), resourceRouter(db), vorbereitungRouter(db), personalRouter(db), rapportRouter(db), filesRouter(db), einsatzRouter(db));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Nicht gefunden' }));

  // In production the server also serves the built client.
  const dist = resolve(import.meta.dirname, '../../client/dist');
  if (existsSync(dist)) {
    // The service worker, the page and the manifest are always revalidated, so a new version reaches open tabs;
    // the hashed files under /assets/ can be cached for good.
    const fresh = /(^|\/)(sw\.js|workbox-[^/]*\.js|index\.html|manifest\.webmanifest)$/;
    app.use(
      express.static(dist, {
        setHeaders: (res, path) => {
          if (fresh.test(path)) res.setHeader('Cache-Control', 'no-cache');
          else if (path.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('*', (_req, res) => res.setHeader('Cache-Control', 'no-cache').sendFile(resolve(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
