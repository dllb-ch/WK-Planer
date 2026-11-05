import { describe, expect, it } from 'vitest';
import { applyDuty, normalizeDayDuty, partDutyOf as rankDutyOf, rankDefault, wkForDay } from './ranks';
import { dutyOf, wkDays } from './util';

const wk = { startDate: '2027-04-27', endDate: '2027-04-30', avorDays: ['2027-04-23'], kvkDays: ['2027-04-26'], dayDuty: {} };
const Z = [{ id: 1, gruppen: [] }, { id: 2, gruppen: [] }];

describe('duty per rank', () => {
  it('follows the usual rule: WK all, KVK Zugführer and Kader, AVOR Zugführer', () => {
    expect(['zfhr', 'kader', 'sdt'].map((r) => rankDefault('KVK', r as any))).toEqual(['KVK', 'KVK', 'NONE']);
    expect(['zfhr', 'kader', 'sdt'].map((r) => rankDefault('AVOR', r as any))).toEqual(['AVOR', 'NONE', 'NONE']);
    expect(rankDutyOf(wk, '2027-04-28', 1, 'sdt')).toBe('WK');
    expect(rankDutyOf(wk, '2027-04-26', 1, 'sdt')).toBe('NONE');
  });

  it('a rank planned on its own: the Zug serves as its highest rank, the others keep their duty', () => {
    // Zugführer of Zug 1 already on the AVOR day.
    const a = applyDuty(wk, [{ date: '2027-04-23', zugId: 1, part: 'zfhr' }], 'AVOR', Z);
    expect(dutyOf(a, '2027-04-23', 1)).toBe('AVOR');
    expect(rankDutyOf(a, '2027-04-23', 1, 'kader')).toBe('NONE');
    expect(dutyOf(a, '2027-04-23', 2)).toBe('NONE');
    // Soldaten of Zug 2 not on the first WK day: the Zug still has WK (Kader and Zugführer).
    const b = applyDuty(a, [{ date: '2027-04-27', zugId: 2, part: 'sdt' }], 'NONE', Z);
    expect(dutyOf(b, '2027-04-27', 2)).toBe('WK');
    expect(rankDutyOf(b, '2027-04-27', 2, 'sdt')).toBe('NONE');
    expect(b.dayDuty['2027-04-27']).toEqual({ '2.sdt': 'NONE' });
  });

  it('days outside the WK become AVOR or KVK days, or extend the period; others do not serve there', () => {
    const k = applyDuty(wk, [{ date: '2027-04-19', zugId: 1, part: null }], 'KVK', Z);
    expect(k.kvkDays).toEqual(['2027-04-19', '2027-04-26']);
    expect(dutyOf(k, '2027-04-19', 1)).toBe('KVK');
    expect(dutyOf(k, '2027-04-19', 2)).toBe('NONE');
    const w = applyDuty(wk, [{ date: '2027-05-01', zugId: 2, part: null }], 'WK', Z);
    expect(w.endDate).toBe('2027-05-01');
    expect(dutyOf(w, '2027-05-01', 1)).toBe('NONE');
    expect(dutyOf(w, '2027-05-01', 2)).toBe('WK');
  });

  it('a new day for one rank only: the other ranks of that Zug do not serve', () => {
    const z = applyDuty(wk, [{ date: '2027-04-22', zugId: 1, part: 'zfhr' }], 'KVK', Z);
    expect(z.kvkDays).toContain('2027-04-22');
    expect(['zfhr', 'kader', 'sdt'].map((r) => rankDutyOf(z, '2027-04-22', 1, r as any))).toEqual(['KVK', 'NONE', 'NONE']);
    expect(dutyOf(z, '2027-04-22', 1)).toBe('KVK');
    expect(dutyOf(z, '2027-04-22', 2)).toBe('NONE');
  });

  it('a KVK day nobody attends any more is removed', () => {
    const n = applyDuty(wk, Z.map((z) => ({ date: '2027-04-26', zugId: z.id, part: null })), 'NONE', Z);
    expect(n.kvkDays).toEqual([]);
    expect(wkDays(n)).not.toContain('2027-04-26');
  });

  it('normalising keeps only differences and drops unknown Züge and days', () => {
    expect(
      normalizeDayDuty(wk, { '2027-04-28': { '1': 'WK', '1.sdt': 'WK', '1.kader': 'NONE', '9': 'NONE' }, '2027-06-01': { '1': 'NONE' } }, Z),
    ).toEqual({ '2027-04-28': { '1.kader': 'NONE' } });
  });

  it('Gruppen: own days like ranks; the Zug serves as its highest part; unknown Gruppen are dropped', () => {
    const G = [{ id: 1, gruppen: [{ id: 7 }, { id: 8 }] }, { id: 2, gruppen: [] }];
    // Gruppe 8 of Zug 1 not on the first WK day.
    const a = applyDuty(wk, [{ date: '2027-04-27', zugId: 1, part: 'g8' }], 'NONE', G);
    expect(a.dayDuty['2027-04-27']).toEqual({ '1.g8': 'NONE' });
    expect(dutyOf(a, '2027-04-27', 1)).toBe('WK');
    // On a KVK day a Gruppe serves (its Kader), on an AVOR day not.
    expect(rankDutyOf(wk, '2027-04-26', 1, 'g7')).toBe('KVK');
    expect(rankDutyOf(wk, '2027-04-23', 1, 'g7')).toBe('NONE');
    // A new day for one Gruppe only.
    const b = applyDuty(wk, [{ date: '2027-04-21', zugId: 1, part: 'g7' }], 'KVK', G);
    expect(['zfhr', 'kader', 'sdt', 'g7', 'g8'].map((p) => rankDutyOf(b, '2027-04-21', 1, p as any))).toEqual(['NONE', 'NONE', 'NONE', 'KVK', 'NONE']);
    expect(dutyOf(b, '2027-04-21', 1)).toBe('KVK');
    expect(normalizeDayDuty(wk, { '2027-04-27': { '1.g9': 'NONE', '1.g8': 'NONE', '2.g8': 'NONE' } }, G)).toEqual({ '2027-04-27': { '1.g8': 'NONE' } });
  });

  it('finds the WK of a day, else the nearest one that may change', () => {
    const list = [
      { ...wk, id: 1, kpId: 5, archived: false, status: 'ENTWURF' },
      { ...wk, id: 2, kpId: 5, startDate: '2027-09-06', endDate: '2027-09-10', avorDays: [], kvkDays: [], archived: false, status: 'ENTWURF' },
    ];
    expect(wkForDay(list, 5, '2027-04-28')?.id).toBe(1);
    expect(wkForDay(list, 5, '2027-08-30')?.id).toBe(2);
    expect(wkForDay(list, 6, '2027-04-28')).toBeUndefined();
  });
});
