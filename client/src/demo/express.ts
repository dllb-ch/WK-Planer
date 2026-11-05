// A small stand-in for Express in the browser demo: exactly what the server routes use (routers with «:param» paths,
// middleware with next/next(err), json/raw bodies, cookies, json/send/status/setHeader). Requests come from
// handle(), which turns a fetch Request into a Response.
import { Buffer } from 'buffer';

type Next = (err?: unknown) => void;
type Fn = (...a: any[]) => unknown;
interface Layer {
  method: string | null;
  re: RegExp;
  keys: string[];
  /** use(): matches the start of the path; routes match the whole path. */
  prefix: boolean;
  fns: Fn[];
}

export interface DemoRequest {
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  baseUrl: string;
  query: Record<string, string>;
  params: Record<string, string>;
  headers: Record<string, string>;
  body: any;
  rawBody: Uint8Array;
  cookies: Record<string, string>;
  ip: string;
  user?: unknown;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
  [k: string]: unknown;
}

function compile(path: string, prefix: boolean) {
  const keys: string[] = [];
  if (path === '*' || path === '/*') return { re: /^.*$/, keys };
  const src = path
    .replace(/\/$/, '')
    .split('/')
    .map((seg) => (seg.startsWith(':') ? (keys.push(seg.slice(1)), '([^/]+)') : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return { re: new RegExp(`^${src}${prefix ? '(?=/|$)' : '/?$'}`, 'i'), keys };
}

class RouterImpl {
  layers: Layer[] = [];
  private add(method: string | null, prefix: boolean, args: unknown[]) {
    const path = typeof args[0] === 'string' ? (args.shift() as string) : '/';
    const { re, keys } = compile(path, prefix);
    this.layers.push({ method, re, keys, prefix, fns: (args.flat() as Fn[]).filter(Boolean) });
    return this;
  }
  use(...a: unknown[]) {
    return this.add(null, true, a);
  }
  get(...a: unknown[]) {
    return this.add('GET', false, a);
  }
  post(...a: unknown[]) {
    return this.add('POST', false, a);
  }
  put(...a: unknown[]) {
    return this.add('PUT', false, a);
  }
  patch(...a: unknown[]) {
    return this.add('PATCH', false, a);
  }
  delete(...a: unknown[]) {
    return this.add('DELETE', false, a);
  }
  set() {
    return this;
  }
  disable() {
    return this;
  }

  /** Runs the matching layers in order; next(err) skips to error handlers (4 arguments). */
  dispatch(req: DemoRequest, res: DemoResponse, done: Next) {
    const path = req.path;
    const base = req.baseUrl;
    const params = req.params;
    let i = 0;
    const next: Next = (err?: unknown) => {
      req.path = path;
      req.baseUrl = base;
      req.params = params;
      if (err === 'route' || err === 'router') err = undefined;
      const layer = this.layers[i++];
      if (!layer) return done(err);
      if (layer.method && layer.method !== req.method && !(layer.method === 'GET' && req.method === 'HEAD')) return next(err);
      const m = layer.re.exec(path);
      if (!m) return next(err);
      const own = Object.fromEntries(layer.keys.map((k, j) => [k, decodeURIComponent(m[j + 1])]));
      const mounted = layer.prefix ? m[0] : '';
      let j = 0;
      const step: Next = (e?: unknown) => {
        const fn = layer.fns[j++];
        if (!fn) return next(e);
        req.params = { ...params, ...own };
        if (layer.prefix) {
          req.baseUrl = base + mounted;
          req.path = path.slice(mounted.length) || '/';
        }
        try {
          // An error only goes to error handlers (4 arguments); routers and other handlers are skipped.
          if (e !== undefined) return fn.length === 4 ? void fn(e, req, res, step) : step(e);
          if (fn.length === 4) return step();
          if (fn instanceof Function && (fn as any).__router) return (fn as any).__router.dispatch(req, res, (e2: unknown) => ((req.path = path), (req.baseUrl = base), step(e2)));
          const out = fn(req, res, step);
          if (out instanceof Promise) out.catch(step);
        } catch (x) {
          step(x);
        }
      };
      step(err);
    };
    next();
  }
}

/** Express routers are functions; so is this one (the server's asyncRouter wraps functions). */
export function Router() {
  const impl = new RouterImpl();
  const fn = ((req: DemoRequest, res: DemoResponse, next: Next) => impl.dispatch(req, res, next)) as any;
  for (const m of ['use', 'get', 'post', 'put', 'patch', 'delete', 'set', 'disable'] as const) fn[m] = (...a: unknown[]) => ((impl as any)[m](...a), fn);
  fn.__router = impl;
  return fn;
}

export class DemoResponse {
  statusCode = 200;
  headers = new Headers();
  body: BodyInit | null = null;
  headersSent = false;
  private resolve!: (r: Response) => void;
  done = new Promise<Response>((r) => (this.resolve = r));
  constructor(private jar: CookieJar) {}
  status(n: number) {
    this.statusCode = n;
    return this;
  }
  set(k: string | Record<string, string>, v?: string) {
    if (typeof k === 'string') this.headers.set(k, v ?? '');
    else for (const [a, b] of Object.entries(k)) this.headers.set(a, b);
    return this;
  }
  setHeader(k: string, v: string) {
    return this.set(k, v);
  }
  header(k: string, v: string) {
    return this.set(k, v);
  }
  getHeader(k: string) {
    return this.headers.get(k) ?? undefined;
  }
  type(t: string) {
    return this.set('Content-Type', t);
  }
  cookie(name: string, value: string, opts: { maxAge?: number; expires?: Date } = {}) {
    this.jar.set(name, value, opts.maxAge ?? (opts.expires ? opts.expires.getTime() - Date.now() : undefined));
    return this;
  }
  clearCookie(name: string) {
    this.jar.delete(name);
    return this;
  }
  json(obj: unknown) {
    if (!this.headers.has('Content-Type')) this.headers.set('Content-Type', 'application/json; charset=utf-8');
    return this.end(JSON.stringify(obj ?? null));
  }
  send(body?: unknown) {
    if (body === undefined || body === null) return this.end();
    if (body instanceof Uint8Array) return this.end(body);
    if (typeof body === 'object') return this.json(body);
    if (!this.headers.has('Content-Type')) this.headers.set('Content-Type', 'text/html; charset=utf-8');
    return this.end(String(body));
  }
  sendStatus(n: number) {
    return this.status(n).send(String(n));
  }
  end(body?: BodyInit | Uint8Array) {
    if (this.headersSent) return this;
    this.headersSent = true;
    const noBody = this.statusCode === 204 || this.statusCode === 304;
    this.resolve(new Response(noBody ? null : ((body as BodyInit) ?? null), { status: this.statusCode, headers: this.headers }));
    return this;
  }
}

/** Cookies of the demo «server», kept in localStorage so the login survives a reload. */
export class CookieJar {
  constructor(private key: string) {}
  private read(): Record<string, { v: string; until: number | null }> {
    try {
      return JSON.parse(localStorage.getItem(this.key) ?? '{}');
    } catch {
      return {};
    }
  }
  private write(all: Record<string, { v: string; until: number | null }>) {
    try {
      localStorage.setItem(this.key, JSON.stringify(all));
    } catch {
      // Private mode: the login lasts until the tab is closed.
    }
  }
  all() {
    const now = Date.now();
    return Object.fromEntries(Object.entries(this.read()).filter(([, c]) => c.until === null || c.until > now).map(([k, c]) => [k, c.v]));
  }
  set(name: string, v: string, maxAgeMs?: number) {
    this.write({ ...this.read(), [name]: { v, until: maxAgeMs === undefined ? null : Date.now() + maxAgeMs } });
  }
  delete(name: string) {
    const all = this.read();
    delete all[name];
    this.write(all);
  }
  clear() {
    this.write({});
  }
}

const tooLarge = (limit: string | number | undefined, size: number) => {
  const max = typeof limit === 'number' ? limit : limit ? parseFloat(limit) * (/mb$/i.test(limit) ? 1024 * 1024 : /kb$/i.test(limit) ? 1024 : 1) : Infinity;
  return size > max;
};

function json(opts: { limit?: string | number } = {}) {
  return (req: DemoRequest, _res: DemoResponse, next: Next) => {
    if (!/json/i.test(req.headers['content-type'] ?? '')) return next();
    if (tooLarge(opts.limit, req.rawBody.length)) return next(Object.assign(new Error('too large'), { type: 'entity.too.large', status: 413 }));
    try {
      req.body = req.rawBody.length ? JSON.parse(new TextDecoder().decode(req.rawBody)) : {};
      next();
    } catch (e) {
      next(Object.assign(new Error('Ungültiges JSON'), { status: 400, cause: e }));
    }
  };
}

function raw(opts: { type?: string | ((req: unknown) => boolean); limit?: string | number } = {}) {
  return (req: DemoRequest, _res: DemoResponse, next: Next) => {
    const ct = req.headers['content-type'] ?? '';
    const ok = typeof opts.type === 'function' ? opts.type(req) : !opts.type || ct.startsWith(opts.type);
    if (!ok) return next();
    if (tooLarge(opts.limit, req.rawBody.length)) return next(Object.assign(new Error('too large'), { type: 'entity.too.large', status: 413 }));
    req.body = Buffer.from(req.rawBody);
    next();
  };
}

const noop = () => (_req: unknown, _res: unknown, next: Next) => next();

/** express(): an app is a router. */
function express() {
  return Router();
}
express.Router = Router;
express.json = json;
express.raw = raw;
express.static = noop;
export default express;

/** Turns a fetch Request into a Response from the app (one request at a time, see start.ts). */
export async function handle(app: any, request: Request, jar: CookieJar): Promise<Response> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const cookies = jar.all();
  headers.cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
  const rawBody = request.method === 'GET' || request.method === 'HEAD' ? new Uint8Array() : new Uint8Array(await request.arrayBuffer());
  const req: DemoRequest = {
    method: request.method.toUpperCase(),
    url: url.pathname + url.search,
    originalUrl: url.pathname + url.search,
    path: url.pathname,
    baseUrl: '',
    query: Object.fromEntries(url.searchParams),
    params: {},
    headers,
    body: undefined,
    rawBody,
    cookies,
    ip: '127.0.0.1',
    get: (n: string) => headers[n.toLowerCase()],
    header: (n: string) => headers[n.toLowerCase()],
  };
  const res = new DemoResponse(jar);
  app.__router.dispatch(req, res, (err?: unknown) => {
    if (res.headersSent) return;
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Interner Fehler' });
    } else res.status(404).json({ error: 'Nicht gefunden' });
  });
  return res.done;
}
