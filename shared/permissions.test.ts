import { describe, expect, it } from 'vitest';
import * as P from './permissions';
import type { Role, SessionUser, Wk } from './types';

const mk = (role: Role, kpId: number | null = 1, zugId: number | null = null): SessionUser => ({
  id: 1,
  name: role,
  email: `${role}@x`,
  role,
  batId: 1,
  kpId: role === 'BAT' ? null : kpId,
  zugId,
});

const bat = mk('BAT');
const kdt = mk('KPKDT');
const zfhr = mk('ZFHR', 1, 10);
const kader = mk('KADER', 1, 10);
const foreignKdt = mk('KPKDT', 2);

const wk = (status: Wk['status'] = 'ENTWURF') => ({ kpId: 1, batId: 1, status });
const kpBlock = (zugIds = [10], locked = false) => ({ zugIds, locked, source: 'KP' as const });
const batBlock = { zugIds: [10, 11], locked: true, source: 'BAT' as const };

describe('WK visibility', () => {
  it('Bat sees all WKs of its Bat, others only their own Kp', () => {
    expect(P.canViewWk(bat, wk())).toBe(true);
    expect(P.canViewWk(kdt, wk())).toBe(true);
    expect(P.canViewWk(kader, wk())).toBe(true);
    expect(P.canViewWk(foreignKdt, wk())).toBe(false);
    expect(P.canViewWk(bat, { ...wk(), batId: 2 })).toBe(false);
  });
});

describe('Arbeitsprogramm blocks', () => {
  it('Kp Kdt edits any Kp block while draft or sent back', () => {
    expect(P.canEditBlock(kdt, wk(), kpBlock([10, 11], true))).toBe(true);
    expect(P.canEditBlock(kdt, wk('ZURUECKGEWIESEN'), kpBlock())).toBe(true);
    expect(P.canEditBlock(kdt, wk('EINGEREICHT'), kpBlock())).toBe(false);
    expect(P.canEditBlock(kdt, wk('FREIGEGEBEN'), kpBlock())).toBe(false);
  });

  it('Kp Kdt cannot touch Bat events', () => {
    expect(P.canEditBlock(kdt, wk(), batBlock)).toBe(false);
  });

  it('Zfhr only edits unlocked single-Zug blocks of the own Zug', () => {
    expect(P.canEditBlock(zfhr, wk(), kpBlock([10]))).toBe(true);
    expect(P.canEditBlock(zfhr, wk(), kpBlock([11]))).toBe(false);
    expect(P.canEditBlock(zfhr, wk(), kpBlock([10], true))).toBe(false);
    expect(P.canEditBlock(zfhr, wk(), kpBlock([10, 11]))).toBe(false);
    expect(P.canEditBlock(zfhr, wk('EINGEREICHT'), kpBlock([10]))).toBe(false);
  });

  it('Zfhr cannot move a block into another Zug or lock it', () => {
    expect(P.canUpdateBlock(zfhr, wk(), kpBlock([10]), kpBlock([11]))).toBe(false);
    expect(P.canUpdateBlock(zfhr, wk(), kpBlock([10]), kpBlock([10], true))).toBe(false);
    expect(P.canUpdateBlock(zfhr, wk(), kpBlock([10]), kpBlock([10]))).toBe(true);
  });

  it('Kader is read-only', () => {
    expect(P.canEditBlock(kader, wk(), kpBlock([10]))).toBe(false);
    expect(P.canCreateBlock(kader, wk(), { ...kpBlock([10]) })).toBe(false);
  });

  it('Bat only places locked Bat events, also while submitted, never when frozen', () => {
    expect(P.canCreateBlock(bat, wk(), batBlock)).toBe(true);
    expect(P.canCreateBlock(bat, wk('EINGEREICHT'), batBlock)).toBe(true);
    expect(P.canCreateBlock(bat, wk('FREIGEGEBEN'), batBlock)).toBe(false);
    expect(P.canCreateBlock(bat, wk(), { ...batBlock, locked: false })).toBe(false);
    expect(P.canEditBlock(bat, wk(), kpBlock())).toBe(false);
  });
});

describe('Status workflow', () => {
  it('Kp Kdt submits, Bat reviews, Kp Kdt reopens', () => {
    expect(P.canSubmit(kdt, wk())).toBe(true);
    expect(P.canSubmit(zfhr, wk())).toBe(false);
    expect(P.canSubmit(bat, wk())).toBe(false);
    expect(P.canReview(bat, wk('EINGEREICHT'))).toBe(true);
    expect(P.canReview(bat, wk())).toBe(false);
    expect(P.canReview(kdt, wk('EINGEREICHT'))).toBe(false);
    expect(P.canReopen(kdt, wk('FREIGEGEBEN'))).toBe(true);
    expect(P.canReopen(kdt, wk())).toBe(false);
  });
});

