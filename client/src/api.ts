import type {
  Ausbildungsbefehl,
  Ausbildungsvorbereitung,
  Bataillon,
  AvInput,
  Block,
  BlockDetail,
  DetailInput,
  RequestInput,
  RequestStatus,
  Availability,
  Booking,
  Resource,
  ResourceInput,
  ResourceRequest,
  BlockInput,
  Comment,
  Kompanie,
  Location,
  LibraryEntry,
  Milestone,
  MyAusbildung,
  MilestoneInput,
  TemplateItem,
  TemplateScope,
  VorbereitungTemplate,
  ZugGroup,
  SessionUser,
  UserRow,
  Wk,
  WkKonzept,
  ZfhrProgramm,
  Zug,
  Strength,
  Participant,
  ParticipantInput,
  CheckIn,
  CheckInDay,
  CheckInInput,
  GruppeInput,
  HealthAnswer,
  HealthCheck,
  HealthStatus,
  PublicCheckIn,
  Erkundung,
  ErkundungInput,
  Uebung,
  UebungInput,
  Tagesbefehl,
  TagesbefehlData,
  Attachment,
  WkSync,
  StandardBlock,
  Rapport,
  RapportInput,
  RapportSchema,
  Pendenz,
  PendenzInput,
  Role,
} from '@shared/types';
import { DEMO } from './lib/base';

/** Raw upload with progress (fetch has none). Name and type travel in headers; the body is the file. */
function uploadFile(url: string, file: File, onProgress?: (p: number) => void) {
  // The demo answers fetch in the page; XMLHttpRequest would go to the network.
  if (DEMO) return demoUpload(url, file);
  return new Promise<{ id: number }>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    x.setRequestHeader('X-Mime', file.type || 'application/octet-stream');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(x.responseText);
      } catch {
        /* not JSON */
      }
      if (x.status >= 200 && x.status < 300) resolve(body);
      else reject(new ApiError(x.status, body?.error ?? (x.status === 413 ? 'Die Datei ist zu gross' : x.statusText), body));
    };
    x.onerror = () => reject(new ApiError(0, 'Hochladen fehlgeschlagen (Verbindung)', null));
    x.send(file);
  });
}

async function demoUpload(url: string, file: File) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name), 'X-Mime': file.type || 'application/octet-stream' },
    body: file,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText, body);
  return body as { id: number };
}

/** Demo account to switch to (top-right menu). */
export interface DemoAccount {
  email: string;
  name: string;
  role: Role;
  funktion: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: any,
  ) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const issue = data?.issues?.[0];
    const msg = issue ? `${data.error}: ${issue.path?.join('.') ?? ''} ${issue.message}` : (data?.error ?? res.statusText);
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export type WkSummary = Wk & { kpName: string; blockCount: number; openMilestones: number; overdueMilestones: number };
export interface WkDetail {
  wk: Wk;
  zuege: Zug[];
  locations: Location[];
  blocks: Block[];
  details: BlockDetail[];
  groups: ZugGroup[];
}
export interface Org {
  bataillon: Bataillon;
  kompanien: Kompanie[];
  zuege: Zug[];
  users: UserRow[];
}
export interface AdminBat extends Bataillon {
  source: TemplateScope;
  kompanien: (Kompanie & { source: TemplateScope })[];
}
const scopeQuery = (batId: number, kpId: number | null) => `batId=${batId}${kpId ? `&kpId=${kpId}` : ''}`;
type BlockPatch = Partial<BlockInput> & { version: number };

