// Shared domain types used by server and client.

export type Role = 'ADMIN' | 'BAT' | 'KPKDT' | 'LOGOF' | 'ZFHR' | 'KADER';
export const ROLES: Role[] = ['ADMIN', 'BAT', 'KPKDT', 'LOGOF', 'ZFHR', 'KADER'];
/** Roles that can own items of the Vorbereitung. */
export const PLANNING_ROLES: Role[] = ['BAT', 'KPKDT', 'LOGOF', 'ZFHR', 'KADER'];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Org Admin',
  BAT: 'Bat Kommando',
  KPKDT: 'Kp Kdt',
  LOGOF: 'Log Of',
  ZFHR: 'Zugführer/in',
  KADER: 'Kader',
};

/** Pseudo-Zug id of the per-day «Kdo» column (Kp Kdt, Stv, AVOR). */
export const KDO_ID = 0;

export type WkStatus = 'ENTWURF' | 'EINGEREICHT' | 'FREIGEGEBEN' | 'ZURUECKGEWIESEN';

export const STATUS_LABEL: Record<WkStatus, string> = {
  ENTWURF: 'Entwurf',
  EINGEREICHT: 'Eingereicht',
  FREIGEGEBEN: 'Freigegeben',
  ZURUECKGEWIESEN: 'Zurückgewiesen',
};

export type BlockSource = 'KP' | 'BAT';

export const BLOCK_TYPES = [
  'APPELL',
  'AUSBILDUNG',
  'UEBUNG',
  'RAPPORT',
  'AVOR',
  'VERSCHIEBUNG',
  'VERPFLEGUNG',
  'RETABLIEREN',
  'DIVERSES',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_TYPE_INFO: Record<BlockType, { label: string; color: string }> = {
  APPELL: { label: 'Kurseröffnung / Appell / Entlassung', color: '#64748b' },
  AUSBILDUNG: { label: 'Ausbildung', color: '#2563eb' },
  UEBUNG: { label: 'Übung', color: '#dc2626' },
  RAPPORT: { label: 'Rapport', color: '#7c3aed' },
  AVOR: { label: 'AVOR', color: '#0891b2' },
  VERSCHIEBUNG: { label: 'Verschiebung (Vs)', color: '#a3a3a3' },
  VERPFLEGUNG: { label: 'Verpflegung', color: '#16a34a' },
  RETABLIEREN: { label: 'Retablieren', color: '#ca8a04' },
  DIVERSES: { label: 'Diverses', color: '#78716c' },
};

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  batId: number;
  kpId: number | null;
  zugId: number | null;
}

export interface Bataillon {
  id: number;
  name: string;
  /** e.g. «Zivilschutzorganisation Region Bern-Mittelland», shown on documents. */
  regionName: string;
  /** Logo as data URL (PNG, JPEG or SVG), shown on documents. */
  logo: string | null;
  /** Letterhead of printed documents (corporate design of the canton). */
  briefkopf: Briefkopf;
  /** Logo of the canton (data URL), top right of the letterhead. */
  kantonLogo: string | null;
  /** Where maps open when they have nothing to show yet (otherwise all of Switzerland). */
  mapView: MapView | null;
}

/** Centre and zoom of a map (WGS84, Leaflet zoom level). */
export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

export interface Briefkopf {
  /** e.g. «Amt für Bevölkerungsschutz und Armee» */
  amt: string;
  /** e.g. «Zivilschutz» */
  abteilung: string;
  /** Footer of the first page: address, phone, web. */
  adresse: string;
  telefon: string;
  web: string;
}

export interface Kompanie {
  id: number;
  batId: number;
  name: string;
}

export interface Zug {
  id: number;
  kpId: number;
  name: string;
  order: number;
  zfhrUserId: number | null;
  /** Sollbestand of the Zug (Verwaltung). */
  soll: Bestand;
  /** Istbestand of the Zug (Verwaltung). With Gruppen: Kader and Soldaten are the sum of the Gruppen. */
  ist: Bestand;
  /** Gruppen of the Zug (Organisation), in order. */
  gruppen: Gruppe[];
}

