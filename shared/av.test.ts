import { describe, expect, it } from 'vitest';
import { fachbereicheOf, guessFachbereiche, normalizeAv, phaseOf, schedule } from './av';

describe('Ausbildungsvorbereitung helpers', () => {
  it('computes step times from «Zeit von» and durations', () => {
    expect(schedule('08:15', [{ dauer: 5 }, { dauer: 10 }, { dauer: 0 }])).toEqual([
      { von: '08:15', bis: '08:20' },
      { von: '08:20', bis: '08:30' },
      { von: '08:30', bis: '08:30' },
    ]);
    expect(schedule('', [{ dauer: 5 }])).toEqual([{ von: '', bis: '' }]);
  });

  it('converts documents with fixed from/to times and a single «zeit» text', () => {
    const d = normalizeAv({
      zeit: '08:15–08:50',
      ablauf: [{ from: '08:15', to: '08:20', phase: 'P', text: 'a' }, { from: '08:20', to: '08:50', phase: 'T1', text: 'b' }],
    } as unknown as Parameters<typeof normalizeAv>[0]);
    expect(d.zeitVon).toBe('08:15');
    expect(d.zeitBis).toBe('08:50');
    expect(d.ablauf.map((r) => r.dauer)).toEqual([5, 30]);
  });

  it('maps phase labels of the standalone tool', () => {
    expect(phaseOf('P – Problematisieren')).toBe('P');
    expect(phaseOf('T – Testen')).toBe('T2');
    expect(phaseOf('T – Trainieren')).toBe('T1');
    expect(phaseOf('I')).toBe('I');
    expect(phaseOf('xyz')).toBe('');
  });
});

describe('Fachbereiche', () => {
  it('reads keys, labels and short names; drops unknown ones', () => {
    expect(fachbereicheOf(['Pionier', 'KGS', 'fu', 'Betreuung', 'Logistik'])).toEqual(['PIONIER', 'KGS', 'FU', 'BETREUUNG']);
    expect(fachbereicheOf('Führungsunterstützung; Pionier')).toEqual(['FU', 'PIONIER']);
    expect(fachbereicheOf(undefined)).toEqual([]);
  });

  it('suggests the Fachbereich from the Zug name', () => {
    expect(guessFachbereiche('Pi Z 1')).toEqual(['PIONIER']);
    expect(guessFachbereiche('Betreu Z 2')).toEqual(['BETREUUNG']);
    expect(guessFachbereiche('FU KFS')).toEqual(['FU']);
    expect(guessFachbereiche('KGS')).toEqual(['KGS']);
    expect(guessFachbereiche('Log Z')).toEqual([]);
  });
});

describe('pickVehicles', async () => {
  const { pickVehicles } = await import('./util');
  it('uses as few vehicles as possible and the smallest that fits the rest', () => {
    const v = [{ id: 1, seats: 9 }, { id: 2, seats: 9 }, { id: 3, seats: 4 }, { id: 4, seats: 2 }];
    expect(pickVehicles(v, 3)).toEqual([3]);
    expect(pickVehicles(v, 9)).toEqual([2]);
    expect(pickVehicles(v, 12)).toEqual([1, 3]);
    expect(pickVehicles(v, 30)).toEqual([]);
  });
});
