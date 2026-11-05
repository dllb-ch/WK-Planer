// Templates for Erkundungsprotokoll (Anhänge S. 33–38) and Übungen.
import type { ErkundungData, TagesbefehlData, UebungData } from './types';

/** Checkliste of the Erkundungsprotokoll, grouped as in the form. Keys stay stable when texts change. */
export const ERKUNDUNG_CHECKLISTE: { group: string; items: { key: string; text: string }[] }[] = [
  {
    group: 'Ausbildungsplätze, Gelände für Übungen (im Freien)',
    items: [
      { key: 'platz', text: 'Platzangebot' },
      { key: 'eignung', text: 'Können die angestrebten Ausbildungsinhalte, Übungen an diesem Ort durchgeführt werden?' },
      { key: 'behoerden', text: 'Kontaktaufnahme mit Behörden, Amtsstellen, Liegenschafts-, Wald-, Landbesitzern usw.' },
      { key: 'auflagen', text: 'Auflagen von Besitzern oder Umweltschutzbestimmungen' },
      { key: 'kosten', text: 'Kostenfolgen (Miete, Entschädigung)' },
      { key: 'gedeckt', text: 'Gedeckte Arbeitsplätze bei schlechtem Wetter' },
      { key: 'infrastruktur', text: 'Vorhandene Infrastruktur als Übungsmaterial (Trümmer, Wasser, Ruine etc.)' },
      { key: 'depot', text: 'Räume für Materialdepot, Parkgelegenheit etc.' },
      { key: 'hilfen', text: 'Zusätzliche Ausbildungshilfen (einsetzbar, nötig)' },
    ],
  },
  {
    group: 'Anfahrtswege, Verkehrsachsen',
    items: [
      { key: 'passierbar', text: 'Passierbar (Jahreszeit)' },
      { key: 'oev', text: 'Öffentliche Verkehrsmittel, Fahrpläne, Preise, Vergünstigungen/Rabatte' },
      { key: 'verkehr', text: 'Sicherheit, Durchgangsverkehr' },
      { key: 'gewicht', text: 'Gewichtsbeschränkungen, Restriktionen' },
      { key: 'bewilligung', text: 'Einholen von Bewilligungen nötig?' },
      { key: 'parkplaetze', text: 'Parkplätze für die Fahrzeuge (Einsatz und private PKW)' },
      { key: 'wegweisung', text: 'Ist eine Wegweisung/Einweisung notwendig?' },
    ],
  },
  {
    group: 'Finanzen',
    items: [
      { key: 'kostenabklaerung', text: 'Sind Kostenabklärungen getroffen und festgehalten worden?' },
      { key: 'kostenliste', text: 'Sind die Listen der kostenverursachenden Gerätschaften und Räumlichkeiten vollständig?' },
      { key: 'kostenverteilung', text: 'Wie werden die Kosten verteilt?' },
    ],
  },
  {
    group: 'Unterkunft (Einsätze ausserhalb Gemeinde/Region)',
    items: [
      { key: 'betten', text: 'Genügend Betten, Bettzeug, Decken, pers. Kleiderschränke, Kleiderbügel' },
      { key: 'sanitaer', text: 'Waschgelegenheiten / Toiletten / Duschen' },
      { key: 'einkauf', text: 'Einkaufsmöglichkeiten, Lieferanten' },
      { key: 'kochen', text: 'Kochmöglichkeiten, Geschirr, Küchengeräte und -tücher' },
      { key: 'kuehl', text: 'Kühlräume oder geeignete Lagerorte für Esswaren' },
      { key: 'essraum', text: 'Grösse der Aufenthalts-/Essräume' },
      { key: 'mobiliar', text: 'Mobiliar (Anzahl Tische/Stühle)' },
      { key: 'buero', text: 'Büros für Administration, Büromaterial, Kopiergeräte' },
      { key: 'telefon', text: 'Telefon- und Fax-Anschlüsse' },
      { key: 'trocken', text: 'Trockenräume für pers. Ausrüstung, Waschmaschine' },
      { key: 'materialraum', text: 'Räumlichkeiten für Material' },
      { key: 'abfall', text: 'Abfallentsorgung' },
      { key: 'betriebsstoff', text: 'Betriebsstoffnachschub' },
      { key: 'post', text: 'Post (Bezug und Verteilung bei mehrtägigen Einsätzen)' },
      { key: 'retablierung', text: 'Retablierungsmöglichkeiten für die pers. Ausrüstung' },
      { key: 'transportbedarf', text: 'Bedarf an Transportfahrzeugen für Personal und Material' },
      { key: 'fahrzeugpflege', text: 'Reinigungs- und Retablierungsmöglichkeiten für die Fahrzeuge (Reparaturstelle)' },
      { key: 'betriebsstofflager', text: 'Betriebsstofflager' },
    ],
  },
];