/** A Gruppe of a Zug: its Gruppenführer and its Bestand (Kader and Soldaten; zfhr stays 0). */
export interface Gruppe {
  id: number;
  zugId: number;
  name: string;
  order: number;
  leiterUserId: number | null;
  soll: Bestand;
  ist: Bestand;
}
export type GruppeInput = Pick<Gruppe, 'name' | 'leiterUserId' | 'soll' | 'ist'> & { id?: number };

/** Number of people of a Zug by category. */
export interface Bestand {
  zfhr: number;
  kader: number;
  sdt: number;
}

export const BESTAND_KEYS = ['zfhr', 'kader', 'sdt'] as const;
export const BESTAND_LABEL: Record<keyof Bestand, string> = { zfhr: 'Zugführer', kader: 'Kader', sdt: 'Soldaten' };
export const emptyBestand = (): Bestand => ({ zfhr: 0, kader: 0, sdt: 0 });
export const bestandTotal = (b: Bestand) => b.zfhr + b.kader + b.sdt;
/** Sum of several Bestände, e.g. of all Züge of a Kp. */
export const sumBestand = (list: Bestand[]): Bestand =>
  list.reduce((a, b) => ({ zfhr: a.zfhr + b.zfhr, kader: a.kader + b.kader, sdt: a.sdt + b.sdt }), emptyBestand());

export interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  batId: number;
  kpId: number | null;
  zugId: number | null;
  funktion: string;
}

export interface Wk {
  id: number;
  kpId: number;
  batId: number;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dayStart: number; // minutes after midnight
  dayEnd: number;
  snapMin: number;
  status: WkStatus;
  reviewNote: string;
  /** AVOR days: only the Kp Kdo (and Züge added for the day); may lie before the WK. */
  avorDays: string[];
  /** KVK days (Kadervorkurs): all Züge, may lie before the WK. */
  kvkDays: string[];
  /**
   * Duty of a Zug on a day where it differs from the day's type (WK day: WK, KVK day: KVK, AVOR day: none),
   * e.g. one Zug in the KVK while another has WK on the same day. date → zugId → duty.
   */
  dayDuty: Record<string, Record<string, Duty>>;
  /** Archived by the Bat Kdo: out of the lists and read only. */
  archived: boolean;
  updatedAt: string;
}

export interface Location {
  id: number;
  wkId: number;
  nr: number;
  name: string;
  /** Catalogue room or terrain behind this Standort: blocks there reserve it. */
  resourceId: number | null;
}

export interface Block {
  id: number;
  wkId: number;
  date: string;
  startMin: number;
  endMin: number;
  zugIds: number[];
  title: string;
  type: BlockType;
  locationId: number | null;
  verantwortlich: string;
  notes: string;
  locked: boolean;
  source: BlockSource;
  version: number;
  updatedBy: number | null;
}

export type BlockInput = Omit<Block, 'id' | 'wkId' | 'version' | 'updatedBy' | 'source'> & {
  source?: BlockSource;
};

export interface Comment {
  id: number;
  wkId: number;
  blockId: number | null;
  userId: number;
  userName: string;
  text: string;
  createdAt: string;
}

export interface Ausbildungsbefehl {
  id: number;
  batId: number;
  year: number;
  dienstart: string;
  leitziel: string;
  absicht: string;
  organisation: string;
  besonderes: string;
  auftraege: AuftragKp[];
  /** Attached documents, e.g. the signed Befehl as PDF. */
  files: BefehlFile[];
}

export interface BefehlFile {
  id: number;
  name: string;
  size: number;
  uploadedAt: string;
}

export interface AuftragKp {
  kpId: number;
  richtziele: string;
  teilnehmende: string;
  /** KVK days (one or more). */
  kvkDates: string[];
  wkFrom: string;
  wkTo: string;
  /** WK created from this Auftrag (read only). */
  wkId?: number | null;
}

/** Result of saving the Befehl for one Kompanie. */
export interface WkSync {
  kpId: number;
  kpName: string;
  wkId: number | null;
  action: 'created' | 'linked' | 'updated' | 'unchanged' | 'locked' | 'no-dates';
}

export interface WkKonzept {
  wkId: number;
  orientierung: string;
  organisation: string;
  absicht: string;
  zielsetzungen: Zielsetzung[];
  verpflegung: string;
  material: string;
  standorte: string;
}

