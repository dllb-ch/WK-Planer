// Rapport schemas from the Handbuch Führung im Zivilschutz (pp. 35, 59–60).

import type { RapportSchema, Traktandum } from './types';

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

export const traktandenOf = (schema: RapportSchema): Traktandum[] =>
  RAPPORT_SCHEMAS[schema].traktanden.map((t) => ({ ...t, notes: '' }));