export const api = {
  login: (email: string, password: string) => req<SessionUser>('POST', '/auth/login', { email, password }),
  logout: () => req('POST', '/auth/logout'),
  me: () => req<SessionUser>('GET', '/auth/me'),
  demoAccounts: () => req<DemoAccount[]>('GET', '/auth/demo-accounts'),
  demoSwitch: (email: string) => req<SessionUser>('POST', '/auth/demo-switch', { email }),
  changePassword: (oldPassword: string, newPassword: string) => req('POST', '/auth/password', { oldPassword, newPassword }),
  changeEmail: (email: string, password: string) => req<SessionUser>('POST', '/auth/email', { email, password }),

  org: () => req<Org>('GET', '/org'),
  saveBatSettings: (id: number, s: Omit<Bataillon, 'id'>) => req<Bataillon>('PUT', `/bataillone/${id}/settings`, s),
  createKp: (name: string) => req<Kompanie>('POST', '/kompanien', { name }),
  updateKp: (id: number, name: string) => req<Kompanie>('PATCH', `/kompanien/${id}`, { name }),
  deleteKp: (id: number) => req('DELETE', `/kompanien/${id}`),
  createZug: (kpId: number, name: string) => req<Zug>('POST', '/zuege', { kpId, name }),
  saveGruppen: (zugId: number, items: GruppeInput[]) => req<Zug>('PUT', `/zuege/${zugId}/gruppen`, { items }),
  updateZug: (id: number, patch: Partial<Pick<Zug, 'name' | 'order' | 'zfhrUserId' | 'soll' | 'ist'>>) => req<Zug>('PATCH', `/zuege/${id}`, patch),
  deleteZug: (id: number) => req('DELETE', `/zuege/${id}`),
  createUser: (u: Omit<UserRow, 'id' | 'batId'> & { password: string }) => req<UserRow>('POST', '/users', u),
  updateUser: (id: number, u: Partial<UserRow> & { password?: string }) => req<UserRow>('PATCH', `/users/${id}`, u),
  deleteUser: (id: number) => req('DELETE', `/users/${id}`),

  wks: () => req<WkSummary[]>('GET', '/wks'),
  wk: (id: number) => req<WkDetail>('GET', `/wks/${id}`),
  createWk: (w: Pick<Wk, 'kpId' | 'title' | 'startDate' | 'endDate' | 'dayStart' | 'dayEnd' | 'snapMin'> & Partial<Pick<Wk, 'avorDays' | 'kvkDays'>>) =>
    req<Wk>('POST', '/wks', w),
  updateWk: (id: number, w: Partial<Wk>) => req<Wk>('PATCH', `/wks/${id}`, w),
  deleteWk: (id: number) => req('DELETE', `/wks/${id}`),
  archiveWk: (id: number, archived: boolean) => req<Wk>('POST', `/wks/${id}/archive`, { archived }),
  submit: (id: number) => req<Wk>('POST', `/wks/${id}/submit`),
  approve: (id: number, note: string) => req<Wk>('POST', `/wks/${id}/approve`, { note }),
  reject: (id: number, note: string) => req<Wk>('POST', `/wks/${id}/reject`, { note }),
  reopen: (id: number) => req<Wk>('POST', `/wks/${id}/reopen`),
  saveLocations: (id: number, list: { id?: number; nr: number; name: string; resourceId?: number | null }[]) => req<Location[]>('PUT', `/wks/${id}/locations`, list),
  copyFrom: (id: number, srcId: number) => req<{ created: number }>('POST', `/wks/${id}/copy-from/${srcId}`),

  createBlock: (wkId: number, b: BlockInput) => req<Block>('POST', `/wks/${wkId}/blocks`, b),
  createBlocks: (wkId: number, list: BlockInput[]) => req<Block[]>('POST', `/wks/${wkId}/blocks/bulk`, list),
  updateBlock: (wkId: number, id: number, patch: BlockPatch) => req<Block>('PATCH', `/wks/${wkId}/blocks/${id}`, patch),
  deleteBlock: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/blocks/${id}`),

  comments: (wkId: number) => req<Comment[]>('GET', `/wks/${wkId}/comments`),
  addComment: (wkId: number, text: string, blockId: number | null) => req<Comment>('POST', `/wks/${wkId}/comments`, { text, blockId }),
  deleteComment: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/comments/${id}`),

  avAttachments: (avId: number) => req<Attachment[]>('GET', `/avs/${avId}/attachments`),
  uploadAvAttachment: (avId: number, file: File, onProgress?: (p: number) => void) => uploadFile(`/api/avs/${avId}/attachments`, file, onProgress),
  copyAvAttachments: (avId: number, fromAvId: number) => req<{ copied: number }>('POST', `/avs/${avId}/attachments/copy`, { fromAvId }),
  zugFiles: (zugId: number) => req<Attachment[]>('GET', `/zuege/${zugId}/files`),
  uploadZugFile: (zugId: number, file: File, onProgress?: (p: number) => void) => uploadFile(`/api/zuege/${zugId}/files`, file, onProgress),
  attachmentUrl: (id: number) => `/api/attachments/${id}`,
  deleteAttachment: (id: number) => req('DELETE', `/attachments/${id}`),

  erkundungen: (wkId: number) => req<Erkundung[]>('GET', `/wks/${wkId}/erkundungen`),
  erkundung: (wkId: number, id: number) => req<Erkundung>('GET', `/wks/${wkId}/erkundungen/${id}`),
  createErkundung: (wkId: number, b: Partial<ErkundungInput> & { zugId: number | null; title: string }) => req<Erkundung>('POST', `/wks/${wkId}/erkundungen`, b),
  updateErkundung: (wkId: number, id: number, b: ErkundungInput) => req<Erkundung>('PUT', `/wks/${wkId}/erkundungen/${id}`, b),
  deleteErkundung: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/erkundungen/${id}`),
  erkundungAttachments: (id: number) => req<Attachment[]>('GET', `/erkundungen/${id}/attachments`),
  uploadErkundungAttachment: (id: number, file: File, onProgress?: (p: number) => void) => uploadFile(`/api/erkundungen/${id}/attachments`, file, onProgress),

  uebungen: (wkId: number) => req<Uebung[]>('GET', `/wks/${wkId}/uebungen`),
  uebung: (wkId: number, id: number) => req<Uebung>('GET', `/wks/${wkId}/uebungen/${id}`),
  createUebung: (wkId: number, b: Partial<UebungInput> & { title: string }) => req<Uebung>('POST', `/wks/${wkId}/uebungen`, b),
  updateUebung: (wkId: number, id: number, b: UebungInput) => req<Uebung>('PUT', `/wks/${wkId}/uebungen/${id}`, b),
  deleteUebung: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/uebungen/${id}`),
  uebungAttachments: (id: number) => req<Attachment[]>('GET', `/uebungen/${id}/attachments`),
  uploadUebungAttachment: (id: number, file: File, onProgress?: (p: number) => void) => uploadFile(`/api/uebungen/${id}/attachments`, file, onProgress),

  tagesbefehle: (wkId: number) => req<Tagesbefehl[]>('GET', `/wks/${wkId}/tagesbefehle`),
  saveTagesbefehl: (wkId: number, date: string, b: TagesbefehlData) => req<Tagesbefehl>('PUT', `/wks/${wkId}/tagesbefehle/${date}`, b),

  befehlYears: () => req<number[]>('GET', '/befehle'),
  befehl: (year: number) => req<Ausbildungsbefehl | null>('GET', `/befehle/${year}`),
  uploadBefehlFile: async (year: number, file: File) => {
    const res = await fetch(`/api/befehle/${year}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(file.name) },
      body: file,
    });
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? res.statusText, null);
    return res.json() as Promise<{ id: number; name: string; size: number }>;
  },
  befehlFileUrl: (year: number, id: number) => `/api/befehle/${year}/files/${id}`,
  deleteBefehlFile: (year: number, id: number) => req('DELETE', `/befehle/${year}/files/${id}`),
  saveBefehl: (year: number, b: Omit<Ausbildungsbefehl, 'id' | 'batId' | 'year'>) =>
    req<Ausbildungsbefehl & { wks: WkSync[] }>('PUT', `/befehle/${year}`, b),

  konzept: (wkId: number) => req<WkKonzept>('GET', `/wks/${wkId}/konzept`),
  saveKonzept: (wkId: number, k: Omit<WkKonzept, 'wkId'>) => req<WkKonzept>('PUT', `/wks/${wkId}/konzept`, k),

  zfhr: (wkId: number, zugId: number) => req<ZfhrProgramm>('GET', `/wks/${wkId}/zfhr/${zugId}`),
  saveZfhr: (wkId: number, zugId: number, p: Omit<ZfhrProgramm, 'wkId' | 'zugId'>) => req<ZfhrProgramm>('PUT', `/wks/${wkId}/zfhr/${zugId}`, p),

  saveGroups: (wkId: number, zugId: number, list: { id?: number; name: string }[]) =>
    req<ZugGroup[]>('PUT', `/wks/${wkId}/zuege/${zugId}/groups`, list),
  saveDetails: (wkId: number, blockId: number, zugId: number, list: DetailInput[]) =>
    req<BlockDetail[]>('PUT', `/wks/${wkId}/blocks/${blockId}/details/${zugId}`, list),

  library: () => req<LibraryEntry[]>('GET', '/library'),
  myAusbildungen: () => req<MyAusbildung[]>('GET', '/me/ausbildungen'),
  avs: (wkId: number) => req<Ausbildungsvorbereitung[]>('GET', `/wks/${wkId}/avs`),
  av: (wkId: number, id: number) => req<Ausbildungsvorbereitung>('GET', `/wks/${wkId}/avs/${id}`),
  createAv: (wkId: number, av: AvInput) => req<Ausbildungsvorbereitung>('POST', `/wks/${wkId}/avs`, av),
  updateAv: (wkId: number, id: number, av: AvInput) => req<Ausbildungsvorbereitung>('PUT', `/wks/${wkId}/avs/${id}`, av),
  deleteAv: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/avs/${id}`),

  resources: (kpId: number) => req<Resource[]>('GET', `/kompanien/${kpId}/resources`),
  batResources: (batId: number) => req<Resource[]>('GET', `/bataillone/${batId}/resources`),
  createResource: (batId: number, r: ResourceInput) => req<Resource>('POST', '/resources', { ...r, batId }),
  updateResource: (id: number, r: ResourceInput) => req<Resource>('PUT', `/resources/${id}`, r),
  availability: (wkId: number, q: { kind: string; category: string; date: string; startMin: number; endMin: number; exclude?: number }) =>
    req<Availability>(
      'GET',
      `/wks/${wkId}/availability?kind=${q.kind}&category=${encodeURIComponent(q.category)}&date=${q.date}&start=${q.startMin}&end=${q.endMin}&exclude=${q.exclude ?? -1}`,
    ),
  bookings: (wkId: number) => req<Booking[]>('GET', `/wks/${wkId}/bookings`),
  batBookings: (batId: number) => req<Booking[]>('GET', `/bataillone/${batId}/bookings`),
  deleteResource: (id: number) => req('DELETE', `/resources/${id}`),
  requests: (wkId: number) => req<ResourceRequest[]>('GET', `/wks/${wkId}/requests`),
  createRequest: (wkId: number, r: RequestInput) => req<ResourceRequest>('POST', `/wks/${wkId}/requests`, r),
  updateRequest: (wkId: number, id: number, r: RequestInput) => req<ResourceRequest>('PUT', `/wks/${wkId}/requests/${id}`, r),
  decideRequest: (wkId: number, id: number, status: RequestStatus, note: string, assignedIds?: number[]) =>
    req<ResourceRequest>('POST', `/wks/${wkId}/requests/${id}/decide`, { status, note, assignedIds }),
  deleteRequest: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/requests/${id}`),

  milestones: (wkId: number) => req<Milestone[]>('GET', `/wks/${wkId}/milestones`),
  tickMilestone: (wkId: number, id: number, done: boolean) => req<Milestone>('POST', `/wks/${wkId}/milestones/${id}/done`, { done }),
  addMilestone: (wkId: number, m: MilestoneInput) => req<Milestone>('POST', `/wks/${wkId}/milestones`, m),
  updateMilestone: (wkId: number, id: number, m: Partial<MilestoneInput>) => req<Milestone>('PATCH', `/wks/${wkId}/milestones/${id}`, m),
  deleteMilestone: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/milestones/${id}`),
  applyTemplate: (wkId: number) => req<{ added: number }>('POST', `/wks/${wkId}/milestones/apply-template`),

  strength: (wkId: number) => req<Strength[]>('GET', `/wks/${wkId}/strength`),
  saveStrength: (wkId: number, entries: Strength[]) => req('PUT', `/wks/${wkId}/strength`, { entries }),
  participants: (wkId: number) => req<Participant[]>('GET', `/wks/${wkId}/participants`),
  createParticipant: (wkId: number, p: ParticipantInput) => req<Participant>('POST', `/wks/${wkId}/participants`, p),
  updateParticipant: (wkId: number, id: number, p: ParticipantInput) => req<Participant>('PUT', `/wks/${wkId}/participants/${id}`, p),
  deleteParticipant: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/participants/${id}`),
  deleteParticipants: (wkId: number, ids: number[]) => req<{ deleted: number }>('POST', `/wks/${wkId}/participants/bulk-delete`, { ids }),
  bulkParticipants: (wkId: number, b: { ids: number[]; zugId?: number | null; days?: string[] }) =>
    req<{ updated: number }>('POST', `/wks/${wkId}/participants/bulk`, b),
  importParticipants: (wkId: number, mode: 'merge' | 'replace', items: ParticipantInput[]) =>
    req<{ added: number; updated: number; removed: number }>('POST', `/wks/${wkId}/participants/import`, { mode, items }),
  checkinDays: (wkId: number) => req<CheckInDay[]>('GET', `/wks/${wkId}/checkin-days`),
  updateCheckinDay: (wkId: number, date: string, b: { mode?: CheckInDay['mode']; renew?: boolean }) =>
    req<CheckInDay>('PUT', `/wks/${wkId}/checkin-days/${date}`, b),
  checkins: (wkId: number) => req<CheckIn[]>('GET', `/wks/${wkId}/checkins`),
  setPresence: (wkId: number, participantId: number, date: string, present: boolean) =>
    req('POST', `/wks/${wkId}/presence`, { participantId, date, present }),
  matchCheckin: (wkId: number, id: number, b: { participantId?: number | null; create?: ParticipantInput }) =>
    req<CheckIn>('POST', `/wks/${wkId}/checkins/${id}/match`, b),
  deleteCheckin: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/checkins/${id}`),
  publicCheckin: (token: string) => req<PublicCheckIn>('GET', `/public/checkin/${encodeURIComponent(token)}`),
  submitCheckin: (token: string, b: CheckInInput) =>
    req<{ matched: boolean; health: HealthStatus | null }>('POST', `/public/checkin/${encodeURIComponent(token)}`, b),
  health: (wkId: number) => req<HealthCheck[]>('GET', `/wks/${wkId}/health`),
  recordHealth: (wkId: number, b: HealthAnswer & { participantId: number }) => req<HealthCheck>('POST', `/wks/${wkId}/health`, b),
  updateHealth: (wkId: number, id: number, b: { status?: HealthStatus; restriction?: string }) => req<HealthCheck>('PUT', `/wks/${wkId}/health/${id}`, b),
  deleteHealth: (wkId: number, id: number) => req<{ ok: true }>('DELETE', `/wks/${wkId}/health/${id}`),

  standardBlocks: (kpId: number) => req<{ source: 'KP' | 'DEFAULT'; items: StandardBlock[] }>('GET', `/kompanien/${kpId}/standardbloecke`),
  saveStandardBlocks: (kpId: number, items: StandardBlock[]) =>
    req<{ source: 'KP' | 'DEFAULT'; items: StandardBlock[] }>('PUT', `/kompanien/${kpId}/standardbloecke`, items),
  rapporte: (wkId: number) => req<Rapport[]>('GET', `/wks/${wkId}/rapporte`),
  rapport: (wkId: number, id: number) => req<Rapport>('GET', `/wks/${wkId}/rapporte/${id}`),
  createRapport: (
    wkId: number,
    b: { zugId: number | null; schema?: RapportSchema; title?: string; date?: string; startMin?: number | null; ort?: string; blockId?: number | null; fromRapportId?: number },
  ) => req<Rapport>('POST', `/wks/${wkId}/rapporte`, b),
  updateRapport: (wkId: number, id: number, b: RapportInput) => req<Rapport>('PUT', `/wks/${wkId}/rapporte/${id}`, b),
  deleteRapport: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/rapporte/${id}`),
  pendenzen: (wkId: number) => req<Pendenz[]>('GET', `/wks/${wkId}/pendenzen`),
  createPendenz: (wkId: number, p: PendenzInput) => req<Pendenz>('POST', `/wks/${wkId}/pendenzen`, p),
  updatePendenz: (wkId: number, id: number, p: Partial<PendenzInput>) => req<Pendenz>('PUT', `/wks/${wkId}/pendenzen/${id}`, p),
  tickPendenz: (wkId: number, id: number, done: boolean) => req<Pendenz>('POST', `/wks/${wkId}/pendenzen/${id}/done`, { done }),
  deletePendenz: (wkId: number, id: number) => req('DELETE', `/wks/${wkId}/pendenzen/${id}`),

  adminOrg: () => req<AdminBat[]>('GET', '/admin/org'),
  template: (batId: number, kpId: number | null) => req<VorbereitungTemplate>('GET', `/templates?${scopeQuery(batId, kpId)}`),
  saveTemplate: (batId: number, kpId: number | null, items: TemplateItem[]) =>
    req<VorbereitungTemplate>('PUT', `/templates?${scopeQuery(batId, kpId)}`, items),
  deleteTemplate: (batId: number, kpId: number | null) => req<VorbereitungTemplate>('DELETE', `/templates?${scopeQuery(batId, kpId)}`),
};
