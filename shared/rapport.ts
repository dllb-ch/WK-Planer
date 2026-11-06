// Rapport schemas from the Handbuch Führung im Zivilschutz (pp. 35, 59–60).

import type { RapportSchema, Traktandum } from './types';
import { translate, type Key, type Lang } from './i18n';

interface Template {
  label: string;
  /** When to use it. */
  hint: string;
  traktanden: { key: string; title: string; hint: string }[];
}

export const RAPPORT_SCHEMAS: Record<RapportSchema, Template> = {
  AUSB_VORB: {
    label: 'Rapport in der Ausbildungsvorbereitung',
    hint: 'Vorbereitungsrapporte vor dem WK (Konzept, Detailvorbereitungen, AVOR).',
    traktanden: [
      { key: 'ziel', title: 'Ziele des Rapports', hint: 'z. B. Wissensstand ausgleichen, Stand der Arbeiten ermitteln, Anträge entscheiden, Aufträge erteilen' },
      { key: 'orientierung', title: 'Orientierung über den Dienstanlass', hint: 'Auftrag, Rahmen, Termine' },
      { key: 'stand', title: 'Stand der Vorbereitungen', hint: 'Pendenzen aus früheren Rapporten, Vorbereitungsschritte' },
      { key: 'auftraege', title: 'Erteilen von Aufträgen', hint: 'Wer, was, wo, wann, womit? – als Pendenz erfassen' },
      { key: 'antraege', title: 'Anträge', hint: 'Anträge anhören und entscheiden' },
      { key: 'organisatorisches', title: 'Organisatorisches', hint: 'Material, Fahrzeuge, Arbeitsplätze koordinieren' },
      { key: 'vorgehen', title: 'Weiteres Vorgehen', hint: '' },
      { key: 'umfrage', title: 'Umfrage', hint: '' },
      { key: 'naechster', title: 'Nächster Rapport', hint: 'Datum, Zeit, Ort, Vorbereitungsaufträge' },
    ],
  },
  AUSB_DURCH: {
    label: 'Rapport in der Ausbildungsdurchführung (Kaderrapport)',
    hint: 'Tagesrapporte während des WK.',
    traktanden: [
      { key: 'ziel', title: 'Ziel des Rapports', hint: '' },
      { key: 'stand', title: 'Stand der Arbeiten', hint: 'Personelles, Materielles, Ausbildungsstand, offene Pendenzen' },
      { key: 'logistik', title: 'Logistische Belange', hint: 'Verpflegung, Transporte, Unterkunft' },
      { key: 'einruecken', title: 'Einrücken', hint: '' },
      { key: 'erreichbarkeit', title: 'Erreichbarkeit', hint: '' },
      { key: 'admin', title: 'Administratives', hint: '' },
      { key: 'umfrage', title: 'Umfrage', hint: '' },
      { key: 'naechster', title: 'Nächster Rapport', hint: 'Datum, Zeit, Ort' },
    ],
  },
  EINSATZ_VOR: {
    label: 'Rapport vor dem Einsatzbeginn',
    hint: 'Einsatz oder Übung: erster Rapport mit Absicht und ersten Aufträgen.',
    traktanden: [
      { key: 'ziel', title: 'Ziel des Rapports', hint: '' },
      { key: 'lage', title: 'Orientierung über die Lage', hint: 'Ereignis und Ausmass, Organisationen im Einsatz, getroffene Massnahmen' },
      { key: 'absicht', title: 'Absicht des Kommandanten', hint: 'Kraft, Raum, Zeit (visualisiert)' },
      { key: 'auftraege', title: 'Aufträge', hint: 'Wer, was, wo, wann, womit? Was danach?' },
      { key: 'antraege', title: 'Anträge', hint: 'Sofortmassnahmen, andere Massnahmen' },
      { key: 'vorgehen', title: 'Weiteres Vorgehen (Besonderes)', hint: 'Zusammenarbeit, Verbindungen, Material, Sanität, Sicherheit, Verpflegung' },
      { key: 'zeitplanung', title: 'Zeitplanung', hint: '' },
      { key: 'umfrage', title: 'Umfrage', hint: '' },
      { key: 'naechster', title: 'Nächster Rapport', hint: '' },
    ],
  },
  EINSATZ_WAEHREND: {
    label: 'Rapport während des Einsatzes',
    hint: 'Folgerapporte zur Steuerung des Einsatzes.',
    traktanden: [
      { key: 'ziel', title: 'Ziele des Rapports', hint: '' },
      { key: 'lage', title: 'Orientierung über die Lage', hint: '' },
      { key: 'stand', title: 'Stand der Arbeiten', hint: 'Personelles, Materielles' },
      { key: 'antraege', title: 'Anträge', hint: '' },
      { key: 'entscheid', title: 'Entscheid und Auftragserteilung', hint: 'als Pendenz erfassen' },
      { key: 'zeitplanung', title: 'Zeitplanung', hint: '' },
      { key: 'umfrage', title: 'Umfrage', hint: '' },
      { key: 'naechster', title: 'Nächster Rapport', hint: '' },
    ],
  },
  BEFEHL: {
    label: 'Befehlsausgabe (Fünf-Punkte-Befehl O-A-A-B-S)',
    hint: 'Aufträge im Rapport nach der Struktur des Fünf-Punkte-Befehls erteilen.',
    traktanden: [
      { key: 'orientierung', title: 'O – Orientierung', hint: 'Ereignis und Ausmass, Organisationen im Einsatz, erhaltener Auftrag, bereits getroffene Massnahmen' },
      { key: 'absicht', title: 'A – Absicht', hint: 'Kraft, Raum, Zeit (visualisiert)' },
      { key: 'auftraege', title: 'A – Aufträge', hint: 'Wer, was, wo, wann, womit? Was danach? Besondere Belange' },
      { key: 'besonderes', title: 'B – Besonderes', hint: 'Zusammenarbeit, Verbindungen, Rückmeldungen, Material und Transporte, Sanität, Gefahren und Sicherheit, Verpflegung, Ablösungen' },
      { key: 'standorte', title: 'S – Standorte', hint: 'Vorgesetzte Stelle, wichtige Einrichtungen' },
    ],
  },
  FREI: {
    label: 'Freie Traktandenliste',
    hint: 'Eigene Traktanden.',
    traktanden: [
      { key: 'ziel', title: 'Ziel des Rapports', hint: '' },
      { key: 'umfrage', title: 'Umfrage', hint: '' },
      { key: 'naechster', title: 'Nächster Rapport', hint: '' },
    ],
  },
};

