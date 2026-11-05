import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDb, type DB } from '../src/db';
import { createApp } from '../src/app';

// An empty installation (no seed): the first-time setup.
let db: DB;
beforeEach(async () => {
  db = await openDb({});
});
afterEach(() => db.close());

const setup = {
  bataillon: {
    name: 'ZS Bat Test',
    regionName: 'ZSO Testregion',
    briefkopf: { amt: 'Amt für Bevölkerungsschutz', abteilung: 'Zivilschutz', adresse: 'Musterstrasse 1, 1234 Musterhausen' },
    mapView: { lat: 47.05, lon: 7.62, zoom: 13 },
  },
  admin: { name: 'Maj Test', email: 'Bat@Test.ch', password: 'geheim1234' },
  startPassword: 'start1234',
  kompanien: [
    {
      name: 'Pi Kp',
      kdt: { name: 'Hptm Test', email: 'kdt@test.ch' },
      zuege: [
        { name: 'Pi Z 1', soll: { zfhr: 1, kader: 3, sdt: 20 }, zfhr: { name: 'Lt Test', email: 'zfhr@test.ch' } },
        { name: 'Log Z', soll: { zfhr: 1, kader: 2, sdt: 8 } },
      ],
    },
    { name: 'Betreu Kp', zuege: [{ name: 'Betreu Z 1' }] },
  ],
  resources: [
    { kp: 0, kind: 'FAHRZEUG', name: 'Mannschaftsbus 1', category: 'Mannschaftsbus', seats: 9 },
    { kp: null, kind: 'RAUM', name: 'Theoriesaal', capacity: '40 Pers.' },
  ],
};

describe('first-time setup', () => {
  it('sets up the organisation, signs in the Bat Kommando and then locks itself', async () => {
    const app = createApp(db, {});
    expect((await request(app).get('/api/setup')).body).toEqual({ required: true, tokenRequired: false });
    const agent = request.agent(app);
    const res = await agent.post('/api/setup').send(setup);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'BAT', name: 'Maj Test', email: 'bat@test.ch' });

    const org = (await agent.get('/api/org')).body;
    expect(org.bataillon).toMatchObject({ name: 'ZS Bat Test', regionName: 'ZSO Testregion', mapView: { lat: 47.05, lon: 7.62, zoom: 13 } });
    expect(org.kompanien.map((k: any) => k.name).sort()).toEqual(['Betreu Kp', 'Pi Kp']);
    const z1 = org.zuege.find((z: any) => z.name === 'Pi Z 1');
    expect(z1.soll).toEqual({ zfhr: 1, kader: 3, sdt: 20 });
    const zfhr = org.users.find((u: any) => u.email === 'zfhr@test.ch');
    expect(zfhr).toMatchObject({ role: 'ZFHR', zugId: z1.id });
    expect(z1.zfhrUserId).toBe(zfhr.id);
    expect(org.users.find((u: any) => u.email === 'kdt@test.ch')).toMatchObject({ role: 'KPKDT' });

    const kp = org.kompanien.find((k: any) => k.name === 'Pi Kp');
    const resources = (await agent.get(`/api/kompanien/${kp.id}/resources`)).body;
    expect(resources.map((r: any) => [r.name, r.kpId === null ? 'Bat' : 'Kp', r.seats])).toEqual(
      expect.arrayContaining([
        ['Mannschaftsbus 1', 'Kp', 9],
        ['Theoriesaal', 'Bat', 0],
      ]),
    );
    // The others sign in with the start password; the Vorbereitung template is there.
    expect((await request(app).post('/api/auth/login').send({ email: 'kdt@test.ch', password: 'start1234' })).status).toBe(200);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM vorbereitung_template').get()).n).toBeGreaterThan(5);

    // Done: no second setup, no demo data on top.
    expect((await request(app).get('/api/setup')).body.required).toBe(false);
    expect((await request(app).post('/api/setup').send(setup)).status).toBe(409);
    expect((await request(app).post('/api/setup/demo').send({})).status).toBe(409);
  });

  it('checks the input: duplicate e-mails, start password, short passwords', async () => {
    const app = createApp(db, {});
    const twice = { ...setup, kompanien: [{ name: 'Kp', kdt: { name: 'A', email: 'bat@test.ch' } }] };
    expect((await request(app).post('/api/setup').send(twice)).body.error).toMatch(/mehrfach/);
    expect((await request(app).post('/api/setup').send({ ...setup, startPassword: undefined })).body.error).toMatch(/Startpasswort/);
    expect((await request(app).post('/api/setup').send({ ...setup, admin: { ...setup.admin, password: 'kurz' } })).status).toBe(400);
    expect((await request(app).post('/api/setup').send({ ...setup, kompanien: [] })).status).toBe(400);
    expect((await request(app).get('/api/setup')).body.required).toBe(true);
  });

  it('with SETUP_TOKEN only with the code; the demo data as alternative', async () => {
    const app = createApp(db, { SETUP_TOKEN: 'code-123' });
    expect((await request(app).get('/api/setup')).body.tokenRequired).toBe(true);
    expect((await request(app).post('/api/setup').send(setup)).status).toBe(403);
    expect((await request(app).post('/api/setup/demo').send({ token: 'falsch' })).status).toBe(403);
    expect((await request(app).post('/api/setup/demo').send({ token: 'code-123' })).status).toBe(201);
    expect((await request(app).post('/api/auth/login').send({ email: 'bat@demo.ch', password: 'zivilschutz' })).status).toBe(200);
    expect((await request(app).get('/api/setup')).body.required).toBe(false);
  });
});
