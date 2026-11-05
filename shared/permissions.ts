// Single source of truth for what each role may do.
// The server enforces these rules; the client uses them to show or hide controls.

import type { Ausbildungsvorbereitung, Block, BlockInput, Milestone, ResourceRequest, Role, SessionUser, Wk } from './types';
import { KDO_ID } from './types';
import { servesOnDay } from './util';

type WkRef = Pick<Wk, 'kpId' | 'batId' | 'status'> & { archived?: boolean };
type BlockRef = Pick<Block, 'zugIds' | 'locked' | 'source'>;

const ownKp = (u: SessionUser, wk: WkRef) => u.kpId !== null && u.kpId === wk.kpId;
const ownBat = (u: SessionUser, wk: WkRef) => u.batId === wk.batId;

/**
 * Zugführer/in of the Zug. Every Zfhr assigned to a Zug counts (the second one acts as Zfhr Stv);
 * a Log Of assigned to a Zug (usually the Log Z) has the same rights for it.
 */
export const isZfhrOf = (u: SessionUser, zugId: number) =>
  (u.role === 'ZFHR' || u.role === 'LOGOF') && zugId !== KDO_ID && u.zugId === zugId;

/** The Arbeitsprogramm can only be changed by the Kp while it is a draft or was sent back (and not archived). */
export const apEditable = (wk: WkRef) => !wk.archived && (wk.status === 'ENTWURF' || wk.status === 'ZURUECKGEWIESEN');
export const apFrozen = (wk: WkRef) => wk.status === 'FREIGEGEBEN';

// ---- Organisation & users ----

export const canManageOrg = (u: SessionUser) => u.role === 'BAT';

export const canCreateWk = (u: SessionUser) => u.role === 'BAT';

/** Archiving, restoring and deleting WKs: Bat Kdo. */
export const canArchiveWk = (u: SessionUser, wk: Pick<Wk, 'batId'>) => u.role === 'BAT' && u.batId === wk.batId;

/** Jahresplanung (AVOR, KVK and WK days of all Kompanien): planned by the Bat Kdo, seen by the Kp command and the Zfhr. */
export const canPlanYear = (u: SessionUser) => u.role === 'BAT';
export const canViewYearPlan = (u: SessionUser) => u.role === 'BAT' || u.role === 'KPKDT' || u.role === 'LOGOF' || u.role === 'ZFHR';

export function canManageUser(u: SessionUser, target: { role: Role; kpId: number | null; batId: number }) {
  if (target.role === 'ADMIN' || u.role === 'ADMIN') return u.role === 'ADMIN';
  if (target.batId !== u.batId) return false;
  if (u.role === 'BAT') return true;
  if (u.role === 'KPKDT') {
    return (target.role === 'ZFHR' || target.role === 'KADER' || target.role === 'LOGOF') && target.kpId === u.kpId;
  }
  return false;
}

export const canEditZugAssignment = (u: SessionUser, kpId: number) =>
  u.role === 'BAT' || (u.role === 'KPKDT' && u.kpId === kpId);

// ---- WK visibility ----

export function canViewWk(u: SessionUser, wk: WkRef) {
  if (u.role === 'BAT') return ownBat(u, wk);
  return ownKp(u, wk);
}

export const canComment = canViewWk;

// ---- Ausbildungsbefehl (Bat) ----

export const canEditBefehl = (u: SessionUser) => u.role === 'BAT';
export const canViewBefehl = (u: SessionUser) => u.role !== 'KADER' && u.role !== 'ADMIN';
/** Bat sees all Aufträge; Kp Kdt and Zfhr only the Auftrag of their own Kp. */
export const canViewAuftrag = (u: SessionUser, kpId: number) =>
  u.role === 'BAT' || ((u.role === 'KPKDT' || u.role === 'ZFHR' || u.role === 'LOGOF') && u.kpId === kpId);

// ---- WK-Konzept (Kp) ----

export const canEditKonzept = (u: SessionUser, wk: WkRef) =>
  u.role === 'KPKDT' && ownKp(u, wk) && !apFrozen(wk);

// ---- Arbeitsprogramm ----

