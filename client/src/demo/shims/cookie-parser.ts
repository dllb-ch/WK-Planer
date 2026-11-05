// cookie-parser for the browser demo: the cookie header (from the demo's cookie jar) as req.cookies.
export default function cookieParser() {
  return (req: { headers: Record<string, string>; cookies?: Record<string, string> }, _res: unknown, next: () => void) => {
    req.cookies = Object.fromEntries(
      (req.headers.cookie ?? '')
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => {
          const i = c.indexOf('=');
          return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
        }),
    );
    next();
  };
}
