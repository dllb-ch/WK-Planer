import { openDb } from './db';
import { createApp } from './app';
import { seedDemo } from './seed';

const db = await openDb();
const hasUsers = ((await db.prepare('SELECT COUNT(*) AS n FROM app_user').get()) as any).n > 0;
if (!hasUsers) {
  console.log('Leere Datenbank – Demo-Daten werden angelegt.');
  await seedDemo(db);
}

const port = Number(process.env.API_PORT ?? 3001);
createApp(db).listen(port, () => console.log(`WK-Planer API läuft auf http://localhost:${port}`));
