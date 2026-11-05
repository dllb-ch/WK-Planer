import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { SessionUser } from '../../shared/types';

/** Express 4 does not catch rejected promises; pass them on to the error handler. */
const wrap = (h: unknown) =>
  typeof h === 'function'
    ? (req: Request, res: Response, next: NextFunction) => {
        try {
          const out = (h as RequestHandler)(req, res, next) as unknown;
          if (out instanceof Promise) out.catch(next);
        } catch (e) {
          next(e);
        }
      }
    : h;

/** A Router whose handlers may be async. */
export function asyncRouter() {
  const r = Router();
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'use'] as const) {
    const orig = (r[m] as (...a: unknown[]) => unknown).bind(r);
    (r as any)[m] = (...args: unknown[]) => orig(...args.map(wrap));
  }
  return r;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const forbidden = () => new HttpError(403, 'Keine Berechtigung für diese Aktion');

/** Throws 403 unless the permission check passes. */
export function ensure(allowed: boolean): asserts allowed {
  if (!allowed) throw forbidden();
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export const idParam = (req: Request, name = 'id') => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n)) throw new HttpError(400, `Ungültige ${name}`);
  return n;
};

export const user = (req: Request): SessionUser => {
  if (!req.user) throw new HttpError(401, 'Nicht angemeldet');
  return req.user;
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.extra });
  } else if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Die Datei ist zu gross' });
  } else if (err instanceof ZodError) {
    res.status(400).json({ error: 'Ungültige Eingabe', issues: err.issues });
  } else {
    console.error(err);
    res.status(500).json({ error: 'Interner Fehler' });
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
