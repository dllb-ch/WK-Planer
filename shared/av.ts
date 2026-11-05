// Helpers for the Ausbildungsvorbereitung, shared by server (normalising stored documents) and client.
import type { AblaufSchritt, AvInput, Fachbereich, PittPhase } from './types';
import { FACHBEREICH_SHORT, FACHBEREICHE, PITT } from './types';
import { fmtTime, parseTime } from './util';

const TIME = /^\d{2}:\d{2}$/;

/** Start time of each step, computed from «Zeit von» and the durations. */
export function schedule(zeitVon: string, ablauf: Pick<AblaufSchritt, 'dauer'>[]) {
  let t = TIME.test(zeitVon) ? parseTime(zeitVon) : null;
  return ablauf.map((r) => {
    if (t === null) return { von: '', bis: '' };
    const res = { von: fmtTime(t % 1440), bis: fmtTime((t + (r.dauer || 0)) % 1440) };
    t += r.dauer || 0;
    return res;
  });
}

/** Fachbereiche from keys or labels («Pionier», «KGS», «Führungsunterstützung», «FU»); unknown ones are dropped. */
export function fachbereicheOf(v: unknown): Fachbereich[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [];
  const keys = list
    .map((x) => String(x).trim().toLowerCase())
    .map((t) => (Object.keys(FACHBEREICHE) as Fachbereich[]).find((k) => k.toLowerCase() === t || FACHBEREICHE[k].toLowerCase() === t || FACHBEREICH_SHORT[k].toLowerCase() === t))
    .filter((k): k is Fachbereich => !!k);
  return [...new Set(keys)];
}

/** Phase key from a key or a label such as «P – Problematisieren» (standalone tool files). */
export function phaseOf(v: unknown): PittPhase | '' {
  const s = String(v ?? '');
  if (s in PITT) return s as PittPhase;
  const hit = (Object.keys(PITT) as PittPhase[]).find((k) => PITT[k] === s);
  if (hit) return hit;
  if (/^P\b/.test(s)) return 'P';
  if (/^I\b/.test(s)) return 'I';
  if (/^T.*test/i.test(s)) return 'T2';
  if (/^T\b/.test(s)) return 'T1';
  return '';
}

/**
 * Brings a stored document into the current shape: earlier versions had a single «zeit» text and
 * Ablauf steps with fixed from/to times instead of durations.
 */
export function normalizeAv<T extends Partial<AvInput> & Record<string, unknown>>(
  d: T,
): T & Pick<AvInput, 'zeitVon' | 'zeitBis' | 'zeit' | 'ablauf' | 'leiterUserIds' | 'fachbereiche'> {
  const [z1, z2] = String(d.zeit ?? '').split(/[–-]/).map((x) => x.trim().replace('.', ':'));
  const legacy = (d.ablauf ?? []) as (Partial<AblaufSchritt> & { from?: string; to?: string })[];
  const zeitVon = TIME.test(String(d.zeitVon ?? '')) ? String(d.zeitVon) : TIME.test(z1 ?? '') ? z1 : (legacy.find((r) => r.from && TIME.test(r.from))?.from ?? '');
  const zeitBis = TIME.test(String(d.zeitBis ?? '')) ? String(d.zeitBis) : TIME.test(z2 ?? '') ? z2 : '';
  const ablauf = legacy.map((r) => ({
    dauer:
      typeof r.dauer === 'number'
        ? r.dauer
        : r.from && r.to && TIME.test(r.from) && TIME.test(r.to)
          ? Math.max(0, parseTime(r.to) - parseTime(r.from))
          : 0,
    phase: phaseOf(r.phase),
    text: String(r.text ?? ''),
  }));
  const leiterUserIds = Array.isArray(d.leiterUserIds) ? d.leiterUserIds.filter((x) => Number.isInteger(x)) : [];
  const fachbereiche = fachbereicheOf(d.fachbereiche);
  return { ...d, zeitVon, zeitBis, zeit: zeitVon ? `${zeitVon}${zeitBis ? `–${zeitBis}` : ''}` : '', ablauf, leiterUserIds, fachbereiche };
}

/** Filled sections of an Ausbildungsvorbereitung (the seven steps of the Grfhr form). */
export function avProgress(f: AvInput) {
  const sections = {
    eck: !!(f.ausbildungsart && f.datum && f.zeitVon && (f.leiter || f.leiterUserIds.length)),
    thema: !!f.thema.trim(),
    stufe: !!f.stufe,
    ziele: f.zielsetzungen.some((z) => z.trim()),
    mittel: !!(f.persAusruestung || f.fahrzeug || f.material || f.unterlagen),
    ablauf: f.ablauf.some((r) => r.text.trim()),
    ctrl: !!f.controlling.trim(),
  };
  return { sections, done: Object.values(sections).filter(Boolean).length, total: 7 };
}

/** Fachbereich suggested from the Zug name, e.g. «Pi Z 1» → Pionier, «FU KFS» → Führungsunterstützung. */
export function guessFachbereiche(zugName: string): Fachbereich[] {
  const n = zugName.toLowerCase();
  if (/\bpi\b|pionier/.test(n)) return ['PIONIER'];
  if (/betreu|care/.test(n)) return ['BETREUUNG'];
  if (/\bfu\b|führungs|fuehrungs/.test(n)) return ['FU'];
  if (/kgs|kulturg/.test(n)) return ['KGS'];
  return [];
}
