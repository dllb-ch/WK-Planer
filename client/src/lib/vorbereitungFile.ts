// Vorbereitung steps as Excel/JSON tables (templates and the step list of a WK).
import type { Role } from '@shared/types';
import { PLANNING_ROLES, ROLE_LABEL } from '@shared/types';
import type { Column } from './tableFile';

export const TEMPLATE_COLUMNS: Column[] = [
  { key: 'titel', header: 'Titel', width: 50 },
  { key: 'beschreibung', header: 'Beschreibung', width: 40 },
  { key: 'rolle', header: 'Rolle', width: 16 },
  { key: 'tageVorWk', header: 'Tage vor WK-Beginn', width: 18 },
];

export const STEP_COLUMNS: Column[] = [
  { key: 'titel', header: 'Titel', width: 50 },
  { key: 'beschreibung', header: 'Beschreibung', width: 40 },
  { key: 'rolle', header: 'Rolle', width: 16 },
  { key: 'termin', header: 'Termin', width: 14 },
  { key: 'erledigt', header: 'Erledigt', width: 12 },
];

/** «Zugführer/in», «ZFHR», «Kp Kdt» … → role; null if unknown. */
export function roleOf(s = ''): Role | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  return PLANNING_ROLES.find((r) => r.toLowerCase() === t || ROLE_LABEL[r].toLowerCase() === t || ROLE_LABEL[r].toLowerCase().startsWith(t.replace(/\/in$/, ''))) ?? null;
}