/** WK settings and the location legend. */
export const canEditApStructure = (u: SessionUser, wk: WkRef) =>
  u.role === 'KPKDT' && ownKp(u, wk) && apEditable(wk);

/** May the user create a block with these properties? */
export function canCreateBlock(u: SessionUser, wk: WkRef, b: Pick<BlockInput, 'zugIds' | 'locked'> & { source: Block['source'] }) {
  if (!canViewWk(u, wk)) return false;
  switch (u.role) {
    case 'BAT':
      // Bat places its own fixed events (e.g. Besuch Bat Kdt); they are always locked.
      return b.source === 'BAT' && b.locked && !apFrozen(wk);
    case 'KPKDT':
      return b.source === 'KP' && apEditable(wk);
    default:
      return (
        b.source === 'KP' &&
        apEditable(wk) &&
        !b.locked &&
        b.zugIds.length === 1 &&
        isZfhrOf(u, b.zugIds[0])
      );
  }
}

/** May the user change or delete this existing block? */
export function canEditBlock(u: SessionUser, wk: WkRef, b: BlockRef) {
  if (!canViewWk(u, wk)) return false;
  switch (u.role) {
    case 'BAT':
      return b.source === 'BAT' && !apFrozen(wk);
    case 'KPKDT':
      return b.source === 'KP' && apEditable(wk);
    default:
      return (
        b.source === 'KP' &&
        apEditable(wk) &&
        !b.locked &&
        b.zugIds.length === 1 &&
        isZfhrOf(u, b.zugIds[0])
      );
  }
}

/** An update is allowed if the user may edit the old block and may create the new one. */
export const canUpdateBlock = (u: SessionUser, wk: WkRef, before: BlockRef, after: BlockRef) =>
  canEditBlock(u, wk, before) && canCreateBlock(u, wk, after);

/** Only the Kp Kdt may span several Züge, lock blocks or change the Zug of a block. */
export const canSpanZuege = (u: SessionUser) => u.role === 'KPKDT' || u.role === 'BAT';
export const canLockBlocks = (u: SessionUser) => u.role === 'KPKDT';

// ---- Status workflow ----

export const canSubmit = (u: SessionUser, wk: WkRef) => u.role === 'KPKDT' && ownKp(u, wk) && apEditable(wk);
export const canReview = (u: SessionUser, wk: WkRef) => u.role === 'BAT' && ownBat(u, wk) && wk.status === 'EINGEREICHT';
export const canReopen = (u: SessionUser, wk: WkRef) =>
  u.role === 'KPKDT' && ownKp(u, wk) && (wk.status === 'FREIGEGEBEN' || wk.status === 'EINGEREICHT');

// ---- Zugführerarbeitsprogramm ----

export function canViewZfhr(u: SessionUser, wk: WkRef, zugId: number) {
  if (!canViewWk(u, wk)) return false;
  if (u.role === 'KADER') return u.zugId === zugId;
  return true;
}
export const canEditZfhr = (u: SessionUser, wk: WkRef, zugId: number) => ownKp(u, wk) && isZfhrOf(u, zugId);

// ---- Milestones (Vorbereitungs-Zeitplan) ----

/** Everyone sees the Vorbereitung of their own role; Bat and Kp Kdt see all items with everybody's progress. */
export const canViewMilestones = canViewWk;
export const canSeeAllMilestones = (u: SessionUser) => u.role === 'BAT' || u.role === 'KPKDT';
export const canEditMilestones = (u: SessionUser, wk: WkRef) => u.role === 'KPKDT' && ownKp(u, wk);
/** Each person ticks off the items of their own role. */
export const canTickMilestone = (u: SessionUser, wk: WkRef, m: Pick<Milestone, 'ownerRole'>) => canViewWk(u, wk) && u.role === m.ownerRole;

// ---- Vorbereitung templates (Org Admin) ----