/** Key of a German agenda text in shared/i18n (areas/rapport_traktanden.ts). */
const TEXT_KEY: Record<string, Key> = {
  "Ziele des Rapports": 'rapt.00',
  "z. B. Wissensstand ausgleichen, Stand der Arbeiten ermitteln, Anträge entscheiden, Aufträge erteilen": 'rapt.01',
  "Orientierung über den Dienstanlass": 'rapt.02',
  "Auftrag, Rahmen, Termine": 'rapt.03',
  "Stand der Vorbereitungen": 'rapt.04',
  "Pendenzen aus früheren Rapporten, Vorbereitungsschritte": 'rapt.05',
  "Erteilen von Aufträgen": 'rapt.06',
  "Wer, was, wo, wann, womit? – als Pendenz erfassen": 'rapt.07',
  "Anträge": 'rapt.08',
  "Anträge anhören und entscheiden": 'rapt.09',
  "Organisatorisches": 'rapt.10',
  "Material, Fahrzeuge, Arbeitsplätze koordinieren": 'rapt.11',
  "Weiteres Vorgehen": 'rapt.12',
  "Umfrage": 'rapt.13',
  "Nächster Rapport": 'rapt.14',
  "Datum, Zeit, Ort, Vorbereitungsaufträge": 'rapt.15',
  "Ziel des Rapports": 'rapt.16',
  "Stand der Arbeiten": 'rapt.17',
  "Personelles, Materielles, Ausbildungsstand, offene Pendenzen": 'rapt.18',
  "Logistische Belange": 'rapt.19',
  "Verpflegung, Transporte, Unterkunft": 'rapt.20',
  "Einrücken": 'rapt.21',
  "Erreichbarkeit": 'rapt.22',
  "Administratives": 'rapt.23',
  "Datum, Zeit, Ort": 'rapt.24',
  "Orientierung über die Lage": 'rapt.25',
  "Ereignis und Ausmass, Organisationen im Einsatz, getroffene Massnahmen": 'rapt.26',
  "Absicht des Kommandanten": 'rapt.27',
  "Kraft, Raum, Zeit (visualisiert)": 'rapt.28',
  "Aufträge": 'rapt.29',
  "Wer, was, wo, wann, womit? Was danach?": 'rapt.30',
  "Sofortmassnahmen, andere Massnahmen": 'rapt.31',
  "Weiteres Vorgehen (Besonderes)": 'rapt.32',
  "Zusammenarbeit, Verbindungen, Material, Sanität, Sicherheit, Verpflegung": 'rapt.33',
  "Zeitplanung": 'rapt.34',
  "Personelles, Materielles": 'rapt.35',
  "Entscheid und Auftragserteilung": 'rapt.36',
  "als Pendenz erfassen": 'rapt.37',
  "O – Orientierung": 'rapt.38',
  "Ereignis und Ausmass, Organisationen im Einsatz, erhaltener Auftrag, bereits getroffene Massnahmen": 'rapt.39',
  "A – Absicht": 'rapt.40',
  "A – Aufträge": 'rapt.41',
  "Wer, was, wo, wann, womit? Was danach? Besondere Belange": 'rapt.42',
  "B – Besonderes": 'rapt.43',
  "Zusammenarbeit, Verbindungen, Rückmeldungen, Material und Transporte, Sanität, Gefahren und Sicherheit, Verpflegung, Ablösungen": 'rapt.44',
  "S – Standorte": 'rapt.45',
  "Vorgesetzte Stelle, wichtige Einrichtungen": 'rapt.46',
};
const inLang = (lang: Lang, s: string) => (s && TEXT_KEY[s] ? translate(lang, TEXT_KEY[s]) : s);

/** Agenda items of a schema, in the given language (new briefings start with them). */
export const traktandenOf = (schema: RapportSchema, lang: Lang = 'de'): Traktandum[] =>
  RAPPORT_SCHEMAS[schema].traktanden.map((t) => ({ ...t, title: inLang(lang, t.title), hint: inLang(lang, t.hint), notes: '' }));
