import { translate, type Key, type Lang } from './i18n';
import type { Duty, StandardBlock, TemplateItem, Wk, Zielsetzung } from './types';
import { KDO_ID } from './types';

export const fmtTime = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function parseTime(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Inclusive list of ISO dates between start and end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last && out.length < 31) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

type DaysOf = Pick<Wk, 'startDate' | 'endDate' | 'avorDays'> & Partial<Pick<Wk, 'kvkDays' | 'dayDuty'>>;

/** All plannable days of a WK: AVOR and KVK days (may lie before the WK) and the WK days, sorted. */
export const wkDays = (wk: DaysOf) => [...new Set([...wk.avorDays, ...(wk.kvkDays ?? []), ...dateRange(wk.startDate, wk.endDate)])].sort();

export const isAvorDay = (wk: Pick<Wk, 'avorDays'>, date: string) => wk.avorDays.includes(date);
export const isKvkDay = (wk: Partial<Pick<Wk, 'kvkDays'>>, date: string) => !!wk.kvkDays?.includes(date);

export type DayKind = 'AVOR' | 'KVK' | 'WK';
export const dayKind = (wk: DaysOf, date: string): DayKind => (isAvorDay(wk, date) ? 'AVOR' : isKvkDay(wk, date) ? 'KVK' : 'WK');

/** Duty of the Züge on a day unless set otherwise: as the type of the day; on AVOR days only the Kdo. */
export const defaultDuty = (wk: DaysOf, date: string): Duty => (isAvorDay(wk, date) ? 'NONE' : isKvkDay(wk, date) ? 'KVK' : 'WK');

/** Duty of a column on a day. The Kdo column always has the type of the day. */
export function dutyOf(wk: DaysOf, date: string, zugId: number): Duty {
  if (zugId === KDO_ID) return dayKind(wk, date);
  return wk.dayDuty?.[date]?.[String(zugId)] ?? defaultDuty(wk, date);
}

/** Does the Zug serve on this day (WK, KVK or AVOR)? */
export const servesOnDay = (wk: DaysOf, date: string, zugId: number) => dutyOf(wk, date, zugId) !== 'NONE';

/**
 * May a block lie in these columns on that day? A single column needs service; a block across several columns
 * (e.g. Mittagessen for all) may cross Züge without service, as long as someone there serves.
 */
export const blockFitsDay = (wk: DaysOf, date: string, zugIds: number[]) =>
  zugIds.length > 1 ? zugIds.some((id) => servesOnDay(wk, date, id)) : zugIds.every((id) => servesOnDay(wk, date, id));

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const weekday = (iso: string) => WEEKDAYS[new Date(iso + 'T00:00:00Z').getUTCDay()];
export const fmtDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

/** Built-in Vorbereitung (Handbuch Führung im ZS, Abb. 16, extended per role); offsets in days before the WK start. */
/** Standard blocks of a day until the Kp saves its own. */
export const DEFAULT_STANDARD_BLOCKS: StandardBlock[] = [
  { title: 'Appell', type: 'APPELL', startMin: 7 * 60 + 30, endMin: 7 * 60 + 45, scope: 'ZUEGE', locked: true },
  { title: 'Mittagessen', type: 'VERPFLEGUNG', startMin: 12 * 60, endMin: 13 * 60, scope: 'ALLE', locked: false },
  { title: 'Kaderrapport', type: 'RAPPORT', startMin: 16 * 60 + 30, endMin: 17 * 60, scope: 'ALLE', locked: true },
];

/** Goals of the WK-Konzept for a Zug (those for all Züge and those for this one). */
export const zieleFor = (ziele: Zielsetzung[], zugId: number) => ziele.filter((z) => z.zugIds.length === 0 || z.zugIds.includes(zugId));

export const DEFAULT_VORBEREITUNG: TemplateItem[] = [
  { title: 'Ausbildungsbefehl an die Kompanien erteilen', description: 'Leitziel, Absicht, Aufträge und Daten pro Kp.', daysBefore: 400, ownerRole: 'BAT' },
  { title: 'Konzept mit provisorischem Arbeitsprogramm erstellen', description: '', daysBefore: 365, ownerRole: 'KPKDT' },
  { title: 'Einladung zum Rapport, Versand Konzept und Aufträge für die Vorbereitung', description: '', daysBefore: 270, ownerRole: 'KPKDT' },
  { title: 'Studium Konzept, Entwurf Ausbildungsprogramm und Abklärungen pro Bereich', description: 'Themen und Zeitplan des Zuges entwerfen.', daysBefore: 210, ownerRole: 'ZFHR' },
  { title: 'Rapport: Konzept bereinigen, Aufträge für Detailvorbereitungen erteilen', description: '', daysBefore: 180, ownerRole: 'KPKDT' },
  { title: 'Räume und Unterkünfte reservieren', description: 'Theoriesäle, Küche, Unterkunft gemäss Konzept.', daysBefore: 120, ownerRole: 'LOGOF' },
  { title: 'Evtl. Rekognoszierung der Arbeitsplätze', description: '', daysBefore: 120, ownerRole: 'ZFHR' },
  { title: 'Detailvorbereitungen, Zugführerarbeitsprogramm erstellen', description: 'Detailplanung der Zeitfenster in der Zugansicht.', daysBefore: 70, ownerRole: 'ZFHR' },
  { title: 'Verpflegungs- und Transportkonzept erstellen', description: '', daysBefore: 60, ownerRole: 'LOGOF' },
  { title: 'Rapport: Überprüfung Detailvorbereitungen, Bereinigung WK-Dossier', description: '', daysBefore: 56, ownerRole: 'KPKDT' },
  { title: 'Fahrzeuge, Räume und Gelände anfragen', description: 'Anfragen im Tab «Ressourcen».', daysBefore: 49, ownerRole: 'ZFHR' },
  { title: 'Fahrzeug- und Materialbestellungen auslösen', description: 'Bewilligte Anfragen bestellen.', daysBefore: 45, ownerRole: 'LOGOF' },
  { title: 'Versand Befehl für den WK mit Arbeitsprogramm', description: '', daysBefore: 42, ownerRole: 'KPKDT' },
  { title: 'Arbeitsprogramm prüfen und freigeben', description: '', daysBefore: 35, ownerRole: 'BAT' },
  { title: 'Fachliche Vorbereitung: Reglemente und Unterlagen studieren', description: '', daysBefore: 28, ownerRole: 'KADER' },
  { title: 'Ausbildungsvorbereitungen für die eigenen Posten erstellen', description: 'Pro Zeitfenster in der Zugansicht.', daysBefore: 21, ownerRole: 'KADER' },
  { title: 'Postenplakate und Material bereitstellen', description: '', daysBefore: 7, ownerRole: 'KADER' },
  { title: 'KVK: Vorbereitung und Überprüfung der vorgesehenen Ausbildung', description: '', daysBefore: 3, ownerRole: 'KPKDT' },
  { title: 'Dienstleistungsnachbesprechung (AAR) durchführen', description: 'Bilanz, Zielerreichung, Optimierungsmassnahmen.', daysBefore: -14, ownerRole: 'KPKDT' },
  { title: 'Rückmeldungen Ausbildungskontrolle an Kp Kdt', description: '', daysBefore: -7, ownerRole: 'ZFHR' },
];