describe('Documents', () => {
  it('Befehl: Bat edits, Kader cannot see', () => {
    expect(P.canEditBefehl(bat)).toBe(true);
    expect(P.canEditBefehl(kdt)).toBe(false);
    expect(P.canViewBefehl(kader)).toBe(false);
    expect(P.canViewAuftrag(kdt, 1)).toBe(true);
    expect(P.canViewAuftrag(kdt, 2)).toBe(false);
  });

  it('Konzept: only own Kp Kdt edits, not when frozen', () => {
    expect(P.canEditKonzept(kdt, wk())).toBe(true);
    expect(P.canEditKonzept(kdt, wk('FREIGEGEBEN'))).toBe(false);
    expect(P.canEditKonzept(bat, wk())).toBe(false);
    expect(P.canEditKonzept(zfhr, wk())).toBe(false);
  });

  it('Zfhr-AP: Zfhr edits own Zug; Kader reads only own Zug', () => {
    expect(P.canEditZfhr(zfhr, wk(), 10)).toBe(true);
    expect(P.canEditZfhr(zfhr, wk(), 11)).toBe(false);
    expect(P.canEditZfhr(kdt, wk(), 10)).toBe(false);
    expect(P.canViewZfhr(kader, wk(), 10)).toBe(true);
    expect(P.canViewZfhr(kader, wk(), 11)).toBe(false);
  });

  it('Vorbereitung: every role ticks its own items; Kp Kdt edits the list', () => {
    expect(P.canEditMilestones(kdt, wk())).toBe(true);
    expect(P.canEditMilestones(zfhr, wk())).toBe(false);
    expect(P.canTickMilestone(zfhr, wk(), { ownerRole: 'ZFHR' })).toBe(true);
    expect(P.canTickMilestone(zfhr, wk(), { ownerRole: 'KPKDT' })).toBe(false);
    expect(P.canTickMilestone(kdt, wk(), { ownerRole: 'ZFHR' })).toBe(false);
    expect(P.canTickMilestone(kader, wk(), { ownerRole: 'KADER' })).toBe(true);
    expect(P.canViewMilestones(kader, wk())).toBe(true);
    expect(P.canSeeAllMilestones(kader)).toBe(false);
    expect(P.canSeeAllMilestones(kdt)).toBe(true);
  });

  it('Org Admin and Bat Kdo configure templates and catalogues; Org Admin sees no WKs', () => {
    const admin = mk('ADMIN', null);
    expect(P.canEditTemplates(admin, 1)).toBe(true);
    expect(P.canEditTemplates(admin, 2)).toBe(true);
    expect(P.canEditTemplates(bat, 1)).toBe(true);
    expect(P.canEditTemplates(bat, 2)).toBe(false);
    expect(P.canEditTemplates(kdt, 1)).toBe(false);
    expect(P.canManageResources(admin, { kpId: 5, batId: 3 })).toBe(true);
    expect(P.canManageResources(bat, { kpId: 5, batId: 1 })).toBe(true);
    expect(P.canManageResources(kdt, { kpId: 1, batId: 1 })).toBe(true);
    expect(P.canManageResources(kdt, { kpId: 2, batId: 1 })).toBe(false);
    expect(P.canDecideRequest(bat, wk())).toBe(false);
    expect(P.canViewWk(admin, wk())).toBe(false);
    expect(P.canViewTemplate(kdt, 1, 1)).toBe(true);
    expect(P.canViewTemplate(kdt, 1, 2)).toBe(false);
    expect(P.canManageUser(bat, { role: 'ADMIN', kpId: null, batId: 1 })).toBe(false);
  });

  it('User management', () => {
    expect(P.canManageUser(bat, { role: 'KPKDT', kpId: 2, batId: 1 })).toBe(true);
    expect(P.canManageUser(kdt, { role: 'ZFHR', kpId: 1, batId: 1 })).toBe(true);
    expect(P.canManageUser(kdt, { role: 'ZFHR', kpId: 2, batId: 1 })).toBe(false);
    expect(P.canManageUser(kdt, { role: 'KPKDT', kpId: 1, batId: 1 })).toBe(false);
    expect(P.canManageUser(zfhr, { role: 'KADER', kpId: 1, batId: 1 })).toBe(false);
  });
});
