import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDb, type DB } from '../src/db';
import { createApp } from '../src/app';
import { DEMO_PASSWORD, seedDemo } from '../src/seed';

let db: DB;
let app: ReturnType<typeof createApp>;

// TEST_DATABASE_URL: run against a Postgres server (wiped before every test) instead of PGlite.
const serverUrl = process.env.TEST_DATABASE_URL;

beforeEach(async () => {
  if (serverUrl) {
    const wipe = await openDb({ url: serverUrl });
    await wipe.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await wipe.close();
  }
  db = await openDb(serverUrl ? { url: serverUrl } : {});
  await seedDemo(db);
  app = createApp(db);
});
afterEach(() => db.close());

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const piWkId = async () => ((await db.prepare("SELECT wk.id FROM wk JOIN kompanie k ON k.id = wk.kp_id WHERE k.name = 'Pi Kp'").get()) as any).id;
const zugId = async (name: string) => ((await db.prepare('SELECT id FROM zug WHERE name = ?').get(name)) as any).id;
const blockOf = async (title: string, zug: string) =>
  (await db
    .prepare('SELECT * FROM block WHERE title = ? AND zug_ids = ?')
    .get(title, JSON.stringify([(await zugId(zug))]))) as any;

describe('auth', () => {
  it('rejects unauthenticated requests and wrong passwords', async () => {
    expect((await request(app).get('/api/wks')).status).toBe(401);
    const res = await request(app).post('/api/auth/login').send({ email: 'kpkdt@demo.ch', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('returns the session user', async () => {
    const a = await login('zfhr1@demo.ch');
    const me = await a.get('/api/auth/me');
    expect(me.body.role).toBe('ZFHR');
  });
});

describe('Arbeitsprogramm blocks', () => {
  it('Kp Kdt moves a block to another day and Zug', async () => {
    const a = await login('kpkdt@demo.ch');
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    const res = await a
      .patch(`/api/wks/${(await piWkId())}/blocks/${b.id}`)
      .send({ version: b.version, date: '2027-04-28', zugIds: [(await zugId('Pi Z 2'))], startMin: 600, endMin: 720 });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2027-04-28');
    expect(res.body.version).toBe(b.version + 1);
  });

  it('Zfhr can move own block but not one of another Zug (403)', async () => {
    const a = await login('zfhr1@demo.ch');
    const own = await blockOf('Detailausbildung 1', 'Pi Z 1');
    const ok = await a.patch(`/api/wks/${(await piWkId())}/blocks/${own.id}`).send({ version: own.version, startMin: 600, endMin: 720 });
    expect(ok.status).toBe(200);

    const other = await blockOf('Detailausbildung 2', 'Pi Z 2');
    const res = await a.patch(`/api/wks/${(await piWkId())}/blocks/${other.id}`).send({ version: other.version, startMin: 600 });
    expect(res.status).toBe(403);

    const moveAway = await a
      .patch(`/api/wks/${(await piWkId())}/blocks/${own.id}`)
      .send({ version: own.version + 1, zugIds: [(await zugId('Pi Z 2'))] });
    expect(moveAway.status).toBe(403);
  });

  it('Zfhr cannot edit locked or multi-Zug blocks', async () => {
    const a = await login('zfhr1@demo.ch');
    const appell = (await db.prepare("SELECT * FROM block WHERE title = 'Kurseröffnung / Appell'").get()) as any;
    const res = await a.patch(`/api/wks/${(await piWkId())}/blocks/${appell.id}`).send({ version: appell.version, startMin: 450 });
    expect(res.status).toBe(403);
  });

  it('Kader writes are rejected', async () => {
    const a = await login('kader@demo.ch');
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    expect((await a.patch(`/api/wks/${(await piWkId())}/blocks/${b.id}`).send({ version: b.version, startMin: 600 })).status).toBe(403);
    const created = await a.post(`/api/wks/${(await piWkId())}/blocks`).send({
      date: '2027-04-27',
      startMin: 600,
      endMin: 660,
      zugIds: [(await zugId('Pi Z 1'))],
      title: 'x',
      type: 'AUSBILDUNG',
    });
    expect(created.status).toBe(403);
  });

  it('stale version returns 409 with the current block', async () => {
    const a = await login('kpkdt@demo.ch');
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    await a.patch(`/api/wks/${(await piWkId())}/blocks/${b.id}`).send({ version: b.version, startMin: 600, endMin: 720 });
    const res = await a.patch(`/api/wks/${(await piWkId())}/blocks/${b.id}`).send({ version: b.version, startMin: 615 });
    expect(res.status).toBe(409);
    expect(res.body.current.startMin).toBe(600);
  });

  it('rejects blocks outside the day or with non-adjacent Züge', async () => {
    const a = await login('kpkdt@demo.ch');
    const base = { date: '2027-04-27', title: 'x', type: 'AUSBILDUNG' };
    const late = await a.post(`/api/wks/${(await piWkId())}/blocks`).send({ ...base, startMin: 1000, endMin: 1080, zugIds: [(await zugId('Pi Z 1'))] });
    expect(late.status).toBe(400);
    const gap = await a
      .post(`/api/wks/${(await piWkId())}/blocks`)
      .send({ ...base, startMin: 600, endMin: 660, zugIds: [(await zugId('Pi Z 1')), (await zugId('Pi Z 3'))] });
    expect(gap.status).toBe(400);
  });

  it('Bat events are always locked and not editable by the Kp Kdt', async () => {
    const batAgent = await login('bat@demo.ch');
    const res = await batAgent.post(`/api/wks/${(await piWkId())}/blocks`).send({
      date: '2027-04-29',
      startMin: 840,
      endMin: 900,
      zugIds: [(await zugId('Pi Z 1'))],
      title: 'Besuch Kanton',
      type: 'DIVERSES',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ locked: true, source: 'BAT' });
    const kdt = await login('kpkdt@demo.ch');
    const del = await kdt.delete(`/api/wks/${(await piWkId())}/blocks/${res.body.id}`);
    expect(del.status).toBe(403);
  });
});

describe('status workflow', () => {
  it('submit → approve freezes the AP; reopen unfreezes', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const bat = await login('bat@demo.ch');
    const id = await piWkId();
    expect((await bat.post(`/api/wks/${id}/approve`)).status).toBe(403); // not submitted yet
    expect((await kdt.post(`/api/wks/${id}/submit`)).body.status).toBe('EINGEREICHT');
    expect((await bat.post(`/api/wks/${id}/approve`).send({ note: 'gut' })).body.status).toBe('FREIGEGEBEN');

    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    expect((await kdt.patch(`/api/wks/${id}/blocks/${b.id}`).send({ version: b.version, startMin: 600 })).status).toBe(403);
    expect((await kdt.put(`/api/wks/${id}/konzept`).send({})).status).toBe(403);

    expect((await kdt.post(`/api/wks/${id}/reopen`)).body.status).toBe('ENTWURF');
    expect((await kdt.patch(`/api/wks/${id}/blocks/${b.id}`).send({ version: b.version, startMin: 600, endMin: 720 })).status).toBe(200);
  });

  it('reject requires a note', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const bat = await login('bat@demo.ch');
    await kdt.post(`/api/wks/${(await piWkId())}/submit`);
    expect((await bat.post(`/api/wks/${(await piWkId())}/reject`).send({})).status).toBe(400);
    const res = await bat.post(`/api/wks/${(await piWkId())}/reject`).send({ note: 'Übung zu kurz' });
    expect(res.body).toMatchObject({ status: 'ZURUECKGEWIESEN', reviewNote: 'Übung zu kurz' });
  });
});

describe('visibility and documents', () => {
  it('Kp Kdt of another Kp cannot see the Pi Kp WK', async () => {
    const a = await login('kpkdt.betreu@demo.ch');
    expect((await a.get(`/api/wks/${(await piWkId())}`)).status).toBe(403);
    const list = await a.get('/api/wks');
    expect(list.body.map((w: any) => w.kpName)).toEqual(['Betreu Kp']);
  });

  it('Befehl Aufträge are filtered per Kp; Kader has no access', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const res = await kdt.get('/api/befehle/2027');
    expect(res.body.auftraege).toHaveLength(1);
    expect(res.body.auftraege[0].kvkDates).toEqual(['2027-03-13', '2027-04-26']);
    expect((await kdt.put('/api/befehle/2027').send({})).status).toBe(403);
    const kader = await login('kader@demo.ch');
    expect((await kader.get('/api/befehle/2027')).status).toBe(403);
  });

  it('Zfhr edits own Zfhr-AP only; Kader reads own Zug only', async () => {
    const zf = await login('zfhr1@demo.ch');
    const id = await piWkId();
    expect((await zf.put(`/api/wks/${id}/zfhr/${(await zugId('Pi Z 1'))}`).send({ ziele: ['a'] })).status).toBe(200);
    expect((await zf.put(`/api/wks/${id}/zfhr/${(await zugId('Pi Z 2'))}`).send({ ziele: ['a'] })).status).toBe(403);
    const kader = await login('kader@demo.ch');
    expect((await kader.get(`/api/wks/${id}/zfhr/${(await zugId('Pi Z 1'))}`)).body.ziele).toEqual(['a']);
    expect((await kader.get(`/api/wks/${id}/zfhr/${(await zugId('Pi Z 2'))}`)).status).toBe(403);
  });

  it('each person ticks off own items; others see only their role', async () => {
    const id = await piWkId();
    const zf = await login('zfhr1@demo.ch');
    const list = (await zf.get(`/api/wks/${id}/milestones`)).body as any[];
    expect(list.every((m) => m.ownerRole === 'ZFHR')).toBe(true);
    const open = list.find((m) => !m.doneBy.length);
    const res = await zf.post(`/api/wks/${id}/milestones/${open.id}/done`).send({ done: true });
    expect(res.body.doneBy.map((d: any) => d.name)).toEqual(['Lt Gruber']);
    // Other Zugführer still have to complete it.
    expect(res.body.responsible.length).toBeGreaterThan(1);
    expect((await zf.patch(`/api/wks/${id}/milestones/${open.id}`).send({ title: 'x' })).status).toBe(403);

    const kader = await login('kader@demo.ch');
    const kList = (await kader.get(`/api/wks/${id}/milestones`)).body as any[];
    expect(kList.length).toBeGreaterThan(0);
    expect(kList.every((m) => m.ownerRole === 'KADER')).toBe(true);
    expect((await kader.post(`/api/wks/${id}/milestones/${open.id}/done`).send({ done: true })).status).toBe(403);

    const kdt = await login('kpkdt@demo.ch');
    const all = (await kdt.get(`/api/wks/${id}/milestones`)).body as any[];
    expect(new Set(all.map((m) => m.ownerRole)).size).toBeGreaterThanOrEqual(4);
  });

  it('Bat creates a WK with the preparation timeline', async () => {
    const bat = await login('bat@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const res = await bat
      .post('/api/wks')
      .send({ kpId, title: 'WK II', startDate: '2027-10-04', endDate: '2027-10-06', dayStart: 450, dayEnd: 1020, snapMin: 15 });
    expect(res.status).toBe(201);
    const ms = await bat.get(`/api/wks/${res.body.id}/milestones`);
    expect(ms.body.length).toBeGreaterThan(5);
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.post('/api/wks').send({ kpId, title: 'x', startDate: '2027-10-04', endDate: '2027-10-06', dayStart: 450, dayEnd: 1020, snapMin: 15 })).status).toBe(403);
  });
});

describe('Kdo column and AVOR days', () => {
  it('Kp Kdt plans in the Kdo column and on AVOR days; Zfhr cannot', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const id = await piWkId();
    const kdoBlock = { date: '2027-03-13', startMin: 1000, endMin: 1020, zugIds: [0], title: 'Kdo AVOR', type: 'AVOR' };
    expect((await kdt.post(`/api/wks/${id}/blocks`).send(kdoBlock)).status).toBe(201);
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.post(`/api/wks/${id}/blocks`).send(kdoBlock)).status).toBe(403);
    // A day that is neither a WK nor an AVOR day is rejected.
    expect((await kdt.post(`/api/wks/${id}/blocks`).send({ ...kdoBlock, date: '2027-03-14' })).status).toBe(400);
  });

  it('AVOR days can be changed in the WK settings', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const res = await kdt.patch(`/api/wks/${(await piWkId())}`).send({ avorDays: ['2027-04-20', '2027-03-13'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ avorDays: ['2027-03-13', '2027-04-20'], kvkDays: ['2027-04-26'] });
    // Removing a day that still has blocks is refused.
    expect((await kdt.patch(`/api/wks/${(await piWkId())}`).send({ avorDays: [] })).status).toBe(409);
    // The KVK day has blocks of the Züge: it cannot become an AVOR day (Kdo only) without them.
    expect((await kdt.patch(`/api/wks/${(await piWkId())}`).send({ avorDays: ['2027-03-13', '2027-04-26'] })).status).toBe(409);
  });
});

describe('Detailplanung', () => {
  it('Zfhr and Zfhr Stv plan details inside their slot; Kader cannot', async () => {
    const id = await piWkId();
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    const z1 = await zugId('Pi Z 1');
    const items = [{ startMin: 585, endMin: 630, title: 'Po 1', verantwortlich: 'Grfhr' }];
    for (const email of ['zfhr1@demo.ch', 'zfhr1stv@demo.ch']) {
      const a = await login(email);
      expect((await a.put(`/api/wks/${id}/blocks/${b.id}/details/${z1}`).send(items)).status).toBe(200);
    }
    const outside = [{ startMin: 500, endMin: 600, title: 'zu früh' }];
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.put(`/api/wks/${id}/blocks/${b.id}/details/${z1}`).send(outside)).status).toBe(400);
    const kader = await login('kader@demo.ch');
    expect((await kader.put(`/api/wks/${id}/blocks/${b.id}/details/${z1}`).send(items)).status).toBe(403);
    const zf2 = await login('zfhr2@demo.ch');
    expect((await zf2.put(`/api/wks/${id}/blocks/${b.id}/details/${z1}`).send(items)).status).toBe(403);
  });

  it('details move with their block', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const id = await piWkId();
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    await kdt.patch(`/api/wks/${id}/blocks/${b.id}`).send({ version: b.version, startMin: b.start_min + 60, endMin: b.end_min + 60 });
    const detail = (await kdt.get(`/api/wks/${id}`)).body.details.filter((d: any) => d.blockId === b.id);
    expect(detail[0].startMin).toBe(585 + 60);
  });
});

