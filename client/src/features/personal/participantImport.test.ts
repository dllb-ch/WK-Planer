import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Wk, Zug } from '@shared/types';
import { emptyBestand } from '@shared/types';
import { importTable } from '../../lib/tableFile';
import { ALIASES, applyZugMapping, COLUMNS, guessZug, parseParticipants } from './participantImport';

const zuege: Zug[] = ['LOG CARE', 'FU KFS', 'KGS', 'UAV-T'].map((name, i) => ({ id: i + 1, kpId: 1, name, order: i, zfhrUserId: null, soll: emptyBestand(), ist: emptyBestand(), gruppen: [] }));
const wk = { id: 1, kpId: 1, startDate: '2026-10-28', endDate: '2026-10-30', avorDays: [] } as unknown as Wk;
// Export of the personnel system (same columns as the real one, made-up people).
const HEAD = ['Sel', '*Status / Kdpfl', ' ', 'Name', 'Vorname', 'Funktion', 'Grad', ' ', '*Eff. EinrDatum', '*Eff. EinrZeit', '*Eff. EntlDatum', '*Eff. EntlZeit', 'Dauer (Tage)'];
const PEOPLE: [string, string, string, string, string][] = [
  ['Muster', 'Anna', 'Fhr Ustü', 'Sdt', '28.10.2026'],
  ['Beispiel', 'Ben', 'KGS Spez', 'Sdt', '28.10.2026'],
  ['Probst', 'Carla', 'Betreu', 'Sdt', '30.10.2026'],
  ['Test', 'Dario', 'KGS Spez', 'Kpl', '28.10.2026'],
  ['Demo', 'Eva', 'KGS Spez', 'Sdt', '28.10.2026'],
  ['Fiktiv', 'Finn', 'FU Uof', 'Wm', '28.10.2026'],
];
const file = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('sheet1');
  ws.addRow(HEAD);
  for (const [name, vorname, funktion, grad, von] of PEOPLE) ws.addRow(['', 'S04', 'Aufgeboten', name, vorname, funktion, grad, 'Wiederholungskurs', von, '08:00', '30.10.2026', '17:00', '']);
  return new File([await wb.xlsx.writeBuffer()], 'Teilnehmerliste.xlsx');
};

describe('Teilnehmerliste aus dem Personalsystem', () => {
  it('reads name, function, rank and the days of service from entry and discharge dates', async () => {
    const rows = await importTable(await file(), [...COLUMNS, ...ALIASES]);
    const p = parseParticipants(rows, wk, zuege);
    expect(p.items).toHaveLength(6);
    expect(p.items[0]).toMatchObject({ nachname: 'Muster', vorname: 'Anna', funktion: 'Fhr Ustü', grad: 'Sdt', zugId: null, days: [] });
    // Only on 30.10.
    expect(p.items[2]).toMatchObject({ nachname: 'Probst', days: ['2026-10-30'] });
    expect(p.outside).toBe(0);
    expect(p.funktionen.find((f) => f.funktion === 'KGS Spez')).toMatchObject({ count: 3, guess: 3 });
    expect(p.funktionen.find((f) => f.funktion === 'Fhr Ustü')?.guess).toBe(2);
    const mapped = applyZugMapping(p.items, Object.fromEntries(p.funktionen.map((f) => [f.funktion, f.guess])));
    expect(mapped.filter((x) => x.zugId === 3)).toHaveLength(3);
  });

  it('warns when the dates are not in the WK', async () => {
    const later = { ...wk, startDate: '2027-04-27', endDate: '2027-04-30' } as Wk;
    const p = parseParticipants(await importTable(await file(), [...COLUMNS, ...ALIASES]), later, zuege);
    expect(p.outside).toBe(6);
    expect(p.items.every((x) => x.days.length === 0)).toBe(true);
  });

  it('suggests a Zug from the Funktion', () => {
    expect(guessZug('FU Uof', zuege)).toBe(2);
    expect(guessZug('KGS Of', zuege)).toBe(3);
    expect(guessZug('Kp Kdt Stv', zuege)).toBeNull();
    expect(guessZug('Pi', zuege)).toBeNull();
    const pi: Zug[] = ['Pi Z 1', 'Betreu Z'].map((name, i) => ({ id: i + 1, kpId: 1, name, order: i, zfhrUserId: null, soll: emptyBestand(), ist: emptyBestand(), gruppen: [] }));
    expect(guessZug('Betreu Uof', pi)).toBe(2);
    // Several Pi Züge: no guess.
    expect(guessZug('Pi', [...pi, { id: 9, kpId: 1, name: 'Pi Z 2', order: 9, zfhrUserId: null, soll: emptyBestand(), ist: emptyBestand(), gruppen: [] }])).toBeNull();
  });
});
