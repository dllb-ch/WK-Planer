import { openDb } from './db';
import { createApp } from './app';
import { seedDemo } from './seed';

const db = await openDb();
// An empty database opens the setup wizard; SEED_DEMO=1 fills it with the demo data right away (quick start).
const hasUsers = ((await db.prepare('SELECT COUNT(*) AS n FROM app_user').get()) as any).n > 0;
if (!hasUsers && process.env.SEED_DEMO === '1') {
  console.log('Leere Datenbank – Demo-Daten werden angelegt.');
  await seedDemo(db);
} else if (!hasUsers) console.log('Leere Datenbank – die Einrichtung startet im Browser.');

const port = Number(process.env.API_PORT ?? 3001);
createApp(db).listen(port, () => console.log(`WK-Planer API läuft auf http://localhost:${port}`));
