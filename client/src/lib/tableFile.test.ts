import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { importTable, parseDateCell, type Column } from './tableFile';
import { roleOf } from './vorbereitungFile';

const cols: Column[] = [
  { key: 'titel', header: 'Titel' },
  { key: 'rolle', header: 'Rolle' },
  { key: 'termin', header: 'Termin' },
];

describe('table import', () => {
  it('reads Excel with German headers, date cells and empty rows', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('x');
    ws.addRow(['Titel', 'Rolle', 'Termin', 'Unbekannt']);
    ws.addRow(['Rapport', 'Kp Kdt', new Date(Date.UTC(2027, 2, 13)), 'egal']);
    ws.addRow([]);
    ws.addRow(['Rekognoszierung', 'Zugführer/in', '01.04.2027']);
    const buf = await wb.xlsx.writeBuffer();
    const rows = await importTable(new File([buf], 'v.xlsx'), cols);
    expect(rows).toEqual([
      { titel: 'Rapport', rolle: 'Kp Kdt', termin: '2027-03-13' },
      { titel: 'Rekognoszierung', rolle: 'Zugführer/in', termin: '01.04.2027' },
    ]);
  });

  it('reads JSON by key or header', async () => {
    const json = JSON.stringify({ typ: 'x', items: [{ titel: 'A', Rolle: 'KADER' }] });
    expect(await importTable(new File([json], 'v.json', { type: 'application/json' }), cols)).toEqual([{ titel: 'A', rolle: 'KADER' }]);
  });

  it('parses roles and dates', () => {
    expect(roleOf('Zugführer/in')).toBe('ZFHR');
    expect(roleOf('zugführer')).toBe('ZFHR');
    expect(roleOf('KADER')).toBe('KADER');
    expect(roleOf('')).toBeNull();
    expect(roleOf('Koch')).toBeNull();
    expect(parseDateCell('1.4.27')).toBe('2027-04-01');
    expect(parseDateCell('2027-03-13')).toBe('2027-03-13');
    expect(parseDateCell('morgen')).toBe('');
  });
});
