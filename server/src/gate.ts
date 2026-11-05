// Optional password gate (HTTP Basic Auth) in front of the whole app, before its own login.
// Active when GATE_PASSWORD is set. The QR check-in stays reachable without it.
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// What a phone needs for the check-in: the page, its API and the static files of the app (incl. the icons and the
// app shell index.html that the service worker caches – the same file /checkin/… serves; it contains no data).
const PUBLIC = [
  /^\/checkin\//,
  /^\/api\/public\//,
  /^\/assets\//,
  /^\/icons\/[\w.-]+\.(png|svg|ico)$/,
  /^\/index\.html$/,
  /^\/(registerSW|sw|workbox-[\w-]+)\.js$/,
  /^\/manifest\.webmanifest$/,
  /^\/[\w-]+\.(png|svg|ico)$/,
];

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function gate(opts: { user: string; password: string }) {
  const failures = new Map<string, { n: number; since: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (PUBLIC.some((p) => p.test(req.path))) return next();
    // Behind Cloudflare every request comes from a Cloudflare address; it passes the visitor's one along.
    const ip = String(req.headers['cf-connecting-ip'] ?? req.ip ?? '');
    const f = failures.get(ip);
    if (f && Date.now() - f.since > WINDOW_MS) failures.delete(ip);
    if ((failures.get(ip)?.n ?? 0) >= MAX_FAILURES) {
      res.status(429).send('Zu viele Fehlversuche – bitte später erneut versuchen.');
      return;
    }
    const m = /^Basic (.+)$/.exec(req.headers.authorization ?? '');
    if (m) {
      const decoded = Buffer.from(m[1], 'base64').toString();
      const i = decoded.indexOf(':');
      if (i >= 0 && same(decoded.slice(0, i), opts.user) && same(decoded.slice(i + 1), opts.password)) {
        failures.delete(ip);
        return next();
      }
      const cur = failures.get(ip) ?? { n: 0, since: Date.now() };
      failures.set(ip, { n: cur.n + 1, since: cur.since });
    }
    res.set('WWW-Authenticate', 'Basic realm="WK-Planer", charset="UTF-8"').status(401).send('Anmeldung erforderlich');
  };
}
