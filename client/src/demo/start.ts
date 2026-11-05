// Browser demo: the real server (server/src) runs in this page on PGlite, stored in IndexedDB. fetch() calls to
// /api/… are answered here instead of going over the network. Built with `npm run build:demo` (GitHub Pages).
import { Buffer } from 'buffer';
import { CookieJar, handle } from './express';

// What the server code expects from Node, before any of it is loaded.
const g = globalThis as any;
g.Buffer ??= Buffer;
g.global ??= globalThis;
g.process ??= { env: {}, argv: [], platform: 'browser' };

const DB_NAME = 'wk-planer-demo';
const jar = new CookieJar('wk-planer-demo-cookies');
let close: (() => Promise<void>) | null = null;

export async function startDemo() {
  const [{ openDb }, { createApp }, { seedDemo }] = await Promise.all([
    import('../../../server/src/db'),
    import('../../../server/src/app'),
    import('../../../server/src/seed'),
  ]);
  const db = await openDb({ pgliteDir: `idb://${DB_NAME}` });
  close = () => db.close();
  const users = (await db.prepare('SELECT COUNT(*) AS n FROM app_user').get()) as { n: number };
  if (!users.n) await seedDemo(db);
  const app = createApp(db, {});

  // One request at a time: transactions of the server (AsyncLocalStorage) stay apart.
  let queue: Promise<unknown> = Promise.resolve();
  const network = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return network(input, init);
    const answer = queue.then(() => handle(app, request, jar));
    queue = answer.catch(() => {});
    return answer;
  };
}

/** Back to the original demo data: the database of this browser is deleted, the page reloads. */
export async function resetDemo() {
  await close?.().catch(() => {});
  jar.clear();
  await new Promise<void>((done) => {
    const r = indexedDB.deleteDatabase(`/pglite/${DB_NAME}`);
    r.onsuccess = r.onerror = r.onblocked = () => done();
  });
  location.reload();
}