export const emptyErkundung = (): ErkundungData => ({
  datum: '',
  zeit: '',
  formation: '',
  ort: '',
  koordinaten: '',
  area: null,
  dauerVon: '',
  dauerBis: '',
  kontakte: [{ institution: '', telefon: '', email: '' }],
  auftraege: '',
  gefahren: { mensch: '', material: '', methode: '', mitwelt: '' },
  risiken: [{ risiko: '', massnahmen: '', wer: '', restrisiko: '' }],
  beurteilung: '',
  notfall: { ort: '', spital: '', spitalTel: '', ambulanz: '', ambulanzTel: '144', luftrettung: '', luftrettungTel: '1414', massnahmen: '' },
  arbeiten: [{ was: '', personal: '', verantwortung: '', mittel: '' }],
  logistik: '',
  checkliste: {},
  notizen: '',
  verfasser: '',
});

/** Fill missing fields (documents of earlier versions, partial input). */
export function normalizeErkundung(d: Partial<ErkundungData>): ErkundungData {
  const e = emptyErkundung();
  return { ...e, ...d, gefahren: { ...e.gefahren, ...d.gefahren }, notfall: { ...e.notfall, ...d.notfall }, checkliste: { ...d.checkliste } };
}

/** Sections of the protocol that contain something (for the progress bar). */
export function erkundungProgress(d: ErkundungData) {
  const s = {
    kopf: !!(d.datum && (d.ort || d.koordinaten)),
    auftraege: !!d.auftraege.trim(),
    gefahren: Object.values(d.gefahren).some((x) => x.trim()),
    risiken: d.risiken.some((r) => r.risiko.trim()) && !!d.beurteilung,
    notfall: !!(d.notfall.spital || d.notfall.ort),
    arbeiten: d.arbeiten.some((a) => a.was.trim()),
    logistik: !!d.logistik.trim(),
    checkliste: Object.values(d.checkliste).some((c) => c.state),
  };
  return { sections: s, done: Object.values(s).filter(Boolean).length, total: Object.keys(s).length };
}

export const UEBUNG_ARTEN = ['Gruppenübung', 'Zugsübung', 'Kompanieübung', 'Einsatzübung', 'Stabsübung', 'Übung mit Partnern'];

export const emptyUebung = (): UebungData => ({
  art: 'Zugsübung',
  datum: '',
  zeitVon: '',
  zeitBis: '',
  ort: '',
  area: null,
  leitung: '',
  leitungUserIds: [],
  beuebteZugIds: [],
  zweck: '',
  ziele: [{ text: '', erreicht: '', bemerkung: '' }],
  ausgangslage: '',
  anlage: '',
  mittel: '',
  sicherheit: '',
  beobachter: '',
  verbindungen: '',
  besonderes: '',
  drehbuch: [],
  unterlagenLage: '',
  unterlagenAuftrag: '',
  unterlagenHinweise: '',
  besprechung: { datum: '', verlauf: '', positiv: '', verbessern: '', massnahmen: '' },
});

export function normalizeUebung(d: Partial<UebungData>): UebungData {
  const e = emptyUebung();
  return { ...e, ...d, besprechung: { ...e.besprechung, ...d.besprechung } };
}

export const emptyTagesbefehl = (): TagesbefehlData => ({ tagesverantwortlicher: '', tenue: '', besonderes: '', sicherheit: '', erreichbarkeit: '' });