describe('Ausbildungsvorbereitung', () => {
  const av = (blockId: number, zugIdV: number) => ({ blockId, zugId: zugIdV, thema: 'Pumpen', zielsetzungen: ['x'], ablauf: [{ from: '10:00', to: '10:10', phase: 'P', text: 'Einstieg' }] });

  it('Kader writes and edits only own documents; Zfhr edits all of the Zug', async () => {
    const id = await piWkId();
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    const kader = await login('kader@demo.ch');
    const created = await kader.post(`/api/wks/${id}/avs`).send(av(b.id, (await zugId('Pi Z 1'))));
    expect(created.status).toBe(201);
    expect((await kader.put(`/api/wks/${id}/avs/${created.body.id}`).send({ ...av(b.id, (await zugId('Pi Z 1'))), thema: 'neu' })).status).toBe(200);

    const kader2 = await login('kader2@demo.ch');
    expect((await kader2.get(`/api/wks/${id}/avs/${created.body.id}`)).status).toBe(403); // other Zug
    const zf = await login('zfhr1@demo.ch');
    const mine = await zf.post(`/api/wks/${id}/avs`).send(av(b.id, (await zugId('Pi Z 1'))));
    expect((await zf.put(`/api/wks/${id}/avs/${created.body.id}`).send(av(b.id, (await zugId('Pi Z 1'))))).status).toBe(200);
    expect((await kader.put(`/api/wks/${id}/avs/${mine.body.id}`).send(av(b.id, (await zugId('Pi Z 1'))))).status).toBe(403);
    // Kp Kdt reads only.
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.get(`/api/wks/${id}/avs`)).body.length).toBeGreaterThanOrEqual(3);
    expect((await kdt.post(`/api/wks/${id}/avs`).send(av(b.id, (await zugId('Pi Z 1'))))).status).toBe(403);
  });
});

describe('resource requests', () => {
  const kpId = async () => ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
  const resId = async (name: string) => ((await db.prepare('SELECT id FROM resource WHERE name = ?').get(name)) as any).id;

  it('Zfhr requests, Log Of approves; conflicting approvals are refused', async () => {
    const id = await piWkId();
    const zf = await login('zfhr1@demo.ch');
    const req = await zf.post(`/api/wks/${id}/requests`).send({
      zugId: (await zugId('Pi Z 1')),
      resourceId: (await resId('Mannschaftsbus 2')),
      kind: 'FAHRZEUG',
      date: '2027-04-28',
      startMin: 600,
      endMin: 660,
      zweck: 'Transport',
    });
    expect(req.status).toBe(201);
    expect((await zf.post(`/api/wks/${id}/requests/${req.body.id}/decide`).send({ status: 'BEWILLIGT' })).status).toBe(403);
    const logof = await login('logof@demo.ch');
    expect((await logof.post(`/api/wks/${id}/requests/${req.body.id}/decide`).send({ status: 'BEWILLIGT' })).body.status).toBe('BEWILLIGT');

    // Seeded: Mannschaftsbus 1 is approved for Pi Z 3 at 10:00–11:00, Pi Z 1 asks 09:45–12:00.
    const pending = (await db.prepare("SELECT id FROM resource_request WHERE status = 'BEANTRAGT'").get()) as any;
    expect((await logof.post(`/api/wks/${id}/requests/${pending.id}/decide`).send({ status: 'BEWILLIGT' })).status).toBe(409);
    expect((await logof.post(`/api/wks/${id}/requests/${pending.id}/decide`).send({ status: 'ABGELEHNT' })).status).toBe(400);
  });

  it('vehicles by number of people: seats are summed on approval', async () => {
    const id = await piWkId();
    const zf = await login('zfhr1@demo.ch');
    const base = { zugId: (await zugId('Pi Z 1')), kind: 'FAHRZEUG', category: '', date: '2027-04-29', startMin: 840, endMin: 900, zweck: 'Verschiebung' };
    const twelve = await zf.post(`/api/wks/${id}/requests`).send({ ...base, persons: 12 });
    expect(twelve.status).toBe(201);
    expect(twelve.body).toMatchObject({ persons: 12, quantity: 1, resourceId: null });
    const logof = await login('logof@demo.ch');
    const ok = await logof.post(`/api/wks/${id}/requests/${twelve.body.id}/decide`).send({ status: 'BEWILLIGT' });
    expect(ok.status).toBe(200);
    // 9-seat bus plus the smallest vehicle that fits the remaining 3.
    const seats: number[] = [];
    for (const x of ok.body.assignedIds) seats.push(((await db.prepare('SELECT seats FROM resource WHERE id = ?').get(x)) as any).seats);
    expect(seats).toEqual([9, 4]);
    const many = await zf.post(`/api/wks/${id}/requests`).send({ ...base, persons: 200 });
    expect((await logof.post(`/api/wks/${id}/requests/${many.body.id}/decide`).send({ status: 'BEWILLIGT' })).status).toBe(409);
    // Chosen vehicles with too few seats are refused.
    const few = await zf.post(`/api/wks/${id}/requests`).send({ ...base, startMin: 960, endMin: 990, persons: 10 });
    const pickup = ((await db.prepare("SELECT id FROM resource WHERE name = 'Pickup 1'").get()) as any).id;
    expect((await logof.post(`/api/wks/${id}/requests/${few.body.id}/decide`).send({ status: 'BEWILLIGT', assignedIds: [pickup] })).status).toBe(400);
  });

  it('terrain requests need an area; Zfhr cannot request for another Zug or manage the catalogue', async () => {
    const id = await piWkId();
    const zf = await login('zfhr1@demo.ch');
    const base = { zugId: (await zugId('Pi Z 1')), kind: 'GELAENDE', date: '2027-04-28', startMin: 600, endMin: 660, zweck: 'Übung' };
    expect((await zf.post(`/api/wks/${id}/requests`).send(base)).status).toBe(400);
    const area = [[47.24, 7.64], [47.241, 7.641], [47.239, 7.642]];
    expect((await zf.post(`/api/wks/${id}/requests`).send({ ...base, area })).status).toBe(201);
    expect((await zf.post(`/api/wks/${id}/requests`).send({ ...base, area, zugId: (await zugId('Pi Z 2')) })).status).toBe(403);
    expect((await zf.post(`/api/kompanien/${(await kpId())}/resources`).send({ kind: 'RAUM', name: 'x' })).status).toBe(403);
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.post(`/api/kompanien/${(await kpId())}/resources`).send({ kind: 'RAUM', name: 'Küche' })).status).toBe(201);
  });
});

describe('Vorbereitung templates', () => {
  const kp = async (name: string) => ((await db.prepare('SELECT id, bat_id FROM kompanie WHERE name = ?').get(name)) as any);

  it('only the Org Admin edits templates; a Kp override wins over the Bat template', async () => {
    const { id: kpId, bat_id: batId } = await kp('Pi Kp');
    const items = [{ title: 'Spezialpunkt Pi Kp', description: '', daysBefore: 30, ownerRole: 'KADER' }];
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.get(`/api/templates?batId=${batId}&kpId=${kpId}`)).body.source).toBe('BAT');
    expect((await kdt.put(`/api/templates?batId=${batId}&kpId=${kpId}`).send(items)).status).toBe(403);

    const admin = await login('admin@demo.ch');
    expect((await admin.get('/api/admin/org')).body[0].kompanien.length).toBe(2);
    const saved = await admin.put(`/api/templates?batId=${batId}&kpId=${kpId}`).send(items);
    expect(saved.body.source).toBe('KP');
    expect((await admin.get('/api/wks')).body).toEqual([]); // no WK access

    const bat = await login('bat@demo.ch');
    const wk = await bat
      .post('/api/wks')
      .send({ kpId, title: 'WK II', startDate: '2027-10-04', endDate: '2027-10-06', dayStart: 450, dayEnd: 1020, snapMin: 15 });
    const ms = (await bat.get(`/api/wks/${wk.body.id}/milestones`)).body;
    expect(ms.map((m: any) => m.title)).toEqual(['Spezialpunkt Pi Kp']);
    expect(ms[0].dueDate).toBe('2027-09-04');

    // Removing the override falls back to the Bat template.
    expect((await admin.delete(`/api/templates?batId=${batId}&kpId=${kpId}`)).body.source).toBe('BAT');
  });

  it('Kp Kdt adds missing template items to an existing WK', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const id = await piWkId();
    const list = (await kdt.get(`/api/wks/${id}/milestones`)).body as any[];
    await kdt.delete(`/api/wks/${id}/milestones/${list[0].id}`);
    expect((await kdt.post(`/api/wks/${id}/milestones/apply-template`)).body.added).toBe(1);
  });
});

describe('Gruppen', () => {
  const groupsOf = async (zug: string) => (await db.prepare('SELECT * FROM zug_group WHERE zug_id = ? ORDER BY sort').all((await zugId(zug)))) as any[];

  it('Zfhr manages the groups of the own Zug; Kader and other Zfhr cannot', async () => {
    const id = await piWkId();
    const z1 = await zugId('Pi Z 1');
    const zf = await login('zfhr1@demo.ch');
    const g = await groupsOf('Pi Z 1');
    const res = await zf.put(`/api/wks/${id}/zuege/${z1}/groups`).send([...g.map((x) => ({ id: x.id, name: x.name })), { name: 'Gr 4' }]);
    expect(res.body.map((x: any) => x.name)).toEqual(['Gr 1', 'Gr 2', 'Gr 3', 'Gr 4']);
    expect((await (await login('kader@demo.ch')).put(`/api/wks/${id}/zuege/${z1}/groups`).send([])).status).toBe(403);
    expect((await (await login('zfhr2@demo.ch')).put(`/api/wks/${id}/zuege/${z1}/groups`).send([])).status).toBe(403);
  });

  it('details are assigned to groups; removing a group removes its sequences', async () => {
    const id = await piWkId();
    const z1 = await zugId('Pi Z 1');
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    const [g1, g2, g3] = await groupsOf('Pi Z 1');
    const zf = await login('zfhr1@demo.ch');
    // All groups selected is stored as the whole Zug.
    const saved = await zf.put(`/api/wks/${id}/blocks/${b.id}/details/${z1}`).send([
      { startMin: 585, endMin: 630, title: 'Alle', groupIds: [g1.id, g2.id, g3.id] },
      { startMin: 630, endMin: 675, title: 'Gr 1 Po 1', groupIds: [g1.id] },
      { startMin: 630, endMin: 675, title: 'Gr 2+3 Po 2', groupIds: [g2.id, g3.id] },
    ]);
    expect(saved.body.map((d: any) => d.groupIds)).toEqual([[], [g1.id], [g2.id, g3.id]]);
    expect((await zf.put(`/api/wks/${id}/blocks/${b.id}/details/${z1}`).send([{ startMin: 585, endMin: 630, title: 'x', groupIds: [99999] }])).status).toBe(400);

    await zf.put(`/api/wks/${id}/zuege/${z1}/groups`).send([{ id: g2.id, name: 'Gr 2' }, { id: g3.id, name: 'Gr 3' }]);
    const details = (await zf.get(`/api/wks/${id}`)).body.details.filter((d: any) => d.blockId === b.id);
    expect(details.map((d: any) => d.title)).toEqual(['Alle', 'Gr 2+3 Po 2']);
  });
});

describe('Organisation (Org Admin and Bat Kdo)', () => {
  const kp = async () => (await db.prepare("SELECT id, bat_id FROM kompanie WHERE name = 'Pi Kp'").get()) as any;

  it('Org Admin and Bat Kdo edit the catalogue of a Kp; Zfhr cannot', async () => {
    const { id: kpId } = await kp();
    for (const email of ['admin@demo.ch', 'bat@demo.ch']) {
      const a = await login(email);
      expect((await a.get(`/api/kompanien/${kpId}/resources`)).status).toBe(200);
      const created = await a.post(`/api/kompanien/${kpId}/resources`).send({ kind: 'FAHRZEUG', name: `Bus ${email}` });
      expect(created.status).toBe(201);
      expect((await a.put(`/api/resources/${created.body.id}`).send({ kind: 'RAUM', name: 'Saal' })).body.kind).toBe('RAUM');
      expect((await a.delete(`/api/resources/${created.body.id}`)).status).toBe(200);
    }
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.post(`/api/kompanien/${kpId}/resources`).send({ kind: 'RAUM', name: 'x' })).status).toBe(403);
  });

  it('Bat Kdo edits the templates of the own Bataillon', async () => {
    const { id: kpId, bat_id: batId } = await kp();
    const bat = await login('bat@demo.ch');
    expect((await bat.get('/api/admin/org')).body.map((b: any) => b.id)).toEqual([batId]);
    const res = await bat.put(`/api/templates?batId=${batId}&kpId=${kpId}`).send([{ title: 'x', daysBefore: 10, ownerRole: 'ZFHR' }]);
    expect(res.body.source).toBe('KP');
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.put(`/api/templates?batId=${batId}`).send([])).status).toBe(403);
    expect((await kdt.get('/api/admin/org')).status).toBe(403);
  });
});

