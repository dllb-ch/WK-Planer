// Vorbereitung: templates per Bat / Kp and the per-person completion of a WK's items.
import type { DB } from './db';
import type { Milestone, Role, SessionUser, TemplateItem, VorbereitungTemplate, Wk } from '../../shared/types';
import { canSeeAllMilestones } from '../../shared/permissions';
import { addDays, DEFAULT_VORBEREITUNG } from '../../shared/util';

type Row = any;

const toItem = (r: Row): TemplateItem => ({ title: r.title, description: r.description, daysBefore: r.days_before, ownerRole: r.owner_role });

async function rowsOf(db: DB, batId: number, kpId: number | null): Promise<TemplateItem[]> {
  const sql = kpId === null
    ? 'SELECT * FROM vorbereitung_template WHERE bat_id = ? AND kp_id IS NULL ORDER BY sort'
    : 'SELECT * FROM vorbereitung_template WHERE bat_id = ? AND kp_id = ? ORDER BY sort';
  return (kpId === null ? (await db.prepare(sql).all(batId)) : (await db.prepare(sql).all(batId, kpId))).map(toItem);
}

/** Template that applies to a Kp (own override, else the Bat's, else the built-in default). */
export async function effectiveTemplate(db: DB, batId: number, kpId: number | null): Promise<VorbereitungTemplate> {
  if (kpId !== null) {
    const own = await rowsOf(db, batId, kpId);
    if (own.length) return { batId, kpId, source: 'KP', items: own };
  }
  const bat = await rowsOf(db, batId, null);
  if (bat.length) return { batId, kpId, source: 'BAT', items: bat };
  return { batId, kpId, source: 'DEFAULT', items: DEFAULT_VORBEREITUNG };
}

export async function saveTemplate(db: DB, batId: number, kpId: number | null, items: TemplateItem[]) {
  if (kpId === null) await db.prepare('DELETE FROM vorbereitung_template WHERE bat_id = ? AND kp_id IS NULL').run(batId);
  else await db.prepare('DELETE FROM vorbereitung_template WHERE bat_id = ? AND kp_id = ?').run(batId, kpId);
  const ins = db.prepare(
    'INSERT INTO vorbereitung_template (bat_id, kp_id, sort, title, description, days_before, owner_role) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const [i, it] of items.entries()) await ins.run(batId, kpId, i, it.title, it.description, it.daysBefore, it.ownerRole);
}

export async function insertMilestones(db: DB, wkId: number, startDate: string, items: TemplateItem[]) {
  const ins = db.prepare('INSERT INTO milestone (wk_id, title, description, due_date, owner_role) VALUES (?, ?, ?, ?, ?)');
  for (const it of items) await ins.run(wkId, it.title, it.description, addDays(startDate, -it.daysBefore), it.ownerRole);
}

/** People who have to complete items of a role in this WK: Bat roles of the Bat, all others of the Kp. */
async function responsibleByRole(db: DB, wk: Wk) {
  const users = (await db
    .prepare('SELECT id, name, role FROM app_user WHERE (role = ? AND bat_id = ?) OR kp_id = ? ORDER BY name')
    .all('BAT', wk.batId, wk.kpId)) as { id: number; name: string; role: Role }[];
  const map = new Map<Role, { userId: number; name: string }[]>();
  for (const x of users) map.set(x.role, [...(map.get(x.role) ?? []), { userId: x.id, name: x.name }]);
  return map;
}

/** Milestones of a WK as the user may see them: own role only, or all for Bat and Kp Kdt. */
export async function milestonesFor(db: DB, wk: Wk, u: SessionUser): Promise<Milestone[]> {
  const resp = await responsibleByRole(db, wk);
  const done = (await db
    .prepare(
      `SELECT d.milestone_id, d.user_id, d.at, app_user.name FROM milestone_done d JOIN app_user ON app_user.id = d.user_id
       JOIN milestone m ON m.id = d.milestone_id WHERE m.wk_id = ?`,
    )
    .all(wk.id)) as { milestone_id: number; user_id: number; at: string; name: string }[];
  return ((await db.prepare('SELECT * FROM milestone WHERE wk_id = ? ORDER BY due_date, id').all(wk.id)) as Row[])
    .filter((r) => canSeeAllMilestones(u) || r.owner_role === u.role)
    .map((r) => ({
      id: r.id,
      wkId: r.wk_id,
      title: r.title,
      description: r.description,
      dueDate: r.due_date,
      ownerRole: r.owner_role,
      responsible: resp.get(r.owner_role) ?? [],
      doneBy: done.filter((d) => d.milestone_id === r.id).map((d) => ({ userId: d.user_id, name: d.name, at: d.at })),
    }));
}

/** An item is complete when every responsible person has ticked it off. */
export const isComplete = (m: Milestone) => m.responsible.length > 0 && m.responsible.every((p) => m.doneBy.some((d) => d.userId === p.userId));

/** Open items for the dashboard: overall for Bat and Kp Kdt, own items for everyone else. */
export async function openCounts(db: DB, wk: Wk, u: SessionUser, today: string) {
  const list = await milestonesFor(db, wk, u);
  const open = canSeeAllMilestones(u)
    ? list.filter((m) => !isComplete(m))
    : list.filter((m) => !m.doneBy.some((d) => d.userId === u.id));
  return { open: open.length, overdue: open.filter((m) => m.dueDate < today).length };
}