/** Goal of the WK-Konzept; zugIds empty = for all Züge. */
export interface Zielsetzung {
  text: string;
  zugIds: number[];
}

export interface Posten {
  id?: number;
  nr: number;
  thema: string;
  ort: string;
  lernziel: string;
  material: string;
  postenchef: string;
}

export interface RotationEntry {
  blockId: number;
  gruppe: string;
  postenNr: number;
}

export interface ZfhrProgramm {
  wkId: number;
  zugId: number;
  ziele: string[];
  gruppen: string[];
  posten: Posten[];
  rotation: RotationEntry[];
  zfhrAktivitaeten: string;
}

/** One item of a WK's Vorbereitung, owned by a role; every person of that role ticks it off individually. */
export interface Milestone {
  id: number;
  wkId: number;
  title: string;
  description: string;
  dueDate: string;
  ownerRole: Role;
  /** People of the owner role in the Kp (or Bat) who have to complete the item. */
  responsible: { userId: number; name: string }[];
  doneBy: { userId: number; name: string; at: string }[];
}

export type MilestoneInput = Pick<Milestone, 'title' | 'description' | 'dueDate' | 'ownerRole'>;

/** Template item; dueDate = WK start minus daysBefore (negative = after the start). */
export interface TemplateItem {
  title: string;
  description: string;
  daysBefore: number;
  ownerRole: Role;
}

export type TemplateScope = 'DEFAULT' | 'BAT' | 'KP';

export interface VorbereitungTemplate {
  batId: number;
  kpId: number | null;
  /** Where the effective items come from: own Kp template, the Bat template or the built-in default. */
  source: TemplateScope;
  items: TemplateItem[];
}

/** Detailed time slice inside a Grobprogramm block, per Zug (Zfhr-Zeitplan). */
export interface BlockDetail {
  id: number;
  blockId: number;
  zugId: number;
  startMin: number;
  endMin: number;
  title: string; // Was / Wo / Womit
  verantwortlich: string;
  /** Groups of the Zug doing this sequence; empty = the whole Zug. */
  groupIds: number[];
}

export type DetailInput = Omit<BlockDetail, 'id' | 'blockId' | 'zugId'>;

/** Group (Gruppe) of a Zug within one WK, e.g. for Postenarbeit in rotation. */
export interface ZugGroup {
  id: number;
  wkId: number;
  zugId: number;
  name: string;
  sort: number;
}

export const AUSBILDUNGSSTUFEN = { ANLERNEN: 'Anlernen', FESTIGEN: 'Festigen', ANWENDEN: 'Anwenden' } as const;
export type Ausbildungsstufe = keyof typeof AUSBILDUNGSSTUFEN;

/** PITT phases as in the Grfhr template (Ausbildungsvorbereitung_Grfhr). */
/** Fachbereiche of the Zivilschutz an Ausbildungsveranstaltung belongs to. */
export const FACHBEREICHE = {
  BETREUUNG: 'Betreuung',
  FU: 'Führungsunterstützung',
  PIONIER: 'Pionier',
  KGS: 'Kulturgüterschutz',
} as const;
export type Fachbereich = keyof typeof FACHBEREICHE;
export const FACHBEREICH_SHORT: Record<Fachbereich, string> = { BETREUUNG: 'Betreuung', FU: 'FU', PIONIER: 'Pionier', KGS: 'KGS' };

export const PITT = { P: 'P – Problematisieren', I: 'I – Informieren', T1: 'T – Trainieren', T2: 'T – Testen' } as const;
export type PittPhase = keyof typeof PITT;

/** One step of the Ablauf; its time follows from «Zeit von» and the durations of the steps before it. */
export interface AblaufSchritt {
  dauer: number; // minutes
  phase: PittPhase | '';
  text: string;
}

