// One-off: copy the data of an earlier SQLite database (data/zs.db) into Postgres.
//   npm run import-sqlite -w server -- data/zs.db [--replace]
// The target is DATABASE_URL (or the development PGlite). Without --replace it refuses a database that has users.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { openDb, type DB } from './db';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

// Parents before children; zug.zfhr_user_id is set after the users exist.
const TABLES: [sqlite: string, pg: string][] = [
  ['bataillon', 'bataillon'],
  ['kompanie', 'kompanie'],
  ['zug', 'zug'],
  ['user', 'app_user'],
  ['wk', 'wk'],
  ['location', 'location'],
  ['block', 'block'],
  ['comment', 'comment'],
  ['befehl', 'befehl'],
  ['auftrag_kp', 'auftrag_kp'],
  ['befehl_file', 'befehl_file'],
  ['konzept', 'konzept'],
  ['zfhr_programm', 'zfhr_programm'],
  ['milestone', 'milestone'],
  ['milestone_done', 'milestone_done'],
  ['vorbereitung_template', 'vorbereitung_template'],
  ['block_detail', 'block_detail'],
  ['zug_group', 'zug_group'],
  ['ausbildungsvorbereitung', 'ausbildungsvorbereitung'],
  ['resource', 'resource'],
  ['resource_request', 'resource_request'],
  ['audit_log', 'audit_log'],
  ['rapport', 'rapport'],
  ['pendenz', 'pendenz'],
  ['zug_strength', 'zug_strength'],
  ['participant', 'participant'],
  ['checkin_day', 'checkin_day'],
  ['checkin', 'checkin'],
];

export async function importSqlite(file: string, db: DB, { replace = false } = {}) {
  if (!existsSync(file)) throw new Error(`${file} nicht gefunden`);
  const src = new DatabaseSync(file, { readOnly: true } as ConstructorParameters<typeof DatabaseSync>[1]);
  const has = (t: string) => !!src.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  const users = (await db.prepare('SELECT COUNT(*) AS n FROM app_user').get()).n as number;
  if (users > 0 && !replace) throw new Error('Die Ziel-Datenbank enthält bereits Daten – mit --replace überschreiben');

  const counts: Record<string, number> = {};
  await db.transaction(async () => {
    if (replace) await db.exec(`TRUNCATE ${TABLES.map(([, t]) => t).join(', ')}, session RESTART IDENTITY CASCADE`);
    for (const [from, to] of TABLES) {
      if (!has(from)) continue;
      const target = new Set(
        ((await db.prepare('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?').all(to)) as any[]).map(
          (c) => c.column_name as string,
        ),
      );
      const cols = (src.prepare(`PRAGMA table_info("${from}")`).all() as { name: string }[]).map((c) => c.name).filter((c) => target.has(c));
      const insert = db.prepare(`INSERT INTO ${to} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
      const rows = src.prepare(`SELECT * FROM "${from}"`).all() as Record<string, unknown>[];
      for (const row of rows) {
        const values = cols.map((c) => {
          const v = row[c];
          if (from === 'zug' && c === 'zfhr_user_id') return null;
          return v instanceof Uint8Array ? Buffer.from(v) : v;
        });
        await insert.run(...values);
      }
      counts[to] = rows.length;
    }
    if (has('zug')) {
      for (const z of src.prepare('SELECT id, zfhr_user_id FROM zug WHERE zfhr_user_id IS NOT NULL').all() as any[]) {
        await db.prepare('UPDATE zug SET zfhr_user_id = ? WHERE id = ?').run(z.zfhr_user_id, z.id);
      }
    }
    // Continue the ids after the imported rows.
    for (const [, t] of TABLES) {
      const hasId = await db
        .prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = 'id'")
        .get(t);
      if (!hasId) continue;
      const seq = (await db.prepare("SELECT pg_get_serial_sequence(?, 'id') AS s").get(t))?.s;
      if (seq) await db.prepare(`SELECT setval(?, COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`).get(seq);
    }
  });
  src.close();
  return counts;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const file = process.argv.find((a, i) => i > 1 && !a.startsWith('--'));
  if (!file) {
    console.error('Aufruf: npm run import-sqlite -w server -- <datei.db> [--replace]');
    process.exit(1);
  }
  const db = await openDb();
  try {
    const counts = await importSqlite(file, db, { replace: process.argv.includes('--replace') });
    for (const [t, n] of Object.entries(counts)) console.log(`${t.padEnd(26)} ${n}`);
    console.log('Import abgeschlossen.');
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
