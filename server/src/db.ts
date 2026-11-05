// PostgreSQL access. Production and development connect to a server (DATABASE_URL);
// tests and setups without a server use PGlite (Postgres compiled to WebAssembly).
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

type Params = unknown[];
interface Result {
  rows: any[];
  rowCount: number;
}
/** One connection or transaction: what the statements run on. */
interface Runner {
  query(sql: string, params: Params): Promise<Result>;
}

export interface Statement {
  get<T = any>(...params: Params): Promise<T | undefined>;
  all<T = any>(...params: Params): Promise<T[]>;
  run(...params: Params): Promise<{ lastInsertRowid: number; changes: number }>;
}

export interface DB {
  /** Statements are written with «?» placeholders. */
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  /** Runs fn in a transaction; statements inside it (also in called functions) use it automatically. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const SCHEMA = readFileSync(resolve(import.meta.dirname, 'sql/schema.sql'), 'utf8');

// COUNT(*) and BIGINT come back as strings otherwise.
pg.types.setTypeParser(20, (v) => Number(v));

/** «?» → «$1», «$2» … (not inside string literals). */
export function numbered(sql: string) {
  let n = 0;
  let out = '';
  let quoted = false;
  for (const ch of sql) {
    if (ch === "'") quoted = !quoted;
    out += ch === '?' && !quoted ? `$${++n}` : ch;
  }
  return out;
}

// Tables without an «id» column.
const NO_ID = new Set(['session', 'auftrag_kp', 'konzept', 'zfhr_programm', 'milestone_done', 'zug_strength', 'checkin_day', 'tagesbefehl']);

/** INSERTs return the new id (like SQLite's lastInsertRowid). */
function withReturning(sql: string) {
  const m = sql.match(/^\s*INSERT\s+INTO\s+(\w+)/i);
  if (!m || NO_ID.has(m[1]) || /\bRETURNING\b/i.test(sql)) return sql;
  return `${sql.trimEnd().replace(/;$/, '')} RETURNING id`;
}

// Buffers in, Buffers out (PGlite returns Uint8Array).
const param = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v);
const fix = (row: any) => {
  for (const k in row) if (row[k] instanceof Uint8Array && !Buffer.isBuffer(row[k])) row[k] = Buffer.from(row[k]);
  return row;
};

function makeDb(base: Runner, begin: <T>(fn: (r: Runner) => Promise<T>) => Promise<T>, execAll: (sql: string) => Promise<void>, close: () => Promise<void>): DB {
  const current = new AsyncLocalStorage<Runner>();
  const runner = () => current.getStore() ?? base;
  const q = async (sql: string, params: Params) => {
    const text = withReturning(numbered(sql));
    try {
      return await runner().query(text, params.map(param));
    } catch (e) {
      // Which statement failed (for the server log).
      if (e && typeof e === 'object') (e as { sql?: string }).sql = text;
      throw e;
    }
  };
  return {
    prepare: (sql) => ({
      get: async (...p) => {
        const r = await q(sql, p);
        return r.rows[0] ? fix(r.rows[0]) : undefined;
      },
      all: async (...p) => (await q(sql, p)).rows.map(fix),
      run: async (...p) => {
        const r = await q(sql, p);
        return { lastInsertRowid: Number(r.rows[0]?.id ?? 0), changes: r.rowCount };
      },
    }),
    exec: async (sql) => (current.getStore() ? current.getStore()!.query(sql, []).then(() => {}) : (await execAll(sql))),
    transaction: async (fn) => (current.getStore() ? (await fn()) : (await begin((r) => current.run(r, fn)))),
    close,
  };
}

/** Without DATABASE_URL: PGlite in data/pglite (or PGLITE_DIR), for development without a Postgres server. */
export const defaultDb = () =>
  process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : { pgliteDir: process.env.PGLITE_DIR ?? 'data/pglite' };

/** Connects to a Postgres server (url), or opens PGlite (in a directory, or in memory). */
export async function openDb(opts: { url?: string; pgliteDir?: string } = defaultDb()): Promise<DB> {
  let db: DB;
  if (opts.url) {
    const pool = new pg.Pool({ connectionString: opts.url, max: 10 });
    const run = (c: pg.Pool | pg.PoolClient): Runner => ({
      query: async (sql, params) => {
        const r = await c.query(sql, params);
        return { rows: r.rows, rowCount: r.rowCount ?? 0 };
      },
    });
    db = makeDb(
      run(pool),
      async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn(run(client));
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
      async (sql) => void (await pool.query(sql)),
      () => pool.end(),
    );
  } else {
    const lite = new PGlite(opts.pgliteDir, { parsers: { 20: (v: string) => Number(v) } });
    const run = (c: { query: PGlite['query'] }): Runner => ({
      query: async (sql, params) => {
        const r = await c.query(sql, params);
        return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
      },
    });
    db = makeDb(
      run(lite),
      (fn) => lite.transaction((t) => fn(run(t))),
      async (sql) => void (await lite.exec(sql)),
      () => lite.close(),
    );
  }
  await db.exec(SCHEMA);
  await fillDayDuty(db);
  return db;
}

/**
 * Duty per Zug and day for WKs of earlier versions: from the list of serving Züge (day_zuege) or, before that,
 * from the blocks on AVOR days (where only the Kdo serves now) – so that nothing planned becomes invalid.
 */
export async function fillDayDuty(db: DB) {
  const wks = (await db.prepare('SELECT id, kp_id, avor_days, kvk_days, day_zuege FROM wk WHERE day_duty IS NULL').all()) as {
    id: number;
    kp_id: number;
    avor_days: string;
    kvk_days: string;
    day_zuege: string | null;
  }[];
  for (const w of wks) {
    const avor = JSON.parse(w.avor_days || '[]') as string[];
    const kvk = JSON.parse(w.kvk_days || '[]') as string[];
    const zuege = ((await db.prepare('SELECT id FROM zug WHERE kp_id = ?').all(w.kp_id)) as { id: number }[]).map((z) => z.id);
    let serving: Record<string, number[]> = w.day_zuege ? JSON.parse(w.day_zuege) : {};
    if (!w.day_zuege) {
      for (const d of avor) {
        const rows = (await db.prepare('SELECT zug_ids FROM block WHERE wk_id = ? AND date = ?').all(w.id, d)) as { zug_ids: string }[];
        const ids = [...new Set(rows.flatMap((r) => JSON.parse(r.zug_ids) as number[]))].filter((id) => id !== 0);
        if (ids.length) serving = { ...serving, [d]: ids };
      }
    }
    const duty: Record<string, Record<string, string>> = {};
    for (const [d, ids] of Object.entries(serving)) {
      const kind = avor.includes(d) ? 'AVOR' : kvk.includes(d) ? 'KVK' : 'WK';
      for (const z of zuege) {
        const on = ids.includes(z);
        // Only where it differs from the type of the day.
        if (kind === 'AVOR' ? on : !on) (duty[d] ??= {})[String(z)] = on ? 'AVOR' : 'NONE';
      }
    }
    await db.prepare('UPDATE wk SET day_duty = ? WHERE id = ?').run(JSON.stringify(duty), w.id);
  }
}

/** Run fn inside a transaction. */
export const tx = <T>(db: DB, fn: () => Promise<T>) => db.transaction(fn);

export async function audit(db: DB, userId: number | null, entity: string, entityId: number | null, action: string, diff?: unknown) {
  await db
    .prepare('INSERT INTO audit_log (user_id, entity, entity_id, action, diff) VALUES (?, ?, ?, ?, ?)')
    .run(userId, entity, entityId, action, diff === undefined ? null : JSON.stringify(diff));
}