/** Organisation settings (templates, catalogues): the Org Admin everywhere, the Bat Kdo for the own Bataillon. */
export const canAdministrate = (u: SessionUser, batId: number) => u.role === 'ADMIN' || (u.role === 'BAT' && u.batId === batId);
export const canEditTemplates = canAdministrate;
export const canViewTemplate = (u: SessionUser, batId: number, kpId: number | null) =>
  canAdministrate(u, batId) || (u.batId === batId && u.role === 'KPKDT' && kpId !== null && u.kpId === kpId);

// ---- Zugansicht and Detailplanung ----

/** Zfhr and Kader only see their own Zug in the Zugansicht; command roles may pick any Zug. */
export function canViewZug(u: SessionUser, wk: WkRef, zugId: number) {
  if (!canViewWk(u, wk)) return false;
  if (u.role === 'KADER') return u.zugId === zugId;
  return true;
}

/** Detail planning inside the Grobprogramm slots; continues after the Grobprogramm is approved. */
export const canEditDetails = (u: SessionUser, wk: WkRef, zugId: number) =>
  ownKp(u, wk) && (isZfhrOf(u, zugId) || u.role === 'KPKDT');

// ---- Ausbildungsvorbereitung ----

export const canViewAv = (u: SessionUser, wk: WkRef, av: Pick<Ausbildungsvorbereitung, 'zugId'>) => canViewZug(u, wk, av.zugId);

export const canCreateAv = (u: SessionUser, wk: WkRef, zugId: number) =>
  ownKp(u, wk) && zugId !== KDO_ID && (isZfhrOf(u, zugId) || (u.role === 'KADER' && u.zugId === zugId));

/** Zfhr edit all of their Zug; Kader the ones they wrote or are assigned to. */
export const canEditAv = (u: SessionUser, wk: WkRef, av: Pick<Ausbildungsvorbereitung, 'zugId' | 'createdBy' | 'leiterUserIds'>) =>
  ownKp(u, wk) &&
  (isZfhrOf(u, av.zugId) || (u.role === 'KADER' && u.zugId === av.zugId && (av.createdBy === u.id || av.leiterUserIds.includes(u.id))));

/** Every member of a Bataillon may read (and reuse) all its Ausbildungsvorbereitungen in the library. */
export const canViewLibrary = (u: SessionUser) => u.role !== 'ADMIN';

// ---- Resources (Fahrzeuge, Räume, Gelände) ----

/**
 * Catalogue of vehicles, rooms and terrain. Material of the Bataillon (kpId null) is managed by the Org Admin and
 * the Bat Kdo; material of a Kp additionally by its Kp Kdt and Log Of.
 */
export const canManageResources = (u: SessionUser, r: { kpId: number | null; batId: number }) =>
  canAdministrate(u, r.batId) || (r.kpId !== null && (u.role === 'KPKDT' || u.role === 'LOGOF') && u.kpId === r.kpId);

export const canViewRequests = (u: SessionUser, wk: WkRef) => canViewWk(u, wk);

export const canRequestResource = (u: SessionUser, wk: WkRef, zugId: number) =>
  ownKp(u, wk) && (isZfhrOf(u, zugId) || u.role === 'KPKDT' || u.role === 'LOGOF');

/** Requests are approved within the Kp by the Kp Kdt or the Log Of. */
export const canDecideRequest = (u: SessionUser, wk: WkRef) => (u.role === 'KPKDT' || u.role === 'LOGOF') && ownKp(u, wk);

/** The requester may change or withdraw a pending request; the approvers always. */
export const canEditRequest = (u: SessionUser, wk: WkRef, r: Pick<ResourceRequest, 'requestedBy' | 'status' | 'zugId'>) =>
  canDecideRequest(u, wk) || (r.status === 'BEANTRAGT' && r.requestedBy === u.id && canRequestResource(u, wk, r.zugId));

// ---- Personal: Sollbestand, Teilnehmerliste, Präsenz ----

/** Bat, Kp Kdt, Log Of and Zfhr see the participant list and presence; Kader do not. */
export const canViewPersonnel = (u: SessionUser, wk: WkRef) =>
  canViewWk(u, wk) && (u.role === 'BAT' || u.role === 'KPKDT' || u.role === 'LOGOF' || u.role === 'ZFHR');