describe('Bataillon material', () => {
  const bat = async () => ((await db.prepare("SELECT id FROM bataillon").get()) as any).id;
  const kpByName = async (n: string) => ((await db.prepare('SELECT id FROM kompanie WHERE name = ?').get(n)) as any).id;
  const bus1 = async () => ((await db.prepare("SELECT id FROM resource WHERE name = 'Mannschaftsbus 1'").get()) as any).id;

  it('only Org Admin and Bat Kdo manage shared material; Kp Kdt sees it in the catalogue', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const list = (await kdt.get(`/api/kompanien/${(await kpByName('Pi Kp'))}/resources`)).body as any[];
    expect(list.find((r) => r.name === 'Mannschaftsbus 1').kpId).toBeNull();
    expect((await kdt.post('/api/resources').send({ batId: (await bat()), kpId: null, kind: 'FAHRZEUG', name: 'Bus' })).status).toBe(403);
    expect((await kdt.put(`/api/resources/${(await bus1())}`).send({ kind: 'FAHRZEUG', name: 'x' })).status).toBe(403);
    // Moving own material to the Bataillon is not allowed for the Kp Kdt either.
    const own = (await kdt.post('/api/resources').send({ batId: (await bat()), kpId: (await kpByName('Pi Kp')), kind: 'RAUM', name: 'Büro' })).body;
    expect((await kdt.put(`/api/resources/${own.id}`).send({ kind: 'RAUM', name: 'Büro', kpId: null })).status).toBe(403);

    const batKdo = await login('bat@demo.ch');
    expect((await batKdo.post('/api/resources').send({ batId: (await bat()), kpId: null, kind: 'FAHRZEUG', name: 'Bus 3' })).status).toBe(201);
    expect((await batKdo.put(`/api/resources/${own.id}`).send({ kind: 'RAUM', name: 'Büro', kpId: null })).body.kpId).toBeNull();
  });

  it('shared vehicles cannot be approved twice across Kompanien', async () => {
    const batKdo = await login('bat@demo.ch');
    const wk = (
      await batKdo
        .post('/api/wks')
        .send({ kpId: (await kpByName('Betreu Kp')), title: 'Einsatz', startDate: '2027-04-27', endDate: '2027-04-27', dayStart: 420, dayEnd: 1020, snapMin: 15 })
    ).body;
    const zf = await login('zfhr.betreu@demo.ch');
    const req = await zf.post(`/api/wks/${wk.id}/requests`).send({
      zugId: (await zugId('Betreu Z 1')),
      resourceId: (await bus1()),
      kind: 'FAHRZEUG',
      date: '2027-04-27',
      startMin: 600,
      endMin: 660,
      zweck: 'Transport',
    });
    expect(req.status).toBe(201);
    // The Betreu Kp sees the Pi Kp's approved booking of the same bus.
    const bookings = (await zf.get(`/api/wks/${wk.id}/bookings`)).body as any[];
    const bus = await bus1();
    expect(bookings.some((b) => b.kpName === 'Pi Kp' && b.resourceId === bus && b.status === 'BEWILLIGT')).toBe(true);
    const kdt = await login('kpkdt.betreu@demo.ch');
    expect((await kdt.post(`/api/wks/${wk.id}/requests/${req.body.id}/decide`).send({ status: 'BEWILLIGT' })).status).toBe(409);
  });

  it('material overview of the Bataillon for Org Admin and Bat Kdo only', async () => {
    const batKdo = await login('bat@demo.ch');
    const list = (await batKdo.get(`/api/bataillone/${(await bat())}/bookings`)).body as any[];
    expect(new Set(list.map((b) => b.kpName))).toEqual(new Set(['Pi Kp', 'Betreu Kp']));
    expect((await (await login('admin@demo.ch')).get(`/api/bataillone/${(await bat())}/resources`)).status).toBe(200);
    expect((await (await login('kpkdt@demo.ch')).get(`/api/bataillone/${(await bat())}/bookings`)).status).toBe(403);
  });
});

describe('Ausbildungsvorbereitung format', () => {
  it('stores durations and returns legacy documents converted', async () => {
    const id = await piWkId();
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    const zf = await login('zfhr1@demo.ch');
    const created = await zf.post(`/api/wks/${id}/avs`).send({
      blockId: b.id,
      zugId: (await zugId('Pi Z 1')),
      thema: 'Pumpen',
      zeitVon: '09:45',
      zeitBis: '10:30',
      ablauf: [{ dauer: 10, phase: 'P', text: 'Einstieg' }, { dauer: 35, phase: 'T1', text: 'Üben' }],
    });
    expect(created.body).toMatchObject({ zeitVon: '09:45', zeitBis: '10:30', zeit: '09:45–10:30' });
    expect(created.body.ablauf.map((r: any) => r.dauer)).toEqual([10, 35]);

    // A document stored by an earlier version (from/to per step).
    await db.prepare('UPDATE ausbildungsvorbereitung SET data = ? WHERE id = ?').run(
      JSON.stringify({ thema: 'Alt', zeit: '08:00–08:30', ablauf: [{ from: '08:00', to: '08:30', phase: 'I', text: 'x' }] }),
      created.body.id,
    );
    const old = (await zf.get(`/api/wks/${id}/avs/${created.body.id}`)).body;
    expect(old).toMatchObject({ zeitVon: '08:00', zeitBis: '08:30' });
    expect(old.ablauf).toEqual([{ dauer: 30, phase: 'I', text: 'x' }]);
  });
});

