// Creating WKs: by hand («Neuer WK») and from the Aufträge of the Ausbildungsbefehl.
import type { DB } from './db';
import { audit } from './db';
import { HttpError } from './http';
import { effectiveTemplate, insertMilestones } from './vorbereitung';
import type { AuftragKp, WkSync } from '../../shared/types';
import { dateRange } from '../../shared/util';

export interface NewWk {
  kpId: number;
  title: string;
  startDate: string;
  endDate: string;
  dayStart: number;
  dayEnd: number;
  snapMin: number;
  avorDays: string[];
  kvkDays?: string[];
  befehlId?: number | null;
}

export const checkWkDates = (startDate: string, endDate: string) => {
  if (endDate < startDate || dateRange(startDate, endDate).length > 21) throw new HttpError(400, 'WK-Dauer muss zwischen 1 und 21 Tagen liegen');
};

/** New WK with the Vorbereitung timeline of its Kp. */
export async function createWk(db: DB, userId: number, batId: number, b: NewWk) {
  checkWkDates(b.startDate, b.endDate);
  return db.transaction(async () => {
    const { lastInsertRowid } = await db
      .prepare(
        "INSERT INTO wk (kp_id, title, start_date, end_date, day_start, day_end, snap_min, avor_days, kvk_days, day_duty, befehl_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)",
      )
      .run(b.kpId, b.title, b.startDate, b.endDate, b.dayStart, b.dayEnd, b.snapMin, JSON.stringify(b.avorDays), JSON.stringify(b.kvkDays ?? []), b.befehlId ?? null);
    const id = Number(lastInsertRowid);
    await insertMilestones(db, id, b.startDate, (await effectiveTemplate(db, batId, b.kpId)).items);
    // The Gruppen of the Organisation become the Gruppen of the WK (Detailplanung, Turnus); adjustable per WK.
    await db
      .prepare('INSERT INTO zug_group (wk_id, zug_id, name, sort) SELECT ?, g.zug_id, g.name, g.sort FROM gruppe g JOIN zug ON zug.id = g.zug_id WHERE zug.kp_id = ?')
      .run(id, b.kpId);
    await audit(db, userId, 'wk', id, 'create', b);
    return id;
  });
}

const sameDays = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/**
 * After the Befehl was saved: one WK per Auftrag with WK dates. An existing WK of the Kp in that period is linked
 * instead of creating a second one; dates follow the Befehl while the Arbeitsprogramm is still a draft.
 */
export async function syncWksFromBefehl(
  db: DB,
  userId: number,
  batId: number,
  befehl: { id: number; year: number; dienstart: string },
  auftraege: AuftragKp[],
): Promise<WkSync[]> {
  const out: WkSync[] = [];
  for (const a of auftraege) {
    const kp = (await db.prepare('SELECT name FROM kompanie WHERE id = ?').get(a.kpId)) as { name: string };
    const base = { kpId: a.kpId, kpName: kp.name };
    if (!a.wkFrom || !a.wkTo) {
      out.push({ ...base, wkId: null, action: 'no-dates' });
      continue;
    }
    checkWkDates(a.wkFrom, a.wkTo);
    // The KVK days of the Befehl are KVK days of the WK (all Züge).
    const kvkDays = a.kvkDates.slice(0, 10);
    let wk = (await db.prepare('SELECT * FROM wk WHERE befehl_id = ? AND kp_id = ?').get(befehl.id, a.kpId)) as any;
    let action: WkSync['action'] = 'unchanged';
    if (!wk) {
      wk = await db
        .prepare('SELECT * FROM wk WHERE kp_id = ? AND befehl_id IS NULL AND start_date <= ? AND end_date >= ? ORDER BY start_date LIMIT 1')
        .get(a.kpId, a.wkTo, a.wkFrom);
      if (wk) {
        await db.prepare('UPDATE wk SET befehl_id = ? WHERE id = ?').run(befehl.id, wk.id);
        action = 'linked';
      }
    }
    if (!wk) {
      const id = await createWk(db, userId, batId, {
        kpId: a.kpId,
        title: `${befehl.dienstart || 'WK'} ${befehl.year} ${kp.name}`,
        startDate: a.wkFrom,
        endDate: a.wkTo,
        dayStart: 7 * 60 + 30,
        dayEnd: 17 * 60,
        snapMin: 15,
        avorDays: [],
        kvkDays,
        befehlId: befehl.id,
      });
      out.push({ ...base, wkId: id, action: 'created' });
      continue;
    }
    const changed = wk.start_date !== a.wkFrom || wk.end_date !== a.wkTo || !sameDays(JSON.parse(wk.kvk_days || '[]'), kvkDays);
    // Earlier versions put the KVK days into the AVOR days.
    const avorDays = (JSON.parse(wk.avor_days || '[]') as string[]).filter((d) => !kvkDays.includes(d));
    if (changed) {
      if (!wk.archived && (wk.status === 'ENTWURF' || wk.status === 'ZURUECKGEWIESEN')) {
        await db
          .prepare(
            `UPDATE wk SET start_date = ?, end_date = ?, avor_days = ?, kvk_days = ?, updated_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?`,
          )
          .run(a.wkFrom, a.wkTo, JSON.stringify(avorDays), JSON.stringify(kvkDays), wk.id);
        await audit(db, userId, 'wk', wk.id, 'dates-from-befehl', { startDate: a.wkFrom, endDate: a.wkTo, kvkDays });
        if (action !== 'linked') action = 'updated';
      } else action = 'locked';
    }
    out.push({ ...base, wkId: wk.id, action });
  }
  return out;
}
