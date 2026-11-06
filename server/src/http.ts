import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { SessionUser } from '../../shared/types';
import { isLang, pickLang, translateMessage, type Lang, type Vars } from '../../shared/i18n';

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

/** A message for the client: German text, or a key of shared/i18n with its placeholders (translated on the way out). */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
    public vars?: Vars,
  ) {
    super(message);
  }
}

/** Language of a request: the client's choice (X-Lang), the user's, then the browser's (Accept-Language). */
export function langOf(req: Request): Lang {
  const x = req.get?.('x-lang');
  if (isLang(x)) return x;
  if (isLang(req.user?.lang)) return req.user.lang;
  return pickLang(req.get?.('accept-language'));
}

export const forbidden = () => new HttpError(403, 'srv.keineBerechtigungFuerDieseAktion');

/** Throws 403 unless the permission check passes. */
export function ensure(allowed: boolean): asserts allowed {
  if (!allowed) throw forbidden();
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export const idParam = (req: Request, name = 'id') => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n)) throw new HttpError(400, 'srv.ungueltige', undefined, { a: name });
  return n;
};

export const user = (req: Request): SessionUser => {
  if (!req.user) throw new HttpError(401, 'err.auth.required');
  return req.user;
};

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const lang = langOf(req);
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: translateMessage(lang, err.message, err.vars), ...err.extra });
  } else if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: translateMessage(lang, 'err.tooLarge') });
  } else if (err instanceof ZodError) {
    // Custom messages of the schemas are keys as well.
    res.status(400).json({ error: translateMessage(lang, 'err.invalidInput'), issues: err.issues.map((i) => ({ ...i, message: translateMessage(lang, i.message) })) });
  } else {
    console.error(err);
    res.status(500).json({ error: translateMessage(lang, 'err.internal') });
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