/** Default texts in another language (shared/i18n/areas/defaults.ts); German stays as written above. */
const DEFAULT_KEY: Record<string, Key> = {
  "Ausbildungsbefehl an die Kompanien erteilen": 'def.00',
  "Leitziel, Absicht, Aufträge und Daten pro Kp.": 'def.01',
  "Konzept mit provisorischem Arbeitsprogramm erstellen": 'def.02',
  "Einladung zum Rapport, Versand Konzept und Aufträge für die Vorbereitung": 'def.03',
  "Studium Konzept, Entwurf Ausbildungsprogramm und Abklärungen pro Bereich": 'def.04',
  "Themen und Zeitplan des Zuges entwerfen.": 'def.05',
  "Rapport: Konzept bereinigen, Aufträge für Detailvorbereitungen erteilen": 'def.06',
  "Räume und Unterkünfte reservieren": 'def.07',
  "Theoriesäle, Küche, Unterkunft gemäss Konzept.": 'def.08',
  "Evtl. Rekognoszierung der Arbeitsplätze": 'def.09',
  "Detailvorbereitungen, Zugführerarbeitsprogramm erstellen": 'def.10',
  "Detailplanung der Zeitfenster in der Zugansicht.": 'def.11',
  "Verpflegungs- und Transportkonzept erstellen": 'def.12',
  "Rapport: Überprüfung Detailvorbereitungen, Bereinigung WK-Dossier": 'def.13',
  "Fahrzeuge, Räume und Gelände anfragen": 'def.14',
  "Anfragen im Tab «Ressourcen».": 'def.15',
  "Fahrzeug- und Materialbestellungen auslösen": 'def.16',
  "Bewilligte Anfragen bestellen.": 'def.17',
  "Versand Befehl für den WK mit Arbeitsprogramm": 'def.18',
  "Arbeitsprogramm prüfen und freigeben": 'def.19',
  "Fachliche Vorbereitung: Reglemente und Unterlagen studieren": 'def.20',
  "Ausbildungsvorbereitungen für die eigenen Posten erstellen": 'def.21',
  "Pro Zeitfenster in der Zugansicht.": 'def.22',
  "Postenplakate und Material bereitstellen": 'def.23',
  "KVK: Vorbereitung und Überprüfung der vorgesehenen Ausbildung": 'def.24',
  "Dienstleistungsnachbesprechung (AAR) durchführen": 'def.25',
  "Bilanz, Zielerreichung, Optimierungsmassnahmen.": 'def.26',
  "Rückmeldungen Ausbildungskontrolle an Kp Kdt": 'def.27',
  "Appell": 'def.28',
  "Mittagessen": 'def.29',
  "Kaderrapport": 'def.30',
};
const defaultText = (lang: Lang, s: string) => (s && DEFAULT_KEY[s] ? translate(lang, DEFAULT_KEY[s]) : s);
export const defaultStandardBlocks = (lang: Lang = 'de'): StandardBlock[] => DEFAULT_STANDARD_BLOCKS.map((b) => ({ ...b, title: defaultText(lang, b.title) }));
export const defaultVorbereitung = (lang: Lang = 'de'): TemplateItem[] =>
  DEFAULT_VORBEREITUNG.map((it) => ({ ...it, title: defaultText(lang, it.title), description: defaultText(lang, it.description) }));

/**
 * Vehicles for a number of people: as few vehicles as possible (largest first), then the smallest one that
 * still fits for the rest. Empty if the seats do not suffice.
 */
export function pickVehicles(free: { id: number; seats: number }[], persons: number): number[] {
  const list = [...free].filter((v) => v.seats > 0).sort((a, b) => b.seats - a.seats);
  const out: number[] = [];
  let rest = persons;
  while (rest > 0) {
    const left = list.filter((v) => !out.includes(v.id));
    if (!left.length) return [];
    const fit = [...left].reverse().find((v) => v.seats >= rest);
    const v = fit ?? left[0];
    out.push(v.id);
    rest -= v.seats;
  }
  return out;
}