/** Ausbildungsvorbereitung Grfhr (Anhänge p. 24–25), one per training slot. */
export interface Ausbildungsvorbereitung {
  id: number;
  wkId: number;
  blockId: number | null;
  zugId: number;
  createdBy: number;
  createdByName: string;
  updatedAt: string;
  ausbildungsart: string;
  thema: string;
  fachbereiche: Fachbereich[];
  datum: string;
  zeitVon: string; // HH:MM
  zeitBis: string;
  /** «von–bis», kept for lists. */
  zeit: string;
  teilnehmer: string;
  arbeitsplatz: string;
  /** Names as printed on the document. */
  leiter: string;
  /** People assigned to this lesson (Leiter, Postenchefs); they see it in «Meine Ausbildungen» and may edit it. */
  leiterUserIds: number[];
  grundlagen: string;
  stufe: Ausbildungsstufe | '';
  zielsetzungen: string[];
  persAusruestung: string;
  postenplakat: string;
  fahrzeug: string;
  material: string;
  unterlagen: string;
  bemerkungen: string;
  controlling: string;
  ablauf: AblaufSchritt[];
  /** Number of attached files (read only). */
  attachmentCount?: number;
}

/** An Ausbildungsvorbereitung with its context, for «Meine Ausbildungen». */
export interface MyAusbildung {
  av: Ausbildungsvorbereitung;
  wkTitle: string;
  zugName: string;
  /** Assigned to me or written by me (otherwise: another one of my Zug). */
  mine: boolean;
}

/** Entry of the library: every Ausbildungsvorbereitung of the Bataillon, for reuse. */
export interface LibraryEntry {
  av: Ausbildungsvorbereitung;
  wkTitle: string;
  wkStart: string;
  kpId: number;
  kpName: string;
  zugName: string;
}

export type AvInput = Omit<Ausbildungsvorbereitung, 'id' | 'wkId' | 'createdBy' | 'createdByName' | 'updatedAt' | 'attachmentCount'>;

export type ResourceKind = 'FAHRZEUG' | 'ANHAENGER' | 'RAUM' | 'GELAENDE';
export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = { FAHRZEUG: 'Fahrzeug', ANHAENGER: 'Anhänger', RAUM: 'Raum', GELAENDE: 'Gelände' };

/** [lat, lng] pairs (WGS84) of a polygon. */
export type Area = [number, number][];

export interface Resource {
  id: number;
  batId: number;
  /** Null: material of the Bataillon, shared by all its Kompanien. */
  kpId: number | null;
  kind: ResourceKind;
  /** Type for requests by amount, e.g. «Mannschaftsbus», «Theoriesaal». */
  category: string;
  name: string;
  description: string;
  capacity: string;
  /** Seats of a vehicle (for requests by number of people). */
  seats: number;
  /** Number of the vehicle (e.g. 3 for «Log 3»); numbered ones are listed first, in this order. */
  nr: number | null;
  area: Area | null;
}

export type ResourceInput = Omit<Resource, 'id' | 'batId'>;

/** A request for a catalogue resource, as seen across Kompanien (material overview, conflicts). */
export interface Booking {
  requestId: number;
  /** Null for a request by amount that has no vehicles/rooms assigned yet. */
  resourceId: number | null;
  category: string;
  quantity: number;
  persons: number;
  wkId: number;
  wkTitle: string;
  kpId: number;
  kpName: string;
  zugName: string;
  date: string;
  startMin: number;
  endMin: number;
  zweck: string;
  status: RequestStatus;
  requestedByName: string;
}

export type RequestStatus = 'BEANTRAGT' | 'BEWILLIGT' | 'ABGELEHNT';
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = { BEANTRAGT: 'Beantragt', BEWILLIGT: 'Bewilligt', ABGELEHNT: 'Abgelehnt' };

export interface ResourceRequest {
  id: number;
  wkId: number;
  zugId: number;
  blockId: number | null;
  /** A specific vehicle or room (e.g. because of its equipment); otherwise requested by type and amount. */
  resourceId: number | null;
  kind: ResourceKind;
  category: string;
  quantity: number;
  /** Request by number of people (vehicles): seats needed; 0 for requests by type and amount. */
  persons: number;
  /** Vehicles or rooms the approver assigned to a request by type and amount. */
  assignedIds: number[];
  date: string;
  startMin: number;
  endMin: number;
  zweck: string;
  note: string;
  area: Area | null;
  /** Reservation of the block's Standort, kept in step with the block by the server. */
  standort: boolean;
  status: RequestStatus;
  requestedBy: number;
  requestedByName: string;
  decisionNote: string;
  createdAt: string;
}