describe('Ausbildungsbefehl attachments', () => {
  it('Bat attaches a PDF; Kp Kdt can open it; non-PDF and Kp uploads are refused', async () => {
    const bat = await login('bat@demo.ch');
    const pdf = Buffer.from('%PDF-1.4\n%test\n');
    const up = await bat.post('/api/befehle/2028/files').set('Content-Type', 'application/pdf').set('X-Filename', encodeURIComponent('Befehl 2028.pdf')).send(pdf);
    expect(up.status).toBe(201);
    const befehl = (await bat.get('/api/befehle/2028')).body;
    expect(befehl.files.map((f: any) => f.name)).toEqual(['Befehl 2028.pdf']);
    expect((await bat.post('/api/befehle/2028/files').set('Content-Type', 'application/pdf').send(Buffer.from('hello'))).status).toBe(400);

    const kdt = await login('kpkdt@demo.ch');
    const file = await kdt.get(`/api/befehle/2028/files/${up.body.id}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect((await kdt.post('/api/befehle/2028/files').set('Content-Type', 'application/pdf').send(pdf)).status).toBe(403);
  });

  it('KVK can span several days', async () => {
    const bat = await login('bat@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const res = await bat.put('/api/befehle/2029').send({ auftraege: [{ kpId, kvkDates: ['2029-03-02', '2029-03-01'] }] });
    expect(res.body.auftraege[0].kvkDates).toEqual(['2029-03-01', '2029-03-02']);
  });
});

describe('Verwaltung: people per Zug', () => {
  it('several Zugführer per Zug; removing the main one clears the main Zugführer', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const z1 = await zugId('Pi Z 1');
    const gruber = ((await db.prepare("SELECT id FROM app_user WHERE email = 'zfhr1@demo.ch'").get()) as any).id;
    const ammann = ((await db.prepare("SELECT id FROM app_user WHERE email = 'zfhr1stv@demo.ch'").get()) as any).id;
    expect(((await db.prepare('SELECT zfhr_user_id FROM zug WHERE id = ?').get(z1)) as any).zfhr_user_id).toBe(gruber);
    expect((await kdt.patch(`/api/zuege/${z1}`).send({ zfhrUserId: ammann })).body.zfhrUserId).toBe(ammann);
    expect((await kdt.patch(`/api/users/${ammann}`).send({ zugId: null })).status).toBe(200);
    expect(((await db.prepare('SELECT zfhr_user_id FROM zug WHERE id = ?').get(z1)) as any).zfhr_user_id).toBeNull();
    // A second Kp Kdt for the same Kp can be added by the Bat.
    const bat = await login('bat@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const res = await bat.post('/api/users').send({ name: 'Oblt Huber', email: 'stv@demo.ch', role: 'KPKDT', kpId, zugId: null, password: 'geheim123' });
    expect(res.status).toBe(201);
  });
});

describe('requests by type and amount', () => {
  const kpOf = async (n: string) => ((await db.prepare('SELECT id FROM kompanie WHERE name = ?').get(n)) as any).id;
  const base = async (zug: string, quantity: number) => ({
    zugId: (await zugId(zug)),
    kind: 'FAHRZEUG',
    category: 'Mannschaftsbus',
    quantity,
    date: '2027-04-28',
    startMin: 480,
    endMin: 600,
    zweck: 'Transport',
  });

  it('Zfhr requests an amount; approval assigns free vehicles and refuses when not enough are free', async () => {
    const id = await piWkId();
    const zf = await login('zfhr1@demo.ch');
    const two = await zf.post(`/api/wks/${id}/requests`).send((await base('Pi Z 1', 2)));
    expect(two.status).toBe(201);
    expect(two.body).toMatchObject({ resourceId: null, category: 'Mannschaftsbus', quantity: 2, assignedIds: [] });
    expect((await zf.post(`/api/wks/${id}/requests`).send({ ...(await base('Pi Z 1', 1)), category: 'U-Boot' })).status).toBe(400);

    const logof = await login('logof@demo.ch');
    const avail = (await logof.get(`/api/wks/${id}/availability?kind=FAHRZEUG&category=Mannschaftsbus&date=2027-04-28&start=480&end=600`)).body;
    expect(avail.total).toBe(2);
    const ok = await logof.post(`/api/wks/${id}/requests/${two.body.id}/decide`).send({ status: 'BEWILLIGT' });
    expect(ok.body.assignedIds).toHaveLength(2);

    // Both buses are taken now: another request for one bus at the same time cannot be approved.
    const zf2 = await login('zfhr2@demo.ch');
    const one = await zf2.post(`/api/wks/${id}/requests`).send((await base('Pi Z 2', 1)));
    const refused = await logof.post(`/api/wks/${id}/requests/${one.body.id}/decide`).send({ status: 'BEWILLIGT' });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('Nur 0 von 1');

    // A specific bus that is assigned elsewhere is also taken.
    const specific = await zf2.post(`/api/wks/${id}/requests`).send({ ...(await base('Pi Z 2', 1)), resourceId: ok.body.assignedIds[0], category: '' });
    expect((await logof.post(`/api/wks/${id}/requests/${specific.body.id}/decide`).send({ status: 'BEWILLIGT' })).status).toBe(409);
  });

  it('the approver can choose the vehicles; the choice must be free and match the amount', async () => {
    const id = await piWkId();
    const zf = await login('zfhr1@demo.ch');
    const q = (await zf.post(`/api/wks/${id}/requests`).send({ ...(await base('Pi Z 1', 1)), category: 'Pickup' })).body;
    const kdt = await login('kpkdt@demo.ch');
    const free = (await kdt.get(`/api/wks/${id}/availability?kind=FAHRZEUG&category=Pickup&date=2027-04-28&start=480&end=600`)).body.free;
    expect((await kdt.post(`/api/wks/${id}/requests/${q.id}/decide`).send({ status: 'BEWILLIGT', assignedIds: free.map((x: any) => x.id) })).status).toBe(400);
    const res = await kdt.post(`/api/wks/${id}/requests/${q.id}/decide`).send({ status: 'BEWILLIGT', assignedIds: [free[1].id] });
    expect(res.body.assignedIds).toEqual([free[1].id]);
    // Assigned vehicles appear in the Bataillon's material overview.
    const bat = await login('bat@demo.ch');
    const batId = ((await db.prepare('SELECT bat_id FROM kompanie WHERE id = ?').get((await kpOf('Pi Kp')))) as any).bat_id;
    const bookings = (await bat.get(`/api/bataillone/${batId}/bookings`)).body as any[];
    expect(bookings.some((b) => b.requestId === q.id && b.resourceId === free[1].id)).toBe(true);
  });
});

describe('Ausbildungsvorbereitung assignment', () => {
  it('several people can be assigned; assigned Kader may edit, others not', async () => {
    const id = await piWkId();
    const b = await blockOf('Detailausbildung 1', 'Pi Z 1');
    const z1 = await zugId('Pi Z 1');
    const huber = ((await db.prepare("SELECT id FROM app_user WHERE email = 'kader@demo.ch'").get()) as any).id;
    const ammann = ((await db.prepare("SELECT id FROM app_user WHERE email = 'zfhr1stv@demo.ch'").get()) as any).id;
    // A second Kader in Pi Z 1 who is not assigned.
    const bat = await login('bat@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    await bat.post('/api/users').send({ name: 'Kpl Graf', email: 'graf@demo.ch', role: 'KADER', kpId, zugId: z1, password: 'geheim123' });

    const zf = await login('zfhr1@demo.ch');
    const av = await zf.post(`/api/wks/${id}/avs`).send({ blockId: b.id, zugId: z1, thema: 'Polycom', leiterUserIds: [huber, ammann, huber] });
    expect(av.body.leiterUserIds).toEqual([huber, ammann]);
    const kader = await login('kader@demo.ch');
    expect((await kader.put(`/api/wks/${id}/avs/${av.body.id}`).send({ blockId: b.id, zugId: z1, thema: 'Polycom 2', leiterUserIds: [huber] })).status).toBe(200);
    const graf = request.agent(app);
    expect((await graf.post('/api/auth/login').send({ email: 'graf@demo.ch', password: 'geheim123' })).status).toBe(200);
    expect((await graf.put(`/api/wks/${id}/avs/${av.body.id}`).send({ blockId: b.id, zugId: z1, thema: 'x' })).status).toBe(403);
    expect((await zf.post(`/api/wks/${id}/avs`).send({ blockId: b.id, zugId: z1, thema: 'x', leiterUserIds: [99999] })).status).toBe(400);
  });
});

describe('Meine Ausbildungen', () => {
  it('Kader see the lessons they are assigned to; Zugführer also the rest of their Zug', async () => {
    const id = await piWkId();
    const z1 = await zugId('Pi Z 1');
    const huber = ((await db.prepare("SELECT id FROM app_user WHERE email = 'kader@demo.ch'").get()) as any).id;
    const zf = await login('zfhr1@demo.ch');
    await zf.post(`/api/wks/${id}/avs`).send({ blockId: null, zugId: z1, thema: 'Pumpen', leiterUserIds: [huber] });
    await zf.post(`/api/wks/${id}/avs`).send({ blockId: null, zugId: z1, thema: 'Funk', leiterUserIds: [] });

    const kader = (await (await login('kader@demo.ch')).get('/api/me/ausbildungen')).body as any[];
    expect(kader.map((x) => x.av.thema).sort()).toEqual(['Kameradenhilfe', 'Pumpen']);
    expect(kader.every((x) => x.mine && x.zugName === 'Pi Z 1')).toBe(true);
    const zfhr = (await zf.get('/api/me/ausbildungen')).body as any[];
    expect(zfhr.map((x) => x.av.thema).sort()).toEqual(['Funk', 'Kameradenhilfe', 'Pumpen']);
    expect((await (await login('kader2@demo.ch')).get('/api/me/ausbildungen')).body).toEqual([]);
  });
});

describe('Bibliothek', () => {
  it('every member of the Bataillon reads all Ausbildungsvorbereitungen, also of other Züge and Kompanien', async () => {
    const id = await piWkId();
    const zf2 = await login('zfhr2@demo.ch');
    const created = await zf2.post(`/api/wks/${id}/avs`).send({ blockId: null, zugId: (await zugId('Pi Z 2')), thema: 'Rückhaltebecken', fachbereiche: ['PIONIER', 'KGS'] });
    expect(created.body.fachbereiche).toEqual(['PIONIER', 'KGS']);
    expect((await zf2.post(`/api/wks/${id}/avs`).send({ blockId: null, zugId: (await zugId('Pi Z 2')), thema: 'x', fachbereiche: ['LOGISTIK'] })).status).toBe(400);
    // Kader of Pi Z 1 cannot open the Pi Z 2 document directly, but finds it in the library.
    const kader = await login('kader@demo.ch');
    const lib = (await kader.get('/api/library')).body as any[];
    expect(lib.map((x) => x.av.thema).sort()).toEqual(['Kameradenhilfe', 'Rückhaltebecken']);
    expect(lib.find((x) => x.av.thema === 'Kameradenhilfe').av.fachbereiche).toEqual([]);
    expect(lib.find((x) => x.av.thema === 'Rückhaltebecken')).toMatchObject({ zugName: 'Pi Z 2', kpName: 'Pi Kp' });
    expect((await (await login('kpkdt.betreu@demo.ch')).get('/api/library')).body).toHaveLength(2);
    expect((await (await login('admin@demo.ch')).get('/api/library')).status).toBe(403);
  });
});

describe('Personal: Sollbestand, Teilnehmerliste, Check-in', () => {
  const DAY = '2027-04-28';
  const people = async () => [
    { nachname: 'Muster', vorname: 'Hans', grad: 'Sdt', funktion: 'Pionier', zugId: (await zugId('Pi Z 1')), extId: '1001' },
    { nachname: 'Müller', vorname: 'Anna', grad: 'Kpl', funktion: 'Gruppenführerin', zugId: (await zugId('Pi Z 1')), email: 'anna@example.ch' },
    { nachname: 'Meier', vorname: 'Peter', zugId: (await zugId('Pi Z 2')) },
    { nachname: 'Meier', vorname: 'Peter', zugId: (await zugId('Pi Z 3')) },
  ];

  it('Kp Kdt edits all planned headcounts, Zfhr only the own Zug, Kader none', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.put(`/api/wks/${id}/strength`).send({ entries: [{ zugId: (await zugId('Pi Z 2')), date: DAY, planned: 25 }] })).status).toBe(200);
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.put(`/api/wks/${id}/strength`).send({ entries: [{ zugId: (await zugId('Pi Z 1')), date: DAY, planned: 30 }] })).status).toBe(200);
    expect((await zf.put(`/api/wks/${id}/strength`).send({ entries: [{ zugId: (await zugId('Pi Z 2')), date: DAY, planned: 1 }] })).status).toBe(403);
    expect((await kdt.put(`/api/wks/${id}/strength`).send({ entries: [{ zugId: (await zugId('Pi Z 1')), date: '2020-01-01', planned: 1 }] })).status).toBe(400);
    const kader = await login('kader@demo.ch');
    expect((await kader.put(`/api/wks/${id}/strength`).send({ entries: [{ zugId: (await zugId('Pi Z 1')), date: DAY, planned: 1 }] })).status).toBe(403);
    const list = (await kader.get(`/api/wks/${id}/strength`)).body;
    expect(list).toEqual(expect.arrayContaining([{ zugId: (await zugId('Pi Z 1')), date: DAY, planned: 30 }, { zugId: (await zugId('Pi Z 2')), date: DAY, planned: 25 }]));
  });

  it('import merges by number or name; Zfhr sees the own Zug only; Kader no access', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.post(`/api/wks/${id}/participants/import`).send({ items: (await people()) })).body).toEqual({ added: 4, updated: 0, removed: 0 });
    const again = await kdt
      .post(`/api/wks/${id}/participants/import`)
      .send({ mode: 'replace', items: [{ nachname: 'Muster', vorname: 'Johann', extId: '1001' }, { nachname: 'Mueller', vorname: 'Anna' }] });
    // «Mueller» is «Müller»; Hans keeps his Zug and is renamed by number.
    expect(again.body).toEqual({ added: 0, updated: 2, removed: 2 });
    const list = (await kdt.get(`/api/wks/${id}/participants`)).body;
    expect(list.find((p: any) => p.extId === '1001')).toMatchObject({ vorname: 'Johann', zugId: (await zugId('Pi Z 1')) });
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.post(`/api/wks/${id}/participants/import`).send({ items: (await people()) })).status).toBe(403);
    expect((await zf.get(`/api/wks/${id}/participants`)).body.map((p: any) => p.vorname)).toEqual(['Anna', 'Johann']);
    expect((await (await login('kader@demo.ch')).get(`/api/wks/${id}/participants`)).status).toBe(403);
  });

  it('QR check-in matches by name or e-mail; ambiguous or unknown people are matched by the Kp Kdt', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    await kdt.post(`/api/wks/${id}/participants/import`).send({ items: (await people()) });
    const days = (await kdt.get(`/api/wks/${id}/checkin-days`)).body;
    const token = days.find((d: any) => d.date === DAY).token;
    const anon = request(app);
    const info = await anon.get(`/api/public/checkin/${token}`);
    expect(info.body).toMatchObject({ date: DAY, open: false, kpName: 'Pi Kp' });
    expect(info.body.zuege.length).toBeGreaterThan(0);
    const form = { vorname: 'hans', nachname: 'MUSTER', email: 'hans@example.ch', zugId: (await zugId('Pi Z 1')), diet: 'VEGETARISCH', intolerances: 'Laktosefrei', health: { points: [], note: '' } };
    expect(info.body.wkId).toBe(id);
    // Closed on other days unless opened.
    expect((await anon.post(`/api/public/checkin/${token}`).send(form)).status).toBe(409);
    await kdt.put(`/api/wks/${id}/checkin-days/${DAY}`).send({ mode: 'OPEN' });
    expect((await anon.post(`/api/public/checkin/${token}`).send(form)).body).toEqual({ matched: true, health: 'GESUND' });
    // Twice: one entry.
    await anon.post(`/api/public/checkin/${token}`).send(form);
    expect((await anon.post(`/api/public/checkin/${token}`).send({ ...form, vorname: 'Anna', nachname: 'X', email: 'ANNA@example.ch' })).body).toMatchObject({ matched: true });
    expect((await anon.post(`/api/public/checkin/${token}`).send({ ...form, vorname: 'Peter', nachname: 'Meier', email: 'p@x.ch' })).body).toMatchObject({ matched: false });
    expect((await anon.post(`/api/public/checkin/${token}`).send({ ...form, email: 'kein-mail' })).status).toBe(400);
    expect((await anon.get('/api/public/checkin/falsch')).status).toBe(404);

    const checkins = (await kdt.get(`/api/wks/${id}/checkins`)).body;
    expect(checkins).toHaveLength(3);
    const hans = (await kdt.get(`/api/wks/${id}/participants`)).body.find((p: any) => p.nachname === 'Muster');
    expect(hans).toMatchObject({ diet: 'VEGETARISCH', intolerances: 'Laktosefrei', email: 'hans@example.ch' });

    const peter = checkins.find((c: any) => c.participantId === null);
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.post(`/api/wks/${id}/checkins/${peter.id}/match`).send({ participantId: hans.id })).status).toBe(403);
    const z2 = await zugId('Pi Z 2');
    const target = (await kdt.get(`/api/wks/${id}/participants`)).body.find((p: any) => p.nachname === 'Meier' && p.zugId === z2);
    expect((await kdt.post(`/api/wks/${id}/checkins/${peter.id}/match`).send({ participantId: target.id })).body.participantId).toBe(target.id);
    // Not on the list at all: add the person.
    await anon.post(`/api/public/checkin/${token}`).send({ ...form, vorname: 'Neu', nachname: 'Person', email: 'neu@x.ch' });
    const neu = (await kdt.get(`/api/wks/${id}/checkins`)).body.find((c: any) => c.nachname === 'Person');
    const created = await kdt.post(`/api/wks/${id}/checkins/${neu.id}/match`).send({ create: { nachname: 'Person', vorname: 'Neu', zugId: (await zugId('Pi Z 1')) } });
    expect(created.body.participantId).toBeGreaterThan(0);
  });

  it('saves the language of the account and answers in it', async () => {
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.get('/api/auth/me')).body.lang).toBeNull();
    expect((await kdt.post('/api/auth/lang').send({ lang: 'es' })).status).toBe(400);
    expect((await kdt.post('/api/auth/lang').send({ lang: 'it' })).body.lang).toBe('it');
    expect((await kdt.get('/api/auth/me')).body.lang).toBe('it');
    expect((await kdt.post('/api/auth/lang').send({ lang: 42 })).body.error).toMatch(/^Immissione non valida/);
  });

  it('sanitarische Eintrittsbefragung: required once per person, reports go to the Kp Kdt, Zfhr see restrictions only', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    await kdt.post(`/api/wks/${id}/participants/import`).send({ items: (await people()) });
    const token = (await kdt.get(`/api/wks/${id}/checkin-days`)).body.find((d: any) => d.date === DAY).token;
    await kdt.put(`/api/wks/${id}/checkin-days/${DAY}`).send({ mode: 'OPEN' });
    const anon = request(app);
    const z1 = await zugId('Pi Z 1');
    const hans = { vorname: 'Hans', nachname: 'Muster', email: 'hans@example.ch', zugId: z1, diet: 'NORMAL', intolerances: '' };
    // Without the answers: asked for them, nothing stored.
    const missing = await anon.post(`/api/public/checkin/${token}`).send(hans);
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe('HEALTH_REQUIRED');
    expect(missing.body.error).toBe('Bitte zuerst die sanitarische Eintrittsbefragung ausfüllen');
    // The message in the language of the phone (Accept-Language) or of the page (X-Lang).
    expect((await anon.post(`/api/public/checkin/${token}`).set('Accept-Language', 'fr-CH,fr;q=0.9').send(hans)).body.error).toBe('Veuillez d’abord remplir le questionnaire sanitaire d’entrée');
    expect((await anon.post(`/api/public/checkin/${token}`).set('Accept-Language', 'fr-CH').set('X-Lang', 'it').send(hans)).body.error).toMatch(/interrogazione sanitaria/);
    expect((await kdt.get(`/api/wks/${id}/checkins`)).body).toHaveLength(0);
    // Reports point C: a report for the Kursarzt.
    const sick = await anon.post(`/api/public/checkin/${token}`).send({ ...hans, health: { points: ['C', 'C'], note: 'Knie' } });
    expect(sick.body).toEqual({ matched: true, health: 'MELDUNG' });
    // Answered once: the next check-in works without the questionnaire.
    expect((await anon.post(`/api/public/checkin/${token}`).send(hans)).body).toEqual({ matched: true, health: 'MELDUNG' });
    const all = (await kdt.get(`/api/wks/${id}/health`)).body;
    expect(all).toMatchObject([{ vorname: 'Hans', points: ['C'], note: 'Knie', status: 'MELDUNG', source: 'SELF' }]);
    expect((await kdt.put(`/api/wks/${id}/health/${all[0].id}`).send({ status: 'KURSARZT', restriction: 'Keine Lasten über 10 kg' })).body).toMatchObject({
      status: 'KURSARZT',
      restriction: 'Keine Lasten über 10 kg',
    });
    // Zugführer: the restriction, not the health details.
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.get(`/api/wks/${id}/health`)).body).toMatchObject([{ vorname: 'Hans', points: [], note: '', restriction: 'Keine Lasten über 10 kg' }]);
    expect((await zf.put(`/api/wks/${id}/health/${all[0].id}`).send({ status: 'ERLEDIGT' })).status).toBe(403);
    expect((await (await login('zfhr2@demo.ch')).get(`/api/wks/${id}/health`)).body).toEqual([]);
    expect((await (await login('kader@demo.ch')).get(`/api/wks/${id}/health`)).status).toBe(403);
    // Asked in person: recorded by the Kp Kdt, once.
    const anna = (await kdt.get(`/api/wks/${id}/participants`)).body.find((p: any) => p.vorname === 'Anna');
    expect((await kdt.post(`/api/wks/${id}/health`).send({ participantId: anna.id, points: [], note: '' })).body).toMatchObject({ status: 'GESUND', source: 'MANUAL' });
    expect((await kdt.post(`/api/wks/${id}/health`).send({ participantId: anna.id, points: [], note: '' })).status).toBe(409);
    expect((await zf.post(`/api/wks/${id}/health`).send({ participantId: anna.id, points: [], note: '' })).status).toBe(403);
  });

  it('check-in without e-mail: by name; two people without e-mail stay apart', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    await kdt.post(`/api/wks/${id}/participants/import`).send({ items: (await people()) });
    const token = (await kdt.get(`/api/wks/${id}/checkin-days`)).body.find((d: any) => d.date === DAY).token;
    await kdt.put(`/api/wks/${id}/checkin-days/${DAY}`).send({ mode: 'OPEN' });
    const anon = request(app);
    const base = { email: '', zugId: (await zugId('Pi Z 1')), diet: 'NORMAL', intolerances: '' };
    const healthy = { points: [], note: '' };
    // On the list: matched by name.
    expect((await anon.post(`/api/public/checkin/${token}`).send({ ...base, vorname: 'Hans', nachname: 'Muster', health: healthy })).body).toEqual({ matched: true, health: 'GESUND' });
    // Not on the list, no e-mail: each person their own check-in and Eintrittsbefragung.
    expect((await anon.post(`/api/public/checkin/${token}`).send({ ...base, vorname: 'Lea', nachname: 'Neu', health: healthy })).body).toEqual({ matched: false, health: 'GESUND' });
    const other = await anon.post(`/api/public/checkin/${token}`).send({ ...base, vorname: 'Tim', nachname: 'Neu' });
    expect(other.body.code).toBe('HEALTH_REQUIRED');
    await anon.post(`/api/public/checkin/${token}`).send({ ...base, vorname: 'Tim', nachname: 'Neu', health: { points: ['E'], note: '' } });
    // Lea again: no questions, same entry.
    expect((await anon.post(`/api/public/checkin/${token}`).send({ ...base, vorname: 'lea', nachname: 'NEU' })).body).toEqual({ matched: false, health: 'GESUND' });
    const checkins = (await kdt.get(`/api/wks/${id}/checkins`)).body;
    // Lea's second check-in updated her entry (with the spelling given then).
    expect(checkins.map((c: any) => c.vorname.toLowerCase()).sort()).toEqual(['hans', 'lea', 'tim']);
    expect((await kdt.get(`/api/wks/${id}/health`)).body.map((h: any) => [h.vorname, h.status])).toEqual([
      ['Hans', 'GESUND'],
      ['Lea', 'GESUND'],
      ['Tim', 'MELDUNG'],
    ]);
  });

  it('Zfhr marks people of the own Zug present by hand', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    await kdt.post(`/api/wks/${id}/participants/import`).send({ items: (await people()) });
    const list = (await kdt.get(`/api/wks/${id}/participants`)).body;
    const own = list.find((p: any) => p.nachname === 'Muster');
    const z2 = await zugId('Pi Z 2');
    const other = list.find((p: any) => p.zugId === z2);
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.post(`/api/wks/${id}/presence`).send({ participantId: own.id, date: DAY, present: true })).status).toBe(200);
    expect((await zf.post(`/api/wks/${id}/presence`).send({ participantId: other.id, date: DAY, present: true })).status).toBe(403);
    expect((await zf.get(`/api/wks/${id}/checkins`)).body).toMatchObject([{ participantId: own.id, source: 'MANUAL' }]);
    await zf.post(`/api/wks/${id}/presence`).send({ participantId: own.id, date: DAY, present: false });
    expect((await kdt.get(`/api/wks/${id}/checkins`)).body).toHaveLength(0);
  });
});

describe('Gruppen', () => {
  it('Kp Kdt sets the Gruppen of a Zug; Bestand is their sum; new WKs take them over; the Jahresplanung plans them', async () => {
    const kdt = await login('kpkdt@demo.ch');
    const z1 = await zugId('Pi Z 1');
    const kader = ((await db.prepare("SELECT id FROM app_user WHERE email = 'kader@demo.ch'").get()) as any).id;
    const b = (kader_: number, sdt: number) => ({ kader: kader_, sdt });
    const saved = await kdt.put(`/api/zuege/${z1}/gruppen`).send({
      items: [
        { name: 'Gruppe 1', leiterUserId: kader, soll: b(2, 8), ist: b(2, 6) },
        { name: 'Gruppe 2', leiterUserId: null, soll: b(1, 7), ist: b(1, 7) },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.gruppen.map((g: any) => [g.name, g.leiterUserId, g.soll])).toEqual([
      ['Gruppe 1', kader, { zfhr: 0, kader: 2, sdt: 8 }],
      ['Gruppe 2', null, { zfhr: 0, kader: 1, sdt: 7 }],
    ]);
    expect(saved.body.soll).toMatchObject({ kader: 3, sdt: 15 });
    expect(saved.body.ist).toMatchObject({ kader: 3, sdt: 13 });
    // Rename one, drop the other.
    const g1 = saved.body.gruppen[0];
    const again = await kdt.put(`/api/zuege/${z1}/gruppen`).send({ items: [{ ...g1, name: 'Gr 1' }] });
    expect(again.body.gruppen.map((g: any) => [g.id, g.name])).toEqual([[g1.id, 'Gr 1']]);
    // Zugführer and Kader may not; a Gruppenführer from another Kp is refused.
    expect((await (await login('zfhr1@demo.ch')).put(`/api/zuege/${z1}/gruppen`).send({ items: [] })).status).toBe(403);
    const bat = await login('bat@demo.ch');
    const batUser = ((await db.prepare("SELECT id FROM app_user WHERE email = 'bat@demo.ch'").get()) as any).id;
    expect((await kdt.put(`/api/zuege/${z1}/gruppen`).send({ items: [{ name: 'X', leiterUserId: batUser, soll: b(0, 0), ist: b(0, 0) }] })).status).toBe(400);
    expect((await kdt.get('/api/org')).body.zuege.find((z: any) => z.id === z1).gruppen).toHaveLength(1);
    // A new WK takes the Gruppen over for the Detailplanung.
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const wk = await bat.post('/api/wks').send({ kpId, title: 'WK G', startDate: '2027-10-04', endDate: '2027-10-06', dayStart: 450, dayEnd: 1020, snapMin: 15 });
    const detail = (await bat.get(`/api/wks/${wk.body.id}`)).body;
    expect(detail.groups.filter((g: any) => g.zugId === z1).map((g: any) => g.name)).toEqual(['Gr 1']);
    // Jahresplanung: a Gruppe gets its own days; unknown Gruppen are dropped.
    const patched = await bat.patch(`/api/wks/${wk.body.id}`).send({ dayDuty: { '2027-10-04': { [`${z1}.g${g1.id}`]: 'NONE', [`${z1}.g999`]: 'NONE' } } });
    expect(patched.body.dayDuty).toEqual({ '2027-10-04': { [`${z1}.g${g1.id}`]: 'NONE' } });
  });
});

describe('trailers', () => {
  it('trailers are a kind of their own: no seats, not used for transporting people', async () => {
    const bat = await login('bat@demo.ch');
    const batId = ((await db.prepare('SELECT id FROM bataillon LIMIT 1').get()) as any).id;
    const t = await bat.post('/api/resources').send({ batId, kpId: null, kind: 'ANHAENGER', category: 'Anhänger', name: 'Wasserwehr', seats: 4, capacity: '4 Pl.' });
    expect(t.body).toMatchObject({ kind: 'ANHAENGER', seats: 0 });
    const zf = await login('zfhr1@demo.ch');
    const base = { zugId: (await zugId('Pi Z 1')), date: '2027-04-28', startMin: 600, endMin: 660, zweck: 'Material' };
    expect((await zf.post(`/api/wks/${(await piWkId())}/requests`).send({ ...base, kind: 'ANHAENGER', persons: 5 })).status).toBe(400);
    expect((await zf.post(`/api/wks/${(await piWkId())}/requests`).send({ ...base, kind: 'ANHAENGER', category: 'Anhänger', quantity: 1 })).status).toBe(201);
  });
});

describe('catalogue order', () => {
  it('numbered vehicles come first, by number; then the others by name; trailers after vehicles', async () => {
    const bat = await login('bat@demo.ch');
    const batId = ((await db.prepare('SELECT id FROM bataillon LIMIT 1').get()) as any).id;
    await db.prepare('DELETE FROM resource_request').run();
    await db.prepare('DELETE FROM resource').run();
    const add = (name: string, nr: number | null, kind = 'FAHRZEUG') => bat.post('/api/resources').send({ batId, kpId: null, kind, name, nr });
    for (const [n, nr] of [['MARO 1', null], ['Vito 4', 4], ['Fz Ex 1', null], ['MAN 1', 1], ['Log 3', 3]] as const) await add(n, nr);
    await add('KGS', null, 'ANHAENGER');
    const list = (await bat.get(`/api/bataillone/${batId}/resources`)).body.map((r: any) => r.name);
    expect(list).toEqual(['MAN 1', 'Log 3', 'Vito 4', 'Fz Ex 1', 'MARO 1', 'KGS']);
  });
});

describe('Rapporte und Pendenzen', () => {
  const uid = async (email: string) => ((await db.prepare('SELECT id FROM app_user WHERE email = ?').get(email)) as any).id;

  it('Kp Kdt holds a Kaderrapport along the schema; Kader read it but cannot edit', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    const rap = await kdt.post(`/api/wks/${id}/rapporte`).send({ zugId: null, schema: 'AUSB_DURCH', title: 'Kaderrapport', date: '2027-04-27', startMin: 1020 });
    expect(rap.status).toBe(201);
    expect(rap.body.traktanden.map((t: any) => t.title)).toEqual([
      'Ziel des Rapports',
      'Stand der Arbeiten',
      'Logistische Belange',
      'Einrücken',
      'Erreichbarkeit',
      'Administratives',
      'Umfrage',
      'Nächster Rapport',
    ]);
    expect(rap.body.leitungUserId).toBe((await uid('kpkdt@demo.ch')));
    const body = { ...rap.body, protokollUserId: (await uid('zfhr1@demo.ch')), teilnehmerIds: [(await uid('zfhr1@demo.ch')), (await uid('zfhr2@demo.ch'))] };
    body.traktanden[1].notes = 'Bestand vollständig';
    expect((await kdt.put(`/api/wks/${id}/rapporte/${rap.body.id}`).send(body)).body.traktanden[1].notes).toBe('Bestand vollständig');

    const kader = await login('kader@demo.ch');
    expect((await kader.get(`/api/wks/${id}/rapporte`)).body).toHaveLength(1);
    expect((await kader.put(`/api/wks/${id}/rapporte/${rap.body.id}`).send(body)).status).toBe(403);
    expect((await kader.post(`/api/wks/${id}/rapporte`).send({ zugId: null, schema: 'FREI', title: 'x', date: '2027-04-27' })).status).toBe(403);
    // The minute taker edits.
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.put(`/api/wks/${id}/rapporte/${rap.body.id}`).send({ ...body, ort: 'KP' })).status).toBe(200);
    // Closed: no more changes until reopened.
    await kdt.put(`/api/wks/${id}/rapporte/${rap.body.id}`).send({ ...body, status: 'ABGESCHLOSSEN' });
    expect((await zf.put(`/api/wks/${id}/rapporte/${rap.body.id}`).send({ ...body, status: 'ABGESCHLOSSEN', ort: 'y' })).status).toBe(409);
    expect((await zf.put(`/api/wks/${id}/rapporte/${rap.body.id}`).send({ ...body, status: 'OFFEN' })).body.status).toBe('OFFEN');
  });

  it('Zug Rapporte: Zfhr for the own Zug, hidden from other Züge; a follow-up takes over participants', async () => {
    const id = await piWkId();
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.post(`/api/wks/${id}/rapporte`).send({ zugId: (await zugId('Pi Z 2')), schema: 'FREI', title: 'x', date: '2027-04-27' })).status).toBe(403);
    const r1 = await zf
      .post(`/api/wks/${id}/rapporte`)
      .send({ zugId: (await zugId('Pi Z 1')), schema: 'AUSB_VORB', title: 'Zugrapport', date: '2027-04-26', teilnehmerIds: [(await uid('kader@demo.ch'))], ort: 'Werkhof' });
    expect(r1.status).toBe(201);
    const next = await zf.post(`/api/wks/${id}/rapporte`).send({ zugId: (await zugId('Pi Z 1')), fromRapportId: r1.body.id, date: '2027-04-27' });
    expect(next.body).toMatchObject({ schema: 'AUSB_VORB', ort: 'Werkhof', teilnehmerIds: [(await uid('kader@demo.ch'))] });
    expect((await (await login('kader2@demo.ch')).get(`/api/wks/${id}/rapporte`)).body).toHaveLength(0);
    expect((await (await login('kader@demo.ch')).get(`/api/wks/${id}/rapporte`)).body).toHaveLength(2);
  });

  it('Pendenzen from a Traktandum: responsible person ticks off; others cannot', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    const rap = (await kdt.post(`/api/wks/${id}/rapporte`).send({ zugId: null, schema: 'AUSB_VORB', title: 'Rapport', date: '2027-04-26' })).body;
    const p = await kdt
      .post(`/api/wks/${id}/pendenzen`)
      .send({ rapportId: rap.id, traktandumKey: 'auftraege', text: 'Fahrzeuge beantragen', responsibleUserId: (await uid('zfhr1@demo.ch')), dueDate: '2027-04-20' });
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ responsibleName: 'Lt Gruber', done: false, zugId: null });
    expect((await kdt.post(`/api/wks/${id}/pendenzen`).send({ rapportId: rap.id, traktandumKey: 'gibtsnicht', text: 'x' })).status).toBe(400);
    const other = await login('zfhr2@demo.ch');
    expect((await other.post(`/api/wks/${id}/pendenzen/${p.body.id}/done`).send({ done: true })).status).toBe(403);
    const zf = await login('zfhr1@demo.ch');
    const done = await zf.post(`/api/wks/${id}/pendenzen/${p.body.id}/done`).send({ done: true });
    expect(done.body).toMatchObject({ done: true, doneByName: 'Lt Gruber' });
    expect((await zf.put(`/api/wks/${id}/pendenzen/${p.body.id}`).send({ text: 'anders' })).status).toBe(403);
    // Deleting the Rapport keeps its Pendenzen.
    await kdt.delete(`/api/wks/${id}/rapporte/${rap.id}`);
    expect((await kdt.get(`/api/wks/${id}/pendenzen`)).body).toMatchObject([{ id: p.body.id, rapportId: null }]);
  });
});

describe('password gate', () => {
  const env = { GATE_USER: 'zs', GATE_PASSWORD: 'geheim-123' };
  const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

  it('asks for the gate password before the app; the QR check-in stays public', async () => {
    const gated = request(createApp(db, env));
    const res = await gated.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toMatch(/^Basic realm="WK-Planer"/);
    expect((await gated.get('/api/auth/me').set('Authorization', basic('zs', 'falsch'))).status).toBe(401);
    // Past the gate: the app's own login answers.
    const me = await gated.get('/api/auth/me').set('Authorization', basic('zs', 'geheim-123'));
    expect(me.status).toBe(401);
    expect(me.body.error).toBe('Nicht angemeldet');
    // Check-in API without the gate (unknown token → 404 from the app, not 401 from the gate).
    expect((await gated.get('/api/public/checkin/unbekannt')).status).toBe(404);
    // What the phone loads for the check-in page and the service worker is not behind the gate either.
    for (const path of ['/checkin/abc', '/icons/icon-192.png', '/index.html', '/sw.js', '/manifest.webmanifest', '/assets/x.js']) {
      expect((await gated.get(path)).status, path).not.toBe(401);
    }
    // But the rest of the app is.
    for (const path of ['/', '/wk/1', '/api/wks', '/icons/../api/wks']) expect((await gated.get(path)).status, path).toBe(401);
  });

  it('locks out after repeated wrong passwords', async () => {
    const gated = request(createApp(db, env));
    for (let i = 0; i < 10; i++) await gated.get('/').set('Authorization', basic('zs', `x${i}`));
    expect((await gated.get('/').set('Authorization', basic('zs', 'geheim-123'))).status).toBe(429);
  });

  it('is off without GATE_PASSWORD', async () => {
    expect((await request(createApp(db, {})).get('/api/auth/me')).body.error).toBe('Nicht angemeldet');
  });
});

describe('Mein Konto', () => {
  it('changes the own e-mail with the current password; taken addresses are refused', async () => {
    const a = await login('kader@demo.ch');
    expect((await a.post('/api/auth/email').send({ email: 'neu@example.ch', password: 'falsch' })).status).toBe(400);
    expect((await a.post('/api/auth/email').send({ email: 'ZFHR1@demo.ch', password: DEMO_PASSWORD })).status).toBe(409);
    expect((await a.post('/api/auth/email').send({ email: 'kein-mail', password: DEMO_PASSWORD })).status).toBe(400);
    const ok = await a.post('/api/auth/email').send({ email: ' Huber@Example.ch ', password: DEMO_PASSWORD });
    expect(ok.body.email).toBe('huber@example.ch');
    // Login with the new address (any case), not the old one.
    expect((await request(app).post('/api/auth/login').send({ email: 'HUBER@example.ch', password: DEMO_PASSWORD })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'kader@demo.ch', password: DEMO_PASSWORD })).status).toBe(401);
  });

  it('changes the password; other devices are signed out', async () => {
    const here = await login('kader@demo.ch');
    const other = await login('kader@demo.ch');
    expect((await here.post('/api/auth/password').send({ oldPassword: 'falsch', newPassword: 'neues-passwort' })).status).toBe(400);
    expect((await here.post('/api/auth/password').send({ oldPassword: DEMO_PASSWORD, newPassword: 'kurz' })).status).toBe(400);
    expect((await here.post('/api/auth/password').send({ oldPassword: DEMO_PASSWORD, newPassword: 'neues-passwort' })).status).toBe(200);
    expect((await here.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'kader@demo.ch', password: 'neues-passwort' })).status).toBe(200);
  });
});

describe('Befehl erstellt WKs', () => {
  const kp = async (name: string) => ((await db.prepare('SELECT id FROM kompanie WHERE name = ?').get(name)) as any).id;
  const befehl = (auftraege: object[]) => ({ dienstart: 'WK', leitziel: '', absicht: '', organisation: '', besonderes: '', auftraege });

  it('creates a WK per Kp with dates, links an existing one, and follows date changes while it is a draft', async () => {
    const bat = await login('bat@demo.ch');
    const pi = await kp('Pi Kp');
    const betreu = await kp('Betreu Kp');
    const res = await bat.put('/api/befehle/2029').send(
      befehl([
        { kpId: betreu, richtziele: '', teilnehmende: '', kvkDates: ['2029-08-20'], wkFrom: '2029-09-03', wkTo: '2029-09-07' },
        { kpId: pi, richtziele: '', teilnehmende: '', kvkDates: [], wkFrom: '', wkTo: '' },
      ]),
    );
    expect(res.status).toBe(200);
    const created = res.body.wks.find((w: any) => w.kpId === betreu);
    expect(created).toMatchObject({ action: 'created', kpName: 'Betreu Kp' });
    expect(res.body.wks.find((w: any) => w.kpId === pi).action).toBe('no-dates');
    expect(res.body.auftraege.find((a: any) => a.kpId === betreu).wkId).toBe(created.wkId);
    const wk = (await (await login('kpkdt.betreu@demo.ch')).get(`/api/wks/${created.wkId}`)).body.wk;
    expect(wk).toMatchObject({ title: 'WK 2029 Betreu Kp', startDate: '2029-09-03', endDate: '2029-09-07', kvkDays: ['2029-08-20'], avorDays: [], status: 'ENTWURF' });
    expect(((await db.prepare('SELECT COUNT(*) AS n FROM milestone WHERE wk_id = ?').get(created.wkId)) as any).n).toBeGreaterThan(0);

    // Saving again with other dates: same WK, new dates; nothing new is created.
    const again = await bat.put('/api/befehle/2029').send(
      befehl([{ kpId: betreu, richtziele: '', teilnehmende: '', kvkDates: ['2029-08-20'], wkFrom: '2029-09-10', wkTo: '2029-09-14' }]),
    );
    expect(again.body.wks[0]).toMatchObject({ action: 'updated', wkId: created.wkId });
    expect(((await db.prepare("SELECT COUNT(*) AS n FROM wk WHERE title = 'WK 2029 Betreu Kp'").get()) as any).n).toBe(1);
    // Approved: dates are no longer changed.
    await db.prepare("UPDATE wk SET status = 'FREIGEGEBEN' WHERE id = ?").run(created.wkId);
    const locked = await bat.put('/api/befehle/2029').send(
      befehl([{ kpId: betreu, richtziele: '', teilnehmende: '', kvkDates: [], wkFrom: '2029-09-17', wkTo: '2029-09-21' }]),
    );
    expect(locked.body.wks[0].action).toBe('locked');
  });

  it('links the WK that already exists in the period instead of creating a second one', async () => {
    const bat = await login('bat@demo.ch');
    const pi = await kp('Pi Kp');
    const res = await bat.put('/api/befehle/2027').send(befehl([{ kpId: pi, richtziele: '', teilnehmende: '', kvkDates: [], wkFrom: '2027-04-27', wkTo: '2027-04-30' }]));
    expect(res.body.wks[0]).toMatchObject({ action: 'linked', wkId: await piWkId() });
  });
});

describe('Standardblöcke', () => {
  it('defaults include lunch for everyone; Kp Kdt saves own ones; Zfhr reads only', async () => {
    const piKp = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const kdt = await login('kpkdt@demo.ch');
    const def = (await kdt.get(`/api/kompanien/${piKp}/standardbloecke`)).body;
    expect(def.source).toBe('DEFAULT');
    expect(def.items.find((b: any) => b.title === 'Mittagessen')).toMatchObject({ scope: 'ALLE', type: 'VERPFLEGUNG' });
    const items = [...def.items, { title: 'Znüni', type: 'VERPFLEGUNG', startMin: 600, endMin: 615, scope: 'ZUEGE', locked: false }];
    expect((await kdt.put(`/api/kompanien/${piKp}/standardbloecke`).send(items)).status).toBe(200);
    const zf = await login('zfhr1@demo.ch');
    expect((await zf.get(`/api/kompanien/${piKp}/standardbloecke`)).body).toMatchObject({ source: 'KP', items: expect.arrayContaining([expect.objectContaining({ title: 'Znüni' })]) });
    expect((await zf.put(`/api/kompanien/${piKp}/standardbloecke`).send(items)).status).toBe(403);
    expect((await kdt.put(`/api/kompanien/${piKp}/standardbloecke`).send([{ ...items[0], endMin: items[0].startMin }])).status).toBe(400);
    const other = await login('kpkdt.betreu@demo.ch');
    expect((await other.get(`/api/kompanien/${piKp}/standardbloecke`)).status).toBe(403);
  });
});

describe('WK-Konzept: Zielsetzungen pro Zug', () => {
  it('stores Züge per goal; old plain goals count for all Züge; foreign Züge are dropped', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    const z1 = await zugId('Pi Z 1');
    const foreign = ((await db.prepare("SELECT z.id FROM zug z JOIN kompanie k ON k.id = z.kp_id WHERE k.name = 'Betreu Kp' LIMIT 1").get()) as any).id;
    await db.prepare("UPDATE konzept SET data = ? WHERE wk_id = ?").run(JSON.stringify({ zielsetzungen: ['Alte Zielsetzung'] }), id);
    expect((await kdt.get(`/api/wks/${id}/konzept`)).body.zielsetzungen).toEqual([{ text: 'Alte Zielsetzung', zugIds: [] }]);
    const saved = await kdt.put(`/api/wks/${id}/konzept`).send({ zielsetzungen: [{ text: 'Für alle', zugIds: [] }, { text: 'Nur Pi Z 1', zugIds: [z1, foreign] }] });
    expect(saved.body.zielsetzungen).toEqual([{ text: 'Für alle', zugIds: [] }, { text: 'Nur Pi Z 1', zugIds: [z1] }]);
  });
});

describe('Anhänge und Dateien', () => {
  const put = (agent: any, url: string, name: string, mime: string, body: Buffer) =>
    agent.post(url).set('Content-Type', 'application/octet-stream').set('X-Filename', encodeURIComponent(name)).set('X-Mime', mime).send(body);

  it('AV attachments: editors upload; the Zug and the Bibliothek read; downloads never run HTML', async () => {
    const id = await piWkId();
    const kader = await login('kader@demo.ch');
    const av = await kader.post(`/api/wks/${id}/avs`).send({ blockId: null, zugId: await zugId('Pi Z 1'), thema: 'Knoten' });
    expect(av.status).toBe(201);
    const pdf = Buffer.from('%PDF-1.4 test');
    expect((await put(kader, `/api/avs/${av.body.id}/attachments`, 'Merkblatt Knoten.pdf', 'application/pdf', pdf)).status).toBe(201);
    const html = await put(kader, `/api/avs/${av.body.id}/attachments`, 'böse.html', 'text/html', Buffer.from('<script>alert(1)</script>'));
    expect(html.status).toBe(201);
    const list = (await kader.get(`/api/avs/${av.body.id}/attachments`)).body;
    expect(list.map((a: any) => a.name).sort()).toEqual(['Merkblatt Knoten.pdf', 'böse.html']);
    expect(list.every((a: any) => a.canDelete)).toBe(true);
    // Count in the lists
    expect((await kader.get(`/api/wks/${id}/avs/${av.body.id}`)).body.attachmentCount).toBe(2);

    const pdfDl = await kader.get(`/api/attachments/${list.find((a: any) => a.name.endsWith('.pdf')).id}`);
    expect(pdfDl.headers['content-type']).toBe('application/pdf');
    expect(pdfDl.headers['content-disposition']).toMatch(/^inline/);
    const htmlDl = await kader.get(`/api/attachments/${html.body.id}`);
    expect(htmlDl.headers['content-type']).toBe('application/octet-stream');
    expect(htmlDl.headers['content-disposition']).toMatch(/^attachment/);
    expect(htmlDl.headers['content-security-policy']).toMatch(/sandbox/);

    // Kader of another Zug: may not upload; reads via the Bibliothek (same Bataillon).
    const other = await login('kader2@demo.ch');
    expect((await put(other, `/api/avs/${av.body.id}/attachments`, 'x.pdf', 'application/pdf', pdf)).status).toBe(403);
    expect((await other.get(`/api/attachments/${html.body.id}`)).status).toBe(200);
    expect((await other.delete(`/api/attachments/${html.body.id}`)).status).toBe(403);
    expect((await kader.delete(`/api/attachments/${html.body.id}`)).status).toBe(200);
    // Deleting the AV removes its files.
    await kader.delete(`/api/wks/${id}/avs/${av.body.id}`);
    expect(((await db.prepare('SELECT COUNT(*) AS n FROM attachment').get()) as any).n).toBe(0);
  });

  it('file area per Zug: members share; Kader of other Züge see nothing; uploader, Zfhr and Kp Kdt delete', async () => {
    const z1 = await zugId('Pi Z 1');
    const kader = await login('kader@demo.ch');
    const up = await put(kader, `/api/zuege/${z1}/files`, 'Einteilung.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from('xlsx'));
    expect(up.status).toBe(201);
    const zf = await login('zfhr1@demo.ch');
    const zfUp = await put(zf, `/api/zuege/${z1}/files`, 'Zugbefehl.pdf', 'application/pdf', Buffer.from('%PDF-'));
    const list = (await kader.get(`/api/zuege/${z1}/files`)).body;
    expect(list.map((f: any) => [f.name, f.canDelete])).toEqual(
      expect.arrayContaining([
        ['Einteilung.xlsx', true],
        ['Zugbefehl.pdf', false],
      ]),
    );
    const kader2 = await login('kader2@demo.ch');
    expect((await kader2.get(`/api/zuege/${z1}/files`)).status).toBe(403);
    expect((await kader2.get(`/api/attachments/${up.body.id}`)).status).toBe(403);
    expect((await put(kader2, `/api/zuege/${z1}/files`, 'x.pdf', 'application/pdf', Buffer.from('%PDF-'))).status).toBe(403);
    expect((await (await login('zfhr2@demo.ch')).get(`/api/zuege/${z1}/files`)).status).toBe(200);
    expect((await kader.delete(`/api/attachments/${zfUp.body.id}`)).status).toBe(403);
    expect((await zf.delete(`/api/attachments/${up.body.id}`)).status).toBe(200);
    expect((await (await login('kpkdt@demo.ch')).delete(`/api/attachments/${zfUp.body.id}`)).status).toBe(200);
    // Other Kompanie: no access.
    expect((await (await login('kpkdt.betreu@demo.ch')).get(`/api/zuege/${z1}/files`)).status).toBe(403);
  });

  it('refuses empty and too large files', async () => {
    const z1 = await zugId('Pi Z 1');
    const zf = await login('zfhr1@demo.ch');
    expect((await put(zf, `/api/zuege/${z1}/files`, 'leer.txt', 'text/plain', Buffer.alloc(0))).status).toBe(400);
    expect((await put(zf, `/api/zuege/${z1}/files`, 'gross.bin', 'application/octet-stream', Buffer.alloc(26 * 1024 * 1024))).status).toBe(413);
  });
});

describe('Anhänge beim Wiederverwenden', () => {
  it('«Als Vorlage verwenden» copies the attachments; only editors of the new document may do so', async () => {
    const id = await piWkId();
    const kader = await login('kader@demo.ch');
    const src = (await kader.post(`/api/wks/${id}/avs`).send({ blockId: null, zugId: await zugId('Pi Z 1'), thema: 'Knoten' })).body;
    await kader.post(`/api/avs/${src.id}/attachments`).set('Content-Type', 'application/octet-stream').set('X-Filename', 'a.pdf').set('X-Mime', 'application/pdf').send(Buffer.from('%PDF-'));
    const kader2 = await login('kader2@demo.ch');
    const copy = (await kader2.post(`/api/wks/${id}/avs`).send({ blockId: null, zugId: await zugId('Pi Z 2'), thema: 'Knoten (Kopie)' })).body;
    expect((await kader2.post(`/api/avs/${copy.id}/attachments/copy`).send({ fromAvId: src.id })).body).toEqual({ copied: 1 });
    expect((await kader2.get(`/api/avs/${copy.id}/attachments`)).body.map((a: any) => a.name)).toEqual(['a.pdf']);
    expect((await kader.post(`/api/avs/${copy.id}/attachments/copy`).send({ fromAvId: src.id })).status).toBe(403);
  });
});

describe('Erkundung, Übungen, Tagesbefehl', () => {
  const file = (agent: any, url: string) =>
    agent.post(url).set('Content-Type', 'application/octet-stream').set('X-Filename', 'skizze.jpg').set('X-Mime', 'image/jpeg').send(Buffer.from('jpg'));

  it('Erkundungsprotokoll: Zfhr and Kader of the Zug; other Züge see nothing', async () => {
    const id = await piWkId();
    const z1 = await zugId('Pi Z 1');
    const zf = await login('zfhr1@demo.ch');
    const e = await zf.post(`/api/wks/${id}/erkundungen`).send({ zugId: z1, title: 'Dorfbach Zweiingen', datum: '2027-04-20', risiken: [{ risiko: 'Abrutschen', massnahmen: 'Rettungswesten', wer: 'Grfhr', restrisiko: 'MITTEL' }], beurteilung: 'MITTEL', checkliste: { platz: { state: 'OK', note: '' } } });
    expect(e.status).toBe(201);
    expect(e.body).toMatchObject({ verfasser: 'Lt Gruber', notfall: { ambulanzTel: '144', luftrettungTel: '1414' }, checkliste: { platz: { state: 'OK' } } });
    expect((await file(zf, `/api/erkundungen/${e.body.id}/attachments`)).status).toBe(201);
    const kader2 = await login('kader2@demo.ch');
    expect((await kader2.get(`/api/wks/${id}/erkundungen`)).body).toHaveLength(0);
    expect((await kader2.get(`/api/erkundungen/${e.body.id}/attachments`)).status).toBe(403);
    const kader = await login('kader@demo.ch');
    expect((await kader.get(`/api/wks/${id}/erkundungen/${e.body.id}`)).body.attachmentCount).toBe(1);
    expect((await kader.put(`/api/wks/${id}/erkundungen/${e.body.id}`).send({ ...e.body, notizen: 'x' })).status).toBe(403);
    const own = await kader.post(`/api/wks/${id}/erkundungen`).send({ zugId: z1, title: 'Kieswerk' });
    expect((await kader.put(`/api/wks/${id}/erkundungen/${own.body.id}`).send({ ...own.body, notizen: 'Zufahrt frei' })).body.notizen).toBe('Zufahrt frei');
    expect((await kader.post(`/api/wks/${id}/erkundungen`).send({ zugId: await zugId('Pi Z 2'), title: 'x' })).status).toBe(403);
    expect((await kader.post(`/api/wks/${id}/erkundungen`).send({ zugId: null, title: 'x' })).status).toBe(403);
  });

  it('Übung: the Drehbuch is only for the Übungsleitung; Unterlagen and Besprechung are for all', async () => {
    const id = await piWkId();
    const zf = await login('zfhr1@demo.ch');
    const u = await zf
      .post(`/api/wks/${id}/uebungen`)
      .send({ title: 'Übung AQUA', beuebteZugIds: [await zugId('Pi Z 1')], drehbuch: [{ zeit: '10:15', von: 'Übungsleitung', an: 'Zfhr', einspielung: 'Damm bricht', erwartet: 'Evakuation', mittel: 'Funk' }], unterlagenLage: 'Hochwasser' });
    expect(u.status).toBe(201);
    expect(u.body.leitungUserIds).toEqual([(await db.prepare("SELECT id FROM app_user WHERE email = 'zfhr1@demo.ch'").get() as any).id]);
    const kader = await login('kader@demo.ch');
    const seen = (await kader.get(`/api/wks/${id}/uebungen/${u.body.id}`)).body;
    expect(seen).toMatchObject({ drehbuch: [], drehbuchHidden: true, unterlagenLage: 'Hochwasser' });
    expect((await kader.put(`/api/wks/${id}/uebungen/${u.body.id}`).send(seen)).status).toBe(403);
    expect((await (await login('kpkdt@demo.ch')).get(`/api/wks/${id}/uebungen/${u.body.id}`)).body.drehbuch).toHaveLength(1);
    expect((await kader.post(`/api/wks/${id}/uebungen`).send({ title: 'x' })).status).toBe(403);
    expect((await file(zf, `/api/uebungen/${u.body.id}/attachments`)).status).toBe(201);
    expect((await kader.get(`/api/uebungen/${u.body.id}/attachments`)).body).toHaveLength(1);
    // A second Zfhr in the Leitung may edit.
    const zf2 = (await db.prepare("SELECT id FROM app_user WHERE email = 'zfhr2@demo.ch'").get() as any).id;
    const full = (await zf.get(`/api/wks/${id}/uebungen/${u.body.id}`)).body;
    await zf.put(`/api/wks/${id}/uebungen/${u.body.id}`).send({ ...full, leitungUserIds: [...full.leitungUserIds, zf2] });
    expect((await (await login('zfhr2@demo.ch')).get(`/api/wks/${id}/uebungen/${u.body.id}`)).body.drehbuch).toHaveLength(1);
  });

  it('Tagesbefehl: Kp Kdt writes the manual part; only Kp Kdt and Bat Kdo see it', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.put(`/api/wks/${id}/tagesbefehle/2027-04-28`).send({ tenue: 'Arbeitstenue, Helm', tagesverantwortlicher: 'Lt Gruber' })).status).toBe(200);
    expect((await kdt.put(`/api/wks/${id}/tagesbefehle/2020-01-01`).send({})).status).toBe(400);
    expect((await (await login('zfhr1@demo.ch')).put(`/api/wks/${id}/tagesbefehle/2027-04-28`).send({})).status).toBe(403);
    expect((await (await login('kader@demo.ch')).get(`/api/wks/${id}/tagesbefehle`)).status).toBe(403);
    expect((await (await login('logof@demo.ch')).put(`/api/wks/${id}/tagesbefehle/2027-04-28`).send({})).status).toBe(403);
    const list = (await (await login('bat@demo.ch')).get(`/api/wks/${id}/tagesbefehle`)).body;
    expect(list.find((t: any) => t.date === '2027-04-28')).toMatchObject({ tenue: 'Arbeitstenue, Helm', besonderes: '' });
    expect(list.length).toBeGreaterThan(3);
  });
});

describe('Briefkopf', () => {
  it('Bat Kdo stores the letterhead and the canton logo; everyone of the Bataillon gets it with the organisation', async () => {
    const bat = await login('bat@demo.ch');
    const id = ((await db.prepare('SELECT id FROM bataillon LIMIT 1').get()) as any).id;
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const res = await bat.put(`/api/bataillone/${id}/settings`).send({
      name: 'Bat 1',
      regionName: 'ZSO Musterland',
      logo: null,
      kantonLogo: logo,
      briefkopf: { amt: 'Amt für Bevölkerungsschutz', abteilung: 'Zivilschutz', adresse: 'Musterstrasse 1, 1234 Musterhausen', telefon: 'T +41 00 000 00 00', web: 'zivilschutz.example.ch' },
    });
    expect(res.status).toBe(200);
    const org = (await (await login('kader@demo.ch')).get('/api/org')).body;
    expect(org.bataillon).toMatchObject({ kantonLogo: logo, briefkopf: { abteilung: 'Zivilschutz', web: 'zivilschutz.example.ch' } });
    expect((await (await login('kpkdt@demo.ch')).put(`/api/bataillone/${id}/settings`).send({ name: 'x' })).status).toBe(403);
    expect((await bat.put(`/api/bataillone/${id}/settings`).send({ name: 'x', kantonLogo: 'data:text/html;base64,PGI+' })).status).toBe(400);
  });

  it('stores the default map view of the Bataillon; only within Switzerland', async () => {
    const bat = await login('bat@demo.ch');
    const id = ((await db.prepare('SELECT id FROM bataillon LIMIT 1').get()) as any).id;
    const view = { lat: 46.948, lon: 7.4474, zoom: 13 };
    expect((await bat.put(`/api/bataillone/${id}/settings`).send({ name: 'Bat 1', mapView: view })).body.mapView).toEqual(view);
    expect((await (await login('zfhr1@demo.ch')).get('/api/org')).body.bataillon.mapView).toEqual(view);
    expect((await bat.put(`/api/bataillone/${id}/settings`).send({ name: 'Bat 1', mapView: { lat: 52.5, lon: 13.4, zoom: 12 } })).status).toBe(400);
    expect((await bat.put(`/api/bataillone/${id}/settings`).send({ name: 'Bat 1', mapView: null })).body.mapView).toBeNull();
  });
});

describe('Diensttage pro Zug', () => {
  it('AVOR days are for the Kdo; a Zug added to the day may plan there', async () => {
    const id = await piWkId();
    const z1 = await zugId('Pi Z 1');
    const kdt = await login('kpkdt@demo.ch');
    const wk = (await kdt.get(`/api/wks/${id}`)).body.wk;
    expect((await kdt.patch(`/api/wks/${id}`).send({ avorDays: [...wk.avorDays, '2027-04-20'] })).status).toBe(200);
    const zf = await login('zfhr1@demo.ch');
    const block = { date: '2027-04-20', startMin: 600, endMin: 660, zugIds: [z1], title: 'Erkundung', type: 'AUSBILDUNG' };
    const refused = await zf.post(`/api/wks/${id}/blocks`).send(block);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/keinen Dienst/);
    // Kdo plans on the AVOR day.
    expect((await kdt.post(`/api/wks/${id}/blocks`).send({ ...block, zugIds: [0] })).status).toBe(201);
    const res = await kdt.patch(`/api/wks/${id}`).send({ dayDuty: { ...wk.dayDuty, '2027-04-20': { [z1]: 'AVOR' } } });
    expect(res.body.dayDuty['2027-04-20']).toEqual({ [z1]: 'AVOR' });
    expect((await zf.post(`/api/wks/${id}/blocks`).send(block)).status).toBe(201);
    // Per rank: kept where it differs from the rule (AVOR = Zugführer), dropped where it matches.
    const ranks = await kdt.patch(`/api/wks/${id}`).send({ dayDuty: { ...wk.dayDuty, '2027-04-20': { [z1]: 'AVOR', [`${z1}.zfhr`]: 'AVOR', [`${z1}.kader`]: 'AVOR', [`${z1}.x`]: 'WK' } } });
    expect(ranks.status).toBe(400);
    const ok = await kdt.patch(`/api/wks/${id}`).send({ dayDuty: { ...wk.dayDuty, '2027-04-20': { [z1]: 'AVOR', [`${z1}.zfhr`]: 'AVOR', [`${z1}.kader`]: 'AVOR', '999.sdt': 'WK' } } });
    expect(ok.status).toBe(200);
    expect(ok.body.dayDuty['2027-04-20']).toEqual({ [z1]: 'AVOR', [`${z1}.kader`]: 'AVOR' });
  });

  it('a Zug can be left out of single WK days', async () => {
    const bat = await login('bat@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const wk = (await bat.post('/api/wks').send({ kpId, title: 'WK Test', startDate: '2028-05-01', endDate: '2028-05-03', dayStart: 450, dayEnd: 1020, snapMin: 15 })).body;
    const [z1, z2] = [await zugId('Pi Z 1'), await zugId('Pi Z 2')];
    const z3 = await zugId('Pi Z 3');
    const zl = await zugId('Log Z');
    const kdt = await login('kpkdt@demo.ch');
    // Pi Z 2 serves only on 1 and 3 May.
    expect((await kdt.patch(`/api/wks/${wk.id}`).send({ dayDuty: { '2028-05-02': { [z2]: 'NONE' } } })).status).toBe(200);
    void z3;
    void zl;
    const b = { date: '2028-05-02', startMin: 600, endMin: 660, title: 'x', type: 'AUSBILDUNG' };
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...b, zugIds: [z2] })).status).toBe(400);
    // Across several columns (e.g. Mittagessen) a Zug without service may be crossed.
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...b, zugIds: [z1, z2, z3] })).status).toBe(201);
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...b, zugIds: [z1] })).status).toBe(201);
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...b, date: '2028-05-01', zugIds: [z2] })).status).toBe(201);
    // Taking Pi Z 2 out of a day where it has blocks is refused.
    expect((await kdt.patch(`/api/wks/${wk.id}`).send({ dayDuty: { '2028-05-01': { [z2]: 'NONE' } } })).status).toBe(409);
  });
});

describe('Bat Kdo: Übungen und Erkundungen', () => {
  it('Bat Kdo creates and edits Übungen and Erkundungen of the Kompanien of the Bataillon', async () => {
    const id = await piWkId();
    const bat = await login('bat@demo.ch');
    const u = await bat.post(`/api/wks/${id}/uebungen`).send({ title: 'Bat-Übung', beuebteZugIds: [await zugId('Pi Z 1')] });
    expect(u.status).toBe(201);
    expect((await bat.put(`/api/wks/${id}/uebungen/${u.body.id}`).send({ ...u.body, ort: 'Wangen' })).body.ort).toBe('Wangen');
    expect((await bat.post(`/api/wks/${id}/erkundungen`).send({ zugId: null, title: 'Übungsraum' })).status).toBe(201);
    expect((await bat.post(`/api/wks/${id}/erkundungen`).send({ zugId: await zugId('Pi Z 2'), title: 'Kieswerk' })).status).toBe(201);
    // The Kp Kdt sees the Drehbuch of the Bat Übung.
    expect((await (await login('kpkdt@demo.ch')).get(`/api/wks/${id}/uebungen/${u.body.id}`)).body.drehbuchHidden).toBeUndefined();
  });
});

describe('Teilnehmerliste: mehrere zuweisen', () => {
  it('Kp Kdt assigns several people to a Zug and to days at once', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    await kdt.post(`/api/wks/${id}/participants/import`).send({ items: [{ nachname: 'A' }, { nachname: 'B' }, { nachname: 'C' }] });
    const list = (await kdt.get(`/api/wks/${id}/participants`)).body;
    const ids = list.filter((p: any) => p.nachname !== 'C').map((p: any) => p.id);
    const z2 = await zugId('Pi Z 2');
    expect((await kdt.post(`/api/wks/${id}/participants/bulk`).send({ ids, zugId: z2, days: ['2027-04-28', '2027-04-29'] })).body).toEqual({ updated: 2 });
    const after = (await kdt.get(`/api/wks/${id}/participants`)).body;
    expect(after.filter((p: any) => p.zugId === z2).map((p: any) => p.nachname).sort()).toEqual(['A', 'B']);
    expect(after.find((p: any) => p.nachname === 'A').days).toEqual(['2027-04-28', '2027-04-29']);
    expect(after.find((p: any) => p.nachname === 'C')).toMatchObject({ zugId: null, days: [] });
    // Only the Zug: days stay.
    await kdt.post(`/api/wks/${id}/participants/bulk`).send({ ids, zugId: null });
    expect((await kdt.get(`/api/wks/${id}/participants`)).body.find((p: any) => p.nachname === 'A')).toMatchObject({ zugId: null, days: ['2027-04-28', '2027-04-29'] });
    expect((await (await login('zfhr1@demo.ch')).post(`/api/wks/${id}/participants/bulk`).send({ ids, zugId: z2 })).status).toBe(403);
  });
});

describe('KVK und WK am selben Tag', () => {
  it('one Zug has KVK while another has WK on the same day; values equal to the day type are not stored', async () => {
    const bat = await login('bat@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const wk = (await bat.post('/api/wks').send({ kpId, title: 'WK Misch', startDate: '2028-06-05', endDate: '2028-06-07', dayStart: 450, dayEnd: 1020, snapMin: 15 })).body;
    const [z1, z2] = [await zugId('Pi Z 1'), await zugId('Pi Z 2')];
    const kdt = await login('kpkdt@demo.ch');
    // 5 June: Pi Z 1 in the KVK, the others start the WK; a KVK day before the WK only for Pi Z 2.
    const res = await kdt
      .patch(`/api/wks/${wk.id}`)
      .send({ kvkDays: ['2028-06-04'], dayDuty: { '2028-06-05': { [z1]: 'KVK', [z2]: 'WK' }, '2028-06-04': { [z1]: 'NONE' } } });
    expect(res.status).toBe(200);
    expect(res.body.dayDuty).toEqual({ '2028-06-05': { [z1]: 'KVK' }, '2028-06-04': { [z1]: 'NONE' } });
    const b = { startMin: 600, endMin: 660, title: 'x', type: 'AUSBILDUNG' };
    // Both plan on 5 June; on 4 June only Pi Z 2.
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...b, date: '2028-06-05', zugIds: [z1, z2] })).status).toBe(201);
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...b, date: '2028-06-04', zugIds: [z2] })).status).toBe(201);
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...b, date: '2028-06-04', zugIds: [z1] })).status).toBe(400);
  });

  it('settings of the previous version (serving Züge per day) are converted', async () => {
    const id = await piWkId();
    const z1 = await zugId('Pi Z 1');
    const { fillDayDuty } = await import('../src/db');
    await db.prepare("UPDATE wk SET avor_days = ?, day_zuege = ?, day_duty = NULL WHERE id = ?").run(JSON.stringify(['2027-03-13', '2027-04-20']), JSON.stringify({ '2027-04-20': [z1] }), id);
    await fillDayDuty(db);
    const duty = JSON.parse(((await db.prepare('SELECT day_duty FROM wk WHERE id = ?').get(id)) as any).day_duty);
    expect(duty['2027-04-20']).toEqual({ [z1]: 'AVOR' });
  });
});

describe('Teilnehmerliste: mehrere entfernen', () => {
  it('Kp Kdt removes selected people; their check-ins stay without person', async () => {
    const id = await piWkId();
    const kdt = await login('kpkdt@demo.ch');
    await kdt.post(`/api/wks/${id}/participants/import`).send({ items: [{ nachname: 'A' }, { nachname: 'B' }, { nachname: 'C' }] });
    const list = (await kdt.get(`/api/wks/${id}/participants`)).body;
    await kdt.post(`/api/wks/${id}/presence`).send({ participantId: list[0].id, date: '2027-04-28', present: true });
    expect((await (await login('zfhr1@demo.ch')).post(`/api/wks/${id}/participants/bulk-delete`).send({ ids: [list[0].id] })).status).toBe(403);
    expect((await kdt.post(`/api/wks/${id}/participants/bulk-delete`).send({ ids: list.map((p: any) => p.id) })).body).toEqual({ deleted: 3 });
    expect((await kdt.get(`/api/wks/${id}/participants`)).body).toHaveLength(0);
    expect((await kdt.get(`/api/wks/${id}/checkins`)).body).toMatchObject([{ participantId: null }]);
  });
});

describe('Blöcke über Züge ohne Dienst', () => {
  it('Mittagessen for all may cross a Zug without service; a block only in its column may not', async () => {
    const bat = await login('bat@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const wk = (await bat.post('/api/wks').send({ kpId, title: 'WK Lunch', startDate: '2028-07-03', endDate: '2028-07-04', dayStart: 450, dayEnd: 1020, snapMin: 15 })).body;
    const ids = await Promise.all(['Pi Z 1', 'Pi Z 2', 'Pi Z 3', 'Log Z'].map(zugId));
    const kdt = await login('kpkdt@demo.ch');
    await kdt.patch(`/api/wks/${wk.id}`).send({ dayDuty: { '2028-07-03': { [ids[1]]: 'NONE' } } });
    const lunch = { date: '2028-07-03', startMin: 720, endMin: 780, title: 'Mittagessen', type: 'VERPFLEGUNG' };
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...lunch, zugIds: [0, ...ids] })).status).toBe(201);
    expect((await kdt.post(`/api/wks/${wk.id}/blocks`).send({ ...lunch, zugIds: [ids[1]] })).status).toBe(400);
    // The settings stay valid with that block.
    expect((await kdt.patch(`/api/wks/${wk.id}`).send({ dayDuty: { '2028-07-03': { [ids[1]]: 'NONE', [ids[2]]: 'NONE' } } })).status).toBe(200);
  });
});

describe('Pendenzen für sich und Unterstellte', () => {
  const uid = async (email: string) => ((await db.prepare('SELECT id FROM app_user WHERE email = ?').get(email)) as any).id;
  const add = (agent: any, id: number, responsibleUserId: number) =>
    agent.post(`/api/wks/${id}/pendenzen`).send({ rapportId: null, text: 'Auftrag', responsibleUserId, dueDate: '2027-04-20' });

  it('Bat Kdo, Kp Kdt and Zugführer assign to themselves and subordinates; Kader only to themselves', async () => {
    const id = await piWkId();
    const [bat, kdt, zf, kader] = await Promise.all(['bat@demo.ch', 'kpkdt@demo.ch', 'zfhr1@demo.ch', 'kader@demo.ch'].map(login));
    const [batId, kdtId, zfId, kaderId, kader2Id] = await Promise.all(['bat@demo.ch', 'kpkdt@demo.ch', 'zfhr1@demo.ch', 'kader@demo.ch', 'kader2@demo.ch'].map(uid));
    expect((await add(bat, id, kdtId)).status).toBe(201);
    expect((await add(bat, id, batId)).status).toBe(201);
    expect((await add(kdt, id, kader2Id)).status).toBe(201);
    const p = await add(zf, id, kaderId);
    expect(p.status).toBe(201);
    expect(p.body.zugId).toBe(await zugId('Pi Z 1'));
    expect((await add(zf, id, kader2Id)).status).toBe(403);
    expect((await add(zf, id, kdtId)).status).toBe(403);
    expect((await add(kader, id, kaderId)).status).toBe(201);
    expect((await add(kader, id, zfId)).status).toBe(403);
    // The Kader sees what was assigned to them and ticks it off.
    const mine = (await kader.get(`/api/wks/${id}/pendenzen`)).body.filter((x: any) => x.responsibleUserId === kaderId);
    expect(mine).toHaveLength(2);
    expect((await kader.post(`/api/wks/${id}/pendenzen/${p.body.id}/done`).send({ done: true })).body.done).toBe(true);
  });
});

describe('Standort aus dem Katalog reserviert', () => {
  it('a linked Standort is reserved by the block and follows it; free places are not', async () => {
    const id = await piWkId();
    const room = ((await db.prepare("SELECT id FROM resource WHERE name = 'Theoriesaal 1 MZH'").get()) as any).id;
    const kdt = await login('kpkdt@demo.ch');
    const locs = (await kdt.get(`/api/wks/${id}`)).body.locations as { id: number; nr: number; name: string }[];
    const saved = await kdt.put(`/api/wks/${id}/locations`).send([
      ...locs.map(({ id, nr, name }) => ({ id, nr, name })),
      { nr: 90, name: 'Theoriesaal 1 MZH', resourceId: room },
      { nr: 91, name: 'Altersheim' },
    ]);
    expect(saved.status).toBe(200);
    const linked = saved.body.find((l: any) => l.nr === 90);
    const free = saved.body.find((l: any) => l.nr === 91);
    expect(linked.resourceId).toBe(room);
    // Legend saved without resourceId keeps the link.
    const again = await kdt.put(`/api/wks/${id}/locations`).send(saved.body.map(({ id, nr, name }: any) => ({ id, nr, name })));
    expect(again.body.find((l: any) => l.nr === 90).resourceId).toBe(room);

    const standortOf = async (blockId: number) => (await db.prepare('SELECT * FROM resource_request WHERE block_id = ? AND standort').get(blockId)) as any;
    const b = await kdt.post(`/api/wks/${id}/blocks`).send({
      date: '2027-04-28', startMin: 780, endMin: 840, zugIds: [(await zugId('Pi Z 1'))], title: 'Theorie', type: 'AUSBILDUNG', locationId: linked.id,
    });
    expect(b.status).toBe(201);
    // Planned by the Kp Kdt and free: approved right away.
    expect(await standortOf(b.body.id)).toMatchObject({ resource_id: room, start_min: 780, end_min: 840, status: 'BEWILLIGT', zweck: 'Theorie' });

    // Moved by the Zfhr: follows, needs a new approval.
    const zf = await login('zfhr1@demo.ch');
    const moved = await zf.patch(`/api/wks/${id}/blocks/${b.body.id}`).send({ version: b.body.version, startMin: 900, endMin: 960 });
    expect(moved.status).toBe(200);
    expect(await standortOf(b.body.id)).toMatchObject({ start_min: 900, end_min: 960, status: 'BEANTRAGT' });

    // A place outside the catalogue: the reservation is withdrawn.
    await kdt.patch(`/api/wks/${id}/blocks/${b.body.id}`).send({ version: moved.body.version, locationId: free.id });
    expect(await standortOf(b.body.id)).toBeUndefined();

    // Deleting the block removes its Standort reservation.
    const c = await kdt.post(`/api/wks/${id}/blocks`).send({
      date: '2027-04-29', startMin: 780, endMin: 840, zugIds: [(await zugId('Pi Z 1'))], title: 'Theorie 2', type: 'AUSBILDUNG', locationId: linked.id,
    });
    const reqId = (await standortOf(c.body.id)).id;
    expect((await kdt.delete(`/api/wks/${id}/blocks/${c.body.id}`)).status).toBe(200);
    expect(await db.prepare('SELECT 1 FROM resource_request WHERE id = ?').get(reqId)).toBeUndefined();

    // Only rooms and terrain of the catalogue can be linked.
    const bus = ((await db.prepare("SELECT id FROM resource WHERE name = 'Mannschaftsbus 1'").get()) as any).id;
    expect((await kdt.put(`/api/wks/${id}/locations`).send([{ nr: 92, name: 'Bus', resourceId: bus }])).status).toBe(400);
  });
});

describe('Demo: Rolle wechseln', () => {
  it('switches between demo accounts only, and only while they keep the demo password', async () => {
    const a = await login('kpkdt@demo.ch');
    const list = await a.get('/api/auth/demo-accounts');
    expect(list.body.map((x: any) => x.email)).toContain('zfhr1@demo.ch');
    expect(list.body[0].role).toBe('ADMIN');
    const sw = await a.post('/api/auth/demo-switch').send({ email: 'zfhr1@demo.ch' });
    expect(sw.status).toBe(200);
    expect((await a.get('/api/auth/me')).body.role).toBe('ZFHR');

    // A demo account with its own password is no longer reachable.
    await db.prepare("UPDATE app_user SET pw_hash = 'x' WHERE email = 'logof@demo.ch'").run();
    expect((await a.post('/api/auth/demo-switch').send({ email: 'logof@demo.ch' })).status).toBe(403);
    expect((await request(app).post('/api/auth/demo-switch').send({ email: 'bat@demo.ch' })).status).toBe(401);
  });
});

describe('Bestand der Züge', () => {
  it('Bat and own Kp Kdt set Soll/Ist per Zug; it comes with the WK', async () => {
    const z1 = await zugId('Pi Z 1');
    const bat = await login('bat@demo.ch');
    const res = await bat.patch(`/api/zuege/${z1}`).send({ soll: { zfhr: 2, kader: 6, sdt: 30 }, ist: { zfhr: 1, kader: 5, sdt: 27 } });
    expect(res.status).toBe(200);
    expect(res.body.soll).toEqual({ zfhr: 2, kader: 6, sdt: 30 });
    const kdt = await login('kpkdt@demo.ch');
    expect((await kdt.patch(`/api/zuege/${z1}`).send({ ist: { zfhr: 2, kader: 5, sdt: 28 } })).status).toBe(200);
    const detail = (await kdt.get(`/api/wks/${await piWkId()}`)).body;
    const zug = detail.zuege.find((z: any) => z.id === z1);
    expect(zug.soll.sdt).toBe(30);
    expect(zug.ist).toEqual({ zfhr: 2, kader: 5, sdt: 28 });
    expect((await kdt.patch(`/api/zuege/${z1}`).send({ ist: { zfhr: -1, kader: 0, sdt: 0 } })).status).toBe(400);
    expect((await (await login('zfhr1@demo.ch')).patch(`/api/zuege/${z1}`).send({ ist: { zfhr: 1, kader: 0, sdt: 0 } })).status).toBe(403);
  });
});

describe('Jahresplanung und Archiv', () => {
  it('Bat plans several WKs per year with AVOR and KVK days', async () => {
    const bat = await login('bat@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const base = { kpId, dayStart: 450, dayEnd: 1020, snapMin: 15 };
    const a = await bat.post('/api/wks').send({ ...base, title: 'WK I 2031', startDate: '2031-03-10', endDate: '2031-03-14', avorDays: ['2031-02-20'], kvkDays: ['2031-03-07'] });
    const b = await bat.post('/api/wks').send({ ...base, title: 'WK II 2031', startDate: '2031-09-08', endDate: '2031-09-12' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.avorDays).toEqual(['2031-02-20']);
    expect(a.body.kvkDays).toEqual(['2031-03-07']);
    const moved = await bat.patch(`/api/wks/${b.body.id}`).send({ kvkDays: ['2031-09-05'], avorDays: ['2031-08-28'] });
    expect(moved.status).toBe(200);
    expect(moved.body.kvkDays).toEqual(['2031-09-05']);
    const list = (await bat.get('/api/wks')).body.filter((w: any) => w.title.endsWith('2031'));
    expect(list).toHaveLength(2);
  });

  it('Bat archives (read only), restores and deletes WKs', async () => {
    const bat = await login('bat@demo.ch');
    const kdt = await login('kpkdt@demo.ch');
    const kpId = ((await db.prepare("SELECT id FROM kompanie WHERE name = 'Pi Kp'").get()) as any).id;
    const id = (await bat.post('/api/wks').send({ kpId, dayStart: 450, dayEnd: 1020, snapMin: 15, title: 'WK II 2031', startDate: '2031-09-08', endDate: '2031-09-12' })).body.id;
    expect((await kdt.post(`/api/wks/${id}/archive`).send({ archived: true })).status).toBe(403);
    const ar = await bat.post(`/api/wks/${id}/archive`).send({ archived: true });
    expect([ar.status, ar.body]).toMatchObject([200, { archived: true }]);
    // Read only while archived: neither the Kp nor the Bat can change it.
    expect((await kdt.post(`/api/wks/${id}/blocks`).send({ date: '2031-09-08', startMin: 480, endMin: 540, zugIds: [await zugId('Pi Z 1')], title: 'X', type: 'AUSBILDUNG' })).status).toBe(409);
    expect((await bat.patch(`/api/wks/${id}`).send({ title: 'Neu' })).status).toBe(409);
    expect((await kdt.get(`/api/wks/${id}`)).status).toBe(200);
    expect((await bat.post(`/api/wks/${id}/archive`).send({ archived: false })).body.archived).toBe(false);
    expect((await bat.patch(`/api/wks/${id}`).send({ title: 'WK II 2031 neu' })).status).toBe(200);
    expect((await kdt.delete(`/api/wks/${id}`)).status).toBe(403);
    expect((await bat.delete(`/api/wks/${id}`)).status).toBe(200);
    expect((await bat.get(`/api/wks/${id}`)).status).toBe(404);
  });
});