/** Import of the participant list, QR codes and manual matching: Kp Kdt. */
export const canManagePersonnel = (u: SessionUser, wk: WkRef) => u.role === 'KPKDT' && ownKp(u, wk);

/** Planned headcount: Kp Kdt for all, Zfhr for the own Zug. */
export const canEditStrength = (u: SessionUser, wk: WkRef, zugId: number) =>
  ownKp(u, wk) && (u.role === 'KPKDT' || isZfhrOf(u, zugId));

/** Marking someone present by hand: Kp Kdt, or Zfhr for people of the own Zug. */
export const canMarkPresent = (u: SessionUser, wk: WkRef, zugId: number | null) =>
  canManagePersonnel(u, wk) || (ownKp(u, wk) && zugId !== null && isZfhrOf(u, zugId));

/**
 * Sanitarische Eintrittsbefragung: the answers are health data, seen and handled by the Kp Kdt (Leiter der Schutzdienstleistung)
 * only; Zugführer see the restrictions of their people (Art. 6 Abs. 3).
 */
export const canHandleHealth = (u: SessionUser, wk: WkRef) => canManagePersonnel(u, wk);

// ---- Rapporte und Pendenzen ----

type RapportRef = { zugId: number | null; createdBy: number; leitungUserId: number | null; protokollUserId: number | null };

/** Kp Rapporte are seen by everyone of the Kp (and the Bat); Zug Rapporte by the Zug and the Kp command. */
export const canViewRapport = (u: SessionUser, wk: WkRef, r: { zugId: number | null }) =>
  canViewWk(u, wk) && (r.zugId === null || u.role === 'BAT' || u.role === 'KPKDT' || u.role === 'LOGOF' || u.zugId === r.zugId);

/** Kp Kdt holds Kp Rapporte; Zugführer/in Rapporte of the own Zug. */
export const canCreateRapport = (u: SessionUser, wk: WkRef, zugId: number | null) =>
  ownKp(u, wk) && (u.role === 'KPKDT' || (zugId !== null && isZfhrOf(u, zugId)));

/** Besides the Kp Kdt: who created it, leads it or keeps the minutes, and the Zfhr of the Zug. */
export const canEditRapport = (u: SessionUser, wk: WkRef, r: RapportRef) =>
  ownKp(u, wk) &&
  (u.role === 'KPKDT' ||
    r.createdBy === u.id ||
    r.leitungUserId === u.id ||
    r.protokollUserId === u.id ||
    (r.zugId !== null && isZfhrOf(u, r.zugId)));

/** The responsible person ticks off, as well as those who may edit the Pendenz. */
export const canTickPendenz = (u: SessionUser, wk: WkRef, p: { responsibleUserId: number | null }, canEdit: boolean) =>
  canEdit || (ownKp(u, wk) && p.responsibleUserId === u.id);

// ---- Standardblöcke ----

/** The standard blocks of a Kp: its Kp Kdt, and the Bat Kommando / Org Admin. */
export const canEditStandardBlocks = (u: SessionUser, kp: { id: number; batId: number }) =>
  canAdministrate(u, kp.batId) || (u.role === 'KPKDT' && u.kpId === kp.id);

// ---- Anhänge und Dateien ----

/** Attachments of an Ausbildungsvorbereitung: read like the document (also from the Bibliothek), changed by its editors. */
export const canViewAvFiles = (u: SessionUser, wk: WkRef, av: Pick<Ausbildungsvorbereitung, 'zugId'>) =>
  canViewAv(u, wk, av) || (canViewLibrary(u) && u.batId === wk.batId);

type ZugRef = { id: number; kpId: number; batId: number };

/** File area of a Zug: the Kp (Kader only their own Zug) and the Bat Kommando. */
export const canViewZugFiles = (u: SessionUser, z: ZugRef) =>
  (u.role === 'BAT' && u.batId === z.batId) || (u.kpId === z.kpId && (u.role !== 'KADER' || u.zugId === z.id));

/** Members of the Zug and the Kp command share files. */
export const canUploadZugFiles = (u: SessionUser, z: ZugRef) =>
  u.kpId === z.kpId && (u.role === 'KPKDT' || u.role === 'LOGOF' || u.zugId === z.id);