export type RequestInput = Pick<
  ResourceRequest,
  'zugId' | 'blockId' | 'resourceId' | 'kind' | 'category' | 'quantity' | 'persons' | 'date' | 'startMin' | 'endMin' | 'zweck' | 'note' | 'area'
>;

/** Free resources of a type in a time window (for requesting and approving). */
export interface Availability {
  total: number;
  free: Resource[];
}

// ---- Personal: Sollbestand, Teilnehmerliste, Präsenz ----

/** Planned headcount of a Zug (or the Kdo) on a day. */
export interface Strength {
  zugId: number;
  date: string;
  planned: number;
}

export type Diet = 'NORMAL' | 'KEIN_SCHWEIN' | 'VEGETARISCH';
export const DIET_LABEL: Record<Diet, string> = { NORMAL: 'Normal', KEIN_SCHWEIN: 'Kein Schwein', VEGETARISCH: 'Vegetarisch' };

/** A person on the participant list of a WK (imported from the personnel system). */
export interface Participant {
  id: number;
  wkId: number;
  nachname: string;
  vorname: string;
  grad: string;
  funktion: string;
  zugId: number | null;
  email: string;
  /** Number in the personnel system (AHV, PISA …), used to update on re-import. */
  extId: string;
  /** Days of service; empty = the whole WK. */
  days: string[];
  /** Last values given at check-in. */
  diet: Diet;
  intolerances: string;
}
export type ParticipantInput = Omit<Participant, 'id' | 'wkId' | 'diet' | 'intolerances'>;

export interface CheckIn {
  id: number;
  date: string;
  participantId: number | null;
  vorname: string;
  nachname: string;
  email: string;
  zugId: number | null;
  diet: Diet;
  intolerances: string;
  /** SELF: via QR code; MANUAL: marked present by the Kp Kdt or Zfhr. */
  source: 'SELF' | 'MANUAL';
  createdAt: string;
}

/** QR code of a day: open only on that day, unless opened or closed by the Kp Kdt. */
export interface CheckInDay {
  date: string;
  token: string;
  mode: 'AUTO' | 'OPEN' | 'CLOSED';
}

/** What the public check-in form shows. */
export interface PublicCheckIn {
  /** Lets the phone remember that the Eintrittsbefragung of this WK is done. */
  wkId: number;
  wkTitle: string;
  kpName: string;
  regionName: string;
  logo: string;
  date: string;
  open: boolean;
  zuege: { id: number; name: string }[];
}

export interface CheckInInput {
  vorname: string;
  nachname: string;
  email: string;
  zugId: number | null;
  diet: Diet;
  intolerances: string;
  /** Sanitarische Eintrittsbefragung; required at the first check-in of a person in the WK. */
  health?: HealthAnswer | null;
}

// ---- Sanitarische Eintrittsbefragung (Weisungen BABS über die Sicherheitsvorschriften im Zivilschutz, Art. 6) ----

/** Points of Art. 6 Abs. 2: who has to report. */
export type HealthPoint = 'A' | 'B' | 'C' | 'D' | 'E';
export const HEALTH_POINTS: Record<HealthPoint, string> = {
  A: 'Ich habe ein ärztliches Zeugnis oder medizinische Akten mitgebracht.',
  B: 'Ich habe vor dem Dienst eine schwere Krankheit durchgemacht oder einen schweren Unfall erlitten.',
  C: 'Ich leide an einer Gesundheitsschädigung, Krankheit oder Unfallfolge.',
  D: 'Ich habe vor dem Dienst eine ansteckende Krankheit durchgemacht oder war möglicherweise mit einer ansteckenden Krankheit in Kontakt.',
  E: 'Ich glaube, den Anforderungen des Dienstes aus medizinischen Gründen nicht gewachsen zu sein.',
};
/** No point applies = healthy. */
export interface HealthAnswer {
  points: HealthPoint[];
  note: string;
}
/** GESUND: nothing to report; MELDUNG: to be taken to the Kursarzt; KURSARZT: seen by the Kursarzt; ERLEDIGT: closed. */
export type HealthStatus = 'GESUND' | 'MELDUNG' | 'KURSARZT' | 'ERLEDIGT';
export const HEALTH_STATUS_LABEL: Record<HealthStatus, string> = {
  GESUND: 'Gesund',
  MELDUNG: 'Gemeldet – zum Kursarzt',
  KURSARZT: 'Beim Kursarzt gewesen',
  ERLEDIGT: 'Erledigt',
};
/** Answer of one person in a WK. Points and note only for the Kp Kdt; Zugführer see status and restrictions. */
export interface HealthCheck {
  id: number;
  participantId: number | null;
  vorname: string;
  nachname: string;
  zugId: number | null;
  points: HealthPoint[];
  note: string;
  status: HealthStatus;
  /** Restrictions ordered by the Kursarzt, for the superiors (Art. 6 Abs. 3). */
  restriction: string;
  /** SELF: at the QR check-in; MANUAL: recorded by the Kp Kdt. */
  source: 'SELF' | 'MANUAL';
  createdAt: string;
}

