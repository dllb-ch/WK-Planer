// Row → domain mappers and common loaders.
import { isLang } from '../../shared/i18n';
import type { DB } from './db';
import type {
  Ausbildungsvorbereitung,
  Bataillon,
  Bestand,
  Block,
  BlockDetail,
  Comment,
  Gruppe,
  Kompanie,
  Location,
  Resource,
  ResourceRequest,
  SessionUser,
  UserRow,
  Wk,
  Zug,
  ZugGroup,
} from '../../shared/types';
import { emptyBestand } from '../../shared/types';
import { HttpError } from './http';
import { normalizeAv } from '../../shared/av';

type Row = any;

export const toUser = (r: Row): UserRow => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  batId: r.bat_id,
  kpId: r.kp_id ?? null,
  zugId: r.zug_id ?? null,
  funktion: r.funktion,
});

export const toSessionUser = (r: Row): SessionUser => {
  const { funktion: _f, ...u } = toUser(r);
  return { ...u, lang: isLang(r.lang) ? r.lang : null };
};

export const toBat = (r: Row): Bataillon => ({
  id: r.id,
  name: r.name,
  regionName: r.region_name ?? '',
  logo: r.logo ?? null,
  briefkopf: { amt: '', abteilung: '', adresse: '', telefon: '', web: '', ...JSON.parse(r.briefkopf || '{}') },
  kantonLogo: r.kanton_logo ?? null,
  mapView: r.map_view ? JSON.parse(r.map_view) : null,
});

export const toKp = (r: Row): Kompanie => ({ id: r.id, batId: r.bat_id, name: r.name });

export const toZug = (r: Row): Zug => ({
  id: r.id,
  kpId: r.kp_id,
  name: r.name,
  order: r.sort,
  zfhrUserId: r.zfhr_user_id ?? null,
  soll: toBestand(r.soll),
  ist: toBestand(r.ist),
  gruppen: [],
});

export const toGruppe = (r: Row): Gruppe => ({
  id: r.id,
  zugId: r.zug_id,
  name: r.name,
  order: r.sort,
  leiterUserId: r.leiter_user_id ?? null,
  soll: { ...toBestand(r.soll), zfhr: 0 },
  ist: { ...toBestand(r.ist), zfhr: 0 },
});

/** Adds the Gruppen to the Züge; where a Zug has Gruppen, its Kader and Soldaten are their sum. */
export async function withGruppen(db: DB, zuege: Zug[]): Promise<Zug[]> {
  if (!zuege.length) return zuege;
  const rows = ((await db.prepare(`SELECT * FROM gruppe WHERE zug_id IN (${zuege.map(() => '?').join(',')}) ORDER BY sort, id`).all(...zuege.map((z) => z.id))) as Row[]).map(toGruppe);
  return zuege.map((z) => {
    const gruppen = rows.filter((g) => g.zugId === z.id);
    if (!gruppen.length) return { ...z, gruppen };
    const sum = (k: 'soll' | 'ist') => ({ zfhr: z[k].zfhr, kader: gruppen.reduce((a, g) => a + g[k].kader, 0), sdt: gruppen.reduce((a, g) => a + g[k].sdt, 0) });
    return { ...z, gruppen, soll: sum('soll'), ist: sum('ist') };
  });
}

const toBestand = (json: string | null): Bestand => ({ ...emptyBestand(), ...JSON.parse(json || '{}') });

export const toWk = (r: Row): Wk => ({
  id: r.id,
  kpId: r.kp_id,
  batId: r.bat_id,
  title: r.title,
  startDate: r.start_date,
  endDate: r.end_date,
  dayStart: r.day_start,
  dayEnd: r.day_end,
  snapMin: r.snap_min,
  status: r.status,
  reviewNote: r.review_note,
  avorDays: JSON.parse(r.avor_days ?? '[]'),
  kvkDays: JSON.parse(r.kvk_days ?? '[]'),
  dayDuty: JSON.parse(r.day_duty ?? '{}'),
  archived: !!r.archived,
  updatedAt: r.updated_at,
});

export const toLocation = (r: Row): Location => ({ id: r.id, wkId: r.wk_id, nr: r.nr, name: r.name, resourceId: r.resource_id ?? null });

export const toBlock = (r: Row): Block => ({
  id: r.id,
  wkId: r.wk_id,
  date: r.date,
  startMin: r.start_min,
  endMin: r.end_min,
  zugIds: JSON.parse(r.zug_ids),
  title: r.title,
  type: r.type,
  locationId: r.location_id ?? null,
  verantwortlich: r.verantwortlich,
  notes: r.notes,
  locked: !!r.locked,
  source: r.source,
  version: r.version,
  updatedBy: r.updated_by ?? null,
});