/** Who uploaded it, the Zugführer and the Kp Kdt. */
export const canDeleteZugFile = (u: SessionUser, z: ZugRef, uploadedBy: number | null) =>
  canUploadZugFiles(u, z) && (uploadedBy === u.id || u.role === 'KPKDT' || isZfhrOf(u, z.id));

// ---- Erkundung, Übungen, Tagesbefehl ----

/** Erkundungen of the Kp (zugId null) are seen by the whole Kp; those of a Zug like the Zug. */
export const canViewErkundung = (u: SessionUser, wk: WkRef, e: { zugId: number | null }) =>
  canViewWk(u, wk) && (e.zugId === null || canViewZug(u, wk, e.zugId));

/** Bat Kommando of the Kompanie's Bataillon. */
const batOf = (u: SessionUser, wk: WkRef) => u.role === 'BAT' && ownBat(u, wk);

/** Bat Kdo and Kp Kdt (for the Kp and every Zug); Zugführer and Kader for their own Zug. */
export const canCreateErkundung = (u: SessionUser, wk: WkRef, zugId: number | null) =>
  batOf(u, wk) ||
  (ownKp(u, wk) && (u.role === 'KPKDT' || (zugId !== null && (isZfhrOf(u, zugId) || (u.role === 'KADER' && u.zugId === zugId)))));

export const canEditErkundung = (u: SessionUser, wk: WkRef, e: { zugId: number | null; createdBy: number }) =>
  batOf(u, wk) || (ownKp(u, wk) && (u.role === 'KPKDT' || e.createdBy === u.id || (e.zugId !== null && isZfhrOf(u, e.zugId))));

/** Übungen are prepared by the Bat Kdo, the Kp Kdt and the Zugführer. */
export const canCreateUebung = (u: SessionUser, wk: WkRef) =>
  batOf(u, wk) || (ownKp(u, wk) && (u.role === 'KPKDT' || ((u.role === 'ZFHR' || u.role === 'LOGOF') && u.zugId !== null)));

/** Übungsleitung: who created it, the people assigned to the Leitung, Kp Kdt and Bat Kdo. They also see the Drehbuch. */
export const canEditUebung = (u: SessionUser, wk: WkRef, x: { createdBy: number; leitungUserIds: number[] }) =>
  batOf(u, wk) || (ownKp(u, wk) && (u.role === 'KPKDT' || x.createdBy === u.id || x.leitungUserIds.includes(u.id)));

/** Tagesbefehl: Kp Kdt and higher (Bat Kommando). */
export const canViewTagesbefehl = (u: SessionUser, wk: WkRef) => (u.role === 'KPKDT' && ownKp(u, wk)) || batOf(u, wk);
export const canEditTagesbefehl = (u: SessionUser, wk: WkRef) => u.role === 'KPKDT' && ownKp(u, wk);

/** AVOR days are for the Kp command; Zugführer and Kader see them only when their Zug takes part. */
export const canSeeDay = (u: SessionUser, wk: Pick<Wk, 'avorDays' | 'startDate' | 'endDate'> & Partial<Pick<Wk, 'kvkDays' | 'dayDuty'>>, date: string) =>
  !wk.avorDays.includes(date) || (u.role !== 'ZFHR' && u.role !== 'KADER') || (u.zugId !== null && servesOnDay(wk, date, u.zugId));

/**
 * Pendenz outside a Rapport for a person: for oneself, and for subordinates – Bat Kdo for the Kp of the WK,
 * Kp Kdt for the Kp, Zugführer/Log Of for their Zug.
 */
export function canAssignPendenz(u: SessionUser, wk: WkRef, target: { id: number; kpId: number | null; zugId: number | null }) {
  if (!(ownKp(u, wk) || batOf(u, wk))) return false;
  if (target.id === u.id) return true;
  if (target.kpId !== wk.kpId) return false;
  if (batOf(u, wk) || u.role === 'KPKDT') return true;
  return (u.role === 'ZFHR' || u.role === 'LOGOF') && u.zugId !== null && target.zugId === u.zugId;
}
