// Teilnehmerliste from Excel/JSON: our own export, and the export of the personnel system
// (Name, Vorname, Funktion, Grad, *Eff. EinrDatum, *Eff. EntlDatum … – without Zug and e-mail).
import type { ParticipantInput, Wk, Zug } from '@shared/types';
import { wkDays } from '@shared/util';
import { parseDateCell, type Column, type Row } from '../../lib/tableFile';

export const COLUMNS: Column[] = [
  { key: 'nachname', header: 'Nachname', width: 18 },
  { key: 'vorname', header: 'Vorname', width: 16 },
  { key: 'grad', header: 'Grad', width: 10 },
  { key: 'funktion', header: 'Funktion', width: 22 },
  { key: 'zug', header: 'Zug', width: 12 },
  { key: 'email', header: 'E-Mail', width: 26 },
  { key: 'nummer', header: 'Nummer', width: 14 },
  { key: 'tage', header: 'Tage', width: 30 },
  { key: 'essen', header: 'Essen', width: 14 },
  { key: 'unvertraeglichkeiten', header: 'Unverträglichkeiten', width: 24 },
];

// Other names of the same columns: common exports and the personnel system.
export const ALIASES: Column[] = [
  { key: 'nachname', header: 'Name' },
  { key: 'nachname', header: 'Familienname' },
  { key: 'vorname', header: 'Rufname' },
  { key: 'grad', header: 'Rang' },
  { key: 'funktion', header: 'Fkt' },
  { key: 'zug', header: 'Einteilung' },
  { key: 'email', header: 'Email' },
  { key: 'email', header: 'Mail' },
  { key: 'nummer', header: 'AHV-Nr' },
  { key: 'nummer', header: 'AHV' },
  { key: 'nummer', header: 'Personalnummer' },
  { key: 'nummer', header: 'ID' },
  { key: 'einrueckung', header: '*Eff. EinrDatum' },
  { key: 'einrueckung', header: 'EinrDatum' },
  { key: 'einrueckung', header: 'Einrückdatum' },
  { key: 'entlassung', header: '*Eff. EntlDatum' },
  { key: 'entlassung', header: 'EntlDatum' },
  { key: 'entlassung', header: 'Entlassdatum' },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export function zugByName(zuege: Zug[], name: string) {
  const n = norm(name);
  if (!n) return null;
  return zuege.find((z) => norm(z.name) === n)?.id ?? null;
}

// Words of a Funktion that say nothing about the Zug.
const RANK = new Set(['uof', 'of', 'spez', 'sdt', 'stv', 'chef', 'c']);
// Same Fachbereich, different words.
const SYNONYMS: Record<string, string[]> = { fhrustu: ['fu', 'fhr', 'fhrustu'], fu: ['fu', 'fhr', 'fhrustu'], betreu: ['betreu', 'care', 'betr'], matw: ['log', 'mat'] };

/**
 * Zug suggested for a Funktion of the personnel system («KGS Uof» → KGS, «Fhr Ustü» → FU KFS).
 * Kp Kdt / Stv stay without Zug (Kdo); no or several matches: no suggestion.
 */
export function guessZug(funktion: string, zuege: Zug[]): number | null {
  const f = funktion.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\bkp\s*kdt\b/.test(f)) return null;
  const words = f.split(/[^a-z0-9]+/).filter((w) => w && !RANK.has(w));
  const joined = words.join('');
  const wanted = new Set([...words, joined, ...(SYNONYMS[joined] ?? []), ...words.flatMap((w) => SYNONYMS[w] ?? [])]);
  const hits = zuege.filter((z) => z.name.toLowerCase().split(/[^a-z0-9äöü]+/).some((t) => t && wanted.has(norm(t))));
  return hits.length === 1 ? hits[0].id : null;
}

export interface ParsedImport {
  items: ParticipantInput[];
  unknownZuege: string[];
  /** Funktionen of people without Zug in the file, with how many: the Kp Kdt assigns them a Zug. */
  funktionen: { funktion: string; count: number; guess: number | null }[];
  /** People whose dates of service lie entirely outside the WK (taken over for the whole WK). */
  outside: number;
}

export function parseParticipants(rows: Row[], wk: Wk, zuege: Zug[]): ParsedImport {
  const days = wkDays(wk);
  const unknown = new Set<string>();
  let outside = 0;
  const items: ParticipantInput[] = rows
    .filter((r) => r.nachname?.trim())
    .map((r) => {
      const zugId = zugByName(zuege, r.zug ?? '');
      if (r.zug?.trim() && zugId === null) unknown.add(r.zug.trim());
      let serve = (r.tage ?? '')
        .split(/[,;\s]+/)
        .map(parseDateCell)
        .filter((d) => days.includes(d));
      // Personnel system: entry and discharge date.
      const from = parseDateCell(r.einrueckung ?? '');
      const to = parseDateCell(r.entlassung ?? '') || from;
      if (from) {
        const inWk = days.filter((d) => d >= from && d <= to);
        if (!inWk.length) outside++;
        serve = inWk.length === days.length ? [] : inWk;
      }
      return {
        nachname: r.nachname.trim(),
        vorname: (r.vorname ?? '').trim(),
        grad: (r.grad ?? '').trim(),
        funktion: (r.funktion ?? '').trim(),
        zugId,
        email: (r.email ?? '').trim(),
        extId: (r.nummer ?? '').trim(),
        days: serve,
      };
    });
  const counts = new Map<string, number>();
  for (const it of items) if (it.zugId === null && it.funktion) counts.set(it.funktion, (counts.get(it.funktion) ?? 0) + 1);
  const funktionen = [...counts]
    .map(([funktion, count]) => ({ funktion, count, guess: guessZug(funktion, zuege) }))
    .sort((a, b) => b.count - a.count || a.funktion.localeCompare(b.funktion));
  return { items, unknownZuege: [...unknown], funktionen, outside };
}

/** Zug per Funktion chosen in the dialog (null: without Zug). */
export const applyZugMapping = (items: ParticipantInput[], mapping: Record<string, number | null>) =>
  items.map((it) => (it.zugId === null && it.funktion in mapping ? { ...it, zugId: mapping[it.funktion] } : it));