// ---- Rapporte und Pendenzen ----

export type RapportSchema = 'AUSB_VORB' | 'AUSB_DURCH' | 'EINSATZ_VOR' | 'EINSATZ_WAEHREND' | 'BEFEHL' | 'FREI';

export interface Traktandum {
  /** Stable key (from the schema, or random for own items). */
  key: string;
  title: string;
  hint: string;
  notes: string;
}

export interface Rapport {
  id: number;
  wkId: number;
  /** null: Rapport of the Kp (Kaderrapport); otherwise of a Zug. */
  zugId: number | null;
  /** «Rapport» block in the Arbeitsprogramm, if any. */
  blockId: number | null;
  title: string;
  schema: RapportSchema;
  date: string;
  startMin: number | null;
  ort: string;
  leitungUserId: number | null;
  protokollUserId: number | null;
  teilnehmerIds: number[];
  /** Absent, excused (free text). */
  abwesend: string;
  /** Guests and others not in the planner. */
  gaeste: string;
  traktanden: Traktandum[];
  status: 'OFFEN' | 'ABGESCHLOSSEN';
  createdBy: number;
  updatedAt: string;
}
export type RapportInput = Omit<Rapport, 'id' | 'wkId' | 'createdBy' | 'updatedAt'>;

export interface Pendenz {
  id: number;
  wkId: number;
  rapportId: number | null;
  traktandumKey: string | null;
  /** Zug of the Rapport (null: Kp). */
  zugId: number | null;
  text: string;
  responsibleUserId: number | null;
  responsibleName: string;
  dueDate: string;
  done: boolean;
  doneAt: string | null;
  doneByName: string;
  createdBy: number;
  createdAt: string;
}
export type PendenzInput = Pick<Pendenz, 'rapportId' | 'traktandumKey' | 'zugId' | 'text' | 'responsibleUserId' | 'dueDate'>;

// ---- Standardblöcke ----

/** For whom a standard block is inserted: all columns incl. Kdo, all Züge, or the Kdo only. */
export type StandardScope = 'ALLE' | 'ZUEGE' | 'KDO';
export const STANDARD_SCOPE_LABEL: Record<StandardScope, string> = { ALLE: 'Alle inkl. Kdo', ZUEGE: 'Alle Züge', KDO: 'Nur Kdo' };

export interface StandardBlock {
  title: string;
  type: BlockType;
  startMin: number;
  endMin: number;
  scope: StandardScope;
  locked: boolean;
}

// ---- Anhänge und Dateien ----

/** A file attached to an Ausbildungsvorbereitung, or shared in the file area of a Zug. */
export interface Attachment {
  id: number;
  name: string;
  mime: string;
  size: number;
  uploadedAt: string;
  uploadedByName: string;
  /** The current user may delete it. */
  canDelete: boolean;
}

/** Largest file the server accepts. */
export const MAX_UPLOAD_MB = 25;

// ---- Erkundung (Erkundungsprotokoll, Anhänge S. 33–38) ----

export type RiskLevel = '' | 'HOCH' | 'MITTEL' | 'TIEF';
export const RISK_LABEL: Record<Exclude<RiskLevel, ''>, string> = { HOCH: 'hoch', MITTEL: 'mittel', TIEF: 'tief' };
export type CheckState = '' | 'OK' | 'OFFEN' | 'NA';

