// First-time setup of an empty installation: the organisation (Bataillon, Kompanien, Züge, accounts, resources) in one
// go, or the demo data. Only possible while there is no account; with SETUP_TOKEN set, the token is required.
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../db';
import { audit, tx } from '../db';
import { hashPassword, startSessionFor } from '../auth';
import { HttpError, parse, asyncRouter } from '../http';
import { seedDemo } from '../seed';
import { saveTemplate } from '../vorbereitung';
import { DEFAULT_VORBEREITUNG } from '../../../shared/util';

const line = z.string().trim().max(200).default('');
const name = z.string().trim().min(1, 'Name fehlt').max(100);
const email = z.string().trim().toLowerCase().email('Ungültige E-Mail-Adresse').max(120);
const count = z.number().int().min(0).max(999).default(0);
const image = z
  .string()
  .max(700_000, 'Logo zu gross (max. ca. 500 KB)')
  .regex(/^data:image\/(png|jpeg|svg\+xml|webp);base64,/, 'Logo muss ein PNG-, JPEG-, WebP- oder SVG-Bild sein')
  .nullable()
  .default(null);
const person = z.object({ name, email, funktion: line });

const setupInput = z.object({
  token: z.string().optional(),
  bataillon: z.object({
    name,
    regionName: line,
    briefkopf: z.object({ amt: line, abteilung: line, adresse: line, telefon: line, web: line }).default({}),
    logo: image,
    kantonLogo: image,
    mapView: z
      .object({ lat: z.number().min(45.5).max(48.2), lon: z.number().min(5.5).max(11), zoom: z.number().int().min(6).max(19) })
      .nullable()
      .default(null),
  }),
  /** The first account: Bat Kommando, with its own password. */
  admin: person.extend({ password: z.string().min(8, 'Passwort: mindestens 8 Zeichen').max(200) }),
  /** Start password of all other accounts (changed under «Mein Konto»). */
  startPassword: z.string().min(8, 'Startpasswort: mindestens 8 Zeichen').max(200).optional(),
  kompanien: z
    .array(
      z.object({
        name,
        kdt: person.nullable().default(null),
        zuege: z
          .array(
            z.object({
              name,
              soll: z.object({ zfhr: count, kader: count, sdt: count }).default({}),
              zfhr: person.nullable().default(null),
            }),
          )
          .max(20)
          .default([]),
      }),
    )
    .min(1, 'Mindestens eine Kompanie')
    .max(30),
  resources: z
    .array(
      z.object({
        /** Index in kompanien, or null for material of the Bataillon. */
        kp: z.number().int().min(0).nullable(),
        kind: z.enum(['FAHRZEUG', 'ANHAENGER', 'RAUM', 'GELAENDE']),
        name,
        category: z.string().trim().max(60).default(''),
        seats: z.number().int().min(0).max(100).default(0),
        capacity: z.string().trim().max(100).default(''),
      }),
    )
    .max(300)
    .default([]),
});
export type SetupInput = z.input<typeof setupInput>;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function setupRouter(db: DB, env: { SETUP_TOKEN?: string } = {}) {
  const r = asyncRouter();
  const empty = async () => ((await db.prepare('SELECT COUNT(*) AS n FROM app_user').get()) as { n: number }).n === 0;
  const checkToken = (token: string | undefined) => {
    if (env.SETUP_TOKEN && !same(token ?? '', env.SETUP_TOKEN)) throw new HttpError(403, 'Einrichtungs-Code falsch');
  };
  const ensureEmpty = async () => {
    if (!(await empty())) throw new HttpError(409, 'Die Installation ist bereits eingerichtet');
  };

  /** Whether the wizard is due, and whether it asks for the code. */
  r.get('/', async (_req, res) => {
    res.json({ required: await empty(), tokenRequired: !!env.SETUP_TOKEN });
  });

  r.post('/demo', async (req, res) => {
    checkToken(req.body?.token);
    await ensureEmpty();
    await seedDemo(db);
    res.status(201).json({ ok: true });
  });

  r.post('/', async (req, res) => {
    const b = parse(setupInput, req.body);
    checkToken(b.token);
    const others = [...b.kompanien.flatMap((k) => [k.kdt, ...k.zuege.map((z) => z.zfhr)])].filter((p): p is NonNullable<typeof p> => !!p);
    const emails = [b.admin.email, ...others.map((p) => p.email)];
    const twice = emails.find((e, i) => emails.indexOf(e) !== i);
    if (twice) throw new HttpError(400, `Die E-Mail-Adresse ${twice} kommt mehrfach vor`);
    if (others.length && !b.startPassword) throw new HttpError(400, 'Startpasswort für die weiteren Konten fehlt');
    if (b.resources.some((x) => x.kp !== null && x.kp >= b.kompanien.length)) throw new HttpError(400, 'Unbekannte Kompanie bei den Ressourcen');

    const adminId = await tx(db, async () => {
      // Two browsers at once: only the first one sets up.
      await ensureEmpty();
      const id = (x: { lastInsertRowid: number }) => Number(x.lastInsertRowid);
      const bat = id(
        await db
          .prepare('INSERT INTO bataillon (name, region_name, logo, kanton_logo, briefkopf, map_view) VALUES (?, ?, ?, ?, ?, ?)')
          .run(b.bataillon.name, b.bataillon.regionName, b.bataillon.logo, b.bataillon.kantonLogo, JSON.stringify(b.bataillon.briefkopf), b.bataillon.mapView ? JSON.stringify(b.bataillon.mapView) : null),
      );
      await saveTemplate(db, bat, null, DEFAULT_VORBEREITUNG);
      const startHash = b.startPassword ? hashPassword(b.startPassword) : '';
      const addUser = async (p: { name: string; email: string; funktion: string }, hash: string, role: string, kp: number | null, zug: number | null) =>
        id(
          await db
            .prepare('INSERT INTO app_user (name, email, pw_hash, role, bat_id, kp_id, zug_id, funktion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(p.name, p.email, hash, role, bat, kp, zug, p.funktion),
        );
      const admin = await addUser({ ...b.admin, funktion: b.admin.funktion || 'Bat Kdt' }, hashPassword(b.admin.password), 'BAT', null, null);
      const kpIds: number[] = [];
      for (const k of b.kompanien) {
        const kp = id(await db.prepare('INSERT INTO kompanie (bat_id, name) VALUES (?, ?)').run(bat, k.name));
        kpIds.push(kp);
        if (k.kdt) await addUser({ ...k.kdt, funktion: k.kdt.funktion || `Kp Kdt ${k.name}` }, startHash, 'KPKDT', kp, null);
        for (const [i, z] of k.zuege.entries()) {
          const zug = id(await db.prepare('INSERT INTO zug (kp_id, name, sort, soll) VALUES (?, ?, ?, ?)').run(kp, z.name, i + 1, JSON.stringify(z.soll)));
          if (z.zfhr) {
            const zf = await addUser({ ...z.zfhr, funktion: z.zfhr.funktion || `Zfhr ${z.name}` }, startHash, 'ZFHR', kp, zug);
            await db.prepare('UPDATE zug SET zfhr_user_id = ? WHERE id = ?').run(zf, zug);
          }
        }
      }
      const seatsOf = (x: { kind: string; seats: number; capacity: string }) => (x.kind !== 'FAHRZEUG' ? 0 : x.seats || Number(x.capacity.match(/(\d+)/)?.[1] ?? 0));
      for (const x of b.resources) {
        await db
          .prepare('INSERT INTO resource (bat_id, kp_id, kind, category, name, description, capacity, seats, nr, area) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
          .run(bat, x.kp === null ? null : kpIds[x.kp], x.kind, x.category || x.name, x.name, '', x.capacity, seatsOf(x));
      }
      await audit(db, admin, 'setup', bat, 'create', { kompanien: b.kompanien.length, accounts: emails.length, resources: b.resources.length });
      return admin;
    });
    await startSessionFor(db, res.status(201), await db.prepare('SELECT * FROM app_user WHERE id = ?').get(adminId));
  });

  return r;
}