export const toComment = (r: Row): Comment => ({
  id: r.id,
  wkId: r.wk_id,
  blockId: r.block_id ?? null,
  userId: r.user_id,
  userName: r.user_name,
  text: r.text,
  createdAt: r.created_at,
});


export async function loadWk(db: DB, id: number): Promise<Wk> {
  const r = await db
    .prepare('SELECT wk.*, kompanie.bat_id FROM wk JOIN kompanie ON kompanie.id = wk.kp_id WHERE wk.id = ?')
    .get(id);
  if (!r) throw new HttpError(404, 'WK nicht gefunden');
  return toWk(r);
}

export async function loadBlock(db: DB, wkId: number, id: number): Promise<Block> {
  const r = await db.prepare('SELECT * FROM block WHERE id = ? AND wk_id = ?').get(id, wkId);
  if (!r) throw new HttpError(404, 'Block nicht gefunden');
  return toBlock(r);
}

export const toDetail = (r: Row): BlockDetail => ({
  id: r.id,
  blockId: r.block_id,
  zugId: r.zug_id,
  startMin: r.start_min,
  endMin: r.end_min,
  title: r.title,
  verantwortlich: r.verantwortlich,
  groupIds: JSON.parse(r.group_ids ?? '[]'),
});

export const toGroup = (r: Row): ZugGroup => ({ id: r.id, wkId: r.wk_id, zugId: r.zug_id, name: r.name, sort: r.sort });

export const toAv = (r: Row): Ausbildungsvorbereitung => ({
  ...normalizeAv(JSON.parse(r.data)),
  id: r.id,
  wkId: r.wk_id,
  blockId: r.block_id ?? null,
  zugId: r.zug_id,
  createdBy: r.created_by,
  createdByName: r.created_by_name ?? '',
  updatedAt: r.updated_at,
  attachmentCount: r.attachment_count ?? 0,
});

export const toResource = (r: Row): Resource => ({
  id: r.id,
  batId: r.bat_id,
  kpId: r.kp_id ?? null,
  kind: r.kind,
  category: r.category ?? '',
  name: r.name,
  description: r.description,
  capacity: r.capacity,
  seats: r.seats ?? 0,
  nr: r.nr ?? null,
  area: r.area ? JSON.parse(r.area) : null,
});

export const toRequest = (r: Row): ResourceRequest => ({
  id: r.id,
  wkId: r.wk_id,
  zugId: r.zug_id,
  blockId: r.block_id ?? null,
  resourceId: r.resource_id ?? null,
  kind: r.kind,
  category: r.category ?? '',
  quantity: r.quantity ?? 1,
  persons: r.persons ?? 0,
  assignedIds: JSON.parse(r.assigned_ids ?? '[]'),
  date: r.date,
  startMin: r.start_min,
  endMin: r.end_min,
  zweck: r.zweck,
  note: r.note,
  area: r.area ? JSON.parse(r.area) : null,
  standort: !!r.standort,
  status: r.status,
  requestedBy: r.requested_by,
  requestedByName: r.requested_by_name ?? '',
  decisionNote: r.decision_note,
  createdAt: r.created_at,
});

export async function zuegeOfKp(db: DB, kpId: number): Promise<Zug[]> {
  return withGruppen(db, (await db.prepare('SELECT * FROM zug WHERE kp_id = ? ORDER BY sort, id').all(kpId)).map(toZug));
}

/** Ids of vehicles/rooms held by approved requests (specific or assigned) of the whole Bataillon in a time window. */
export async function occupied(db: DB, batId: number, date: string, startMin: number, endMin: number, excludeId: number) {
  const rows = (await db
    .prepare(
      `SELECT q.resource_id, q.assigned_ids FROM resource_request q JOIN wk ON wk.id = q.wk_id JOIN kompanie k ON k.id = wk.kp_id
       WHERE k.bat_id = ? AND q.date = ? AND q.status = 'BEWILLIGT' AND q.id != ? AND q.start_min < ? AND q.end_min > ?`,
    )
    .all(batId, date, excludeId, endMin, startMin)) as { resource_id: number | null; assigned_ids: string }[];
  return new Set(rows.flatMap((r) => (r.resource_id ? [r.resource_id] : (JSON.parse(r.assigned_ids) as number[]))));
}

export async function touchWk(db: DB, id: number) {
  await db.prepare("UPDATE wk SET updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?").run(id);
}