export interface ErkundungData {
  datum: string;
  zeit: string;
  formation: string;
  ort: string;
  koordinaten: string;
  area: Area | null;
  dauerVon: string;
  dauerBis: string;
  kontakte: { institution: string; telefon: string; email: string }[];
  auftraege: string;
  gefahren: { mensch: string; material: string; methode: string; mitwelt: string };
  risiken: { risiko: string; massnahmen: string; wer: string; restrisiko: RiskLevel }[];
  beurteilung: RiskLevel;
  notfall: { ort: string; spital: string; spitalTel: string; ambulanz: string; ambulanzTel: string; luftrettung: string; luftrettungTel: string; massnahmen: string };
  arbeiten: { was: string; personal: string; verantwortung: string; mittel: string }[];
  logistik: string;
  /** Checklist item key → state and note. */
  checkliste: Record<string, { state: CheckState; note: string }>;
  notizen: string;
  verfasser: string;
}

export interface Erkundung extends ErkundungData {
  id: number;
  wkId: number;
  zugId: number | null;
  blockId: number | null;
  title: string;
  createdBy: number;
  createdByName: string;
  updatedAt: string;
  attachmentCount?: number;
}
export type ErkundungInput = Omit<Erkundung, 'id' | 'wkId' | 'createdBy' | 'createdByName' | 'updatedAt' | 'attachmentCount'>;

// ---- Übungen (Übungskonzept, Drehbuch, Übungsunterlagen, Übungsbesprechung) ----

export type Zielerreichung = '' | 'JA' | 'TEILWEISE' | 'NEIN';
export const ZIELERREICHUNG_LABEL: Record<Exclude<Zielerreichung, ''>, string> = { JA: 'erreicht', TEILWEISE: 'teilweise erreicht', NEIN: 'nicht erreicht' };

export interface DrehbuchEintrag {
  zeit: string;
  von: string;
  an: string;
  /** Einspielung: Meldung, Ereignis, Lageänderung. */
  einspielung: string;
  /** Erwartete Reaktion der Beübten. */
  erwartet: string;
  mittel: string;
  erledigt: boolean;
}

export interface UebungData {
  art: string;
  datum: string;
  zeitVon: string;
  zeitBis: string;
  ort: string;
  area: Area | null;
  leitung: string;
  leitungUserIds: number[];
  beuebteZugIds: number[];
  zweck: string;
  ziele: { text: string; erreicht: Zielerreichung; bemerkung: string }[];
  ausgangslage: string;
  anlage: string;
  mittel: string;
  sicherheit: string;
  beobachter: string;
  verbindungen: string;
  besonderes: string;
  drehbuch: DrehbuchEintrag[];
  unterlagenLage: string;
  unterlagenAuftrag: string;
  unterlagenHinweise: string;
  besprechung: { datum: string; verlauf: string; positiv: string; verbessern: string; massnahmen: string };
}

export interface Uebung extends UebungData {
  id: number;
  wkId: number;
  blockId: number | null;
  title: string;
  createdBy: number;
  createdByName: string;
  updatedAt: string;
  attachmentCount?: number;
  /** The Drehbuch is withheld from those who are not part of the Übungsleitung. */
  drehbuchHidden?: boolean;
}
export type UebungInput = Omit<Uebung, 'id' | 'wkId' | 'createdBy' | 'createdByName' | 'updatedAt' | 'attachmentCount' | 'drehbuchHidden'>;

// ---- Tagesbefehl ----

/** What is added by hand; everything else comes from the planning of the day. */
export interface TagesbefehlData {
  tagesverantwortlicher: string;
  tenue: string;
  besonderes: string;
  sicherheit: string;
  erreichbarkeit: string;
}
export interface Tagesbefehl extends TagesbefehlData {
  wkId: number;
  date: string;
}

/** What a Zug does on a day: WK, Kadervorkurs, AVOR (with the Kp Kdo) or no service. */
export type Duty = 'WK' | 'KVK' | 'AVOR' | 'NONE';
export const DUTY_LABEL: Record<Duty, string> = { WK: 'WK', KVK: 'KVK', AVOR: 'AVOR', NONE: 'kein Dienst' };
