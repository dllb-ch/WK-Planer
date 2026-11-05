// Import and export of simple tables as Excel (.xlsx) or JSON. ExcelJS is loaded only when needed.

export interface Column {
  key: string; // JSON key
  header: string; // Excel header
  width?: number;
}

export type Row = Record<string, string>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function exportTable(fileBase: string, type: string, columns: Column[], rows: Row[], format: 'xlsx' | 'json') {
  if (format === 'json') {
    const items = rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? ''])));
    download(`${fileBase}.json`, new Blob([JSON.stringify({ typ: type, version: 1, items }, null, 2)], { type: 'application/json' }));
    return;
  }
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(type.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  rows.forEach((r) => ws.addRow(Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? '']))));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  download(`${fileBase}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/** Reads an .xlsx or .json file into rows keyed by column key; headers and keys are matched loosely. */
export async function importTable(file: File, columns: Column[]): Promise<Row[]> {
  const byName = new Map<string, string>();
  for (const c of columns) {
    byName.set(norm(c.key), c.key);
    byName.set(norm(c.header), c.key);
  }
  const toRow = (entries: [string, unknown][]) => {
    const row: Row = {};
    for (const [k, v] of entries) {
      const key = byName.get(norm(k));
      if (key) row[key] = v == null ? '' : String(v).trim();
    }
    return row;
  };

  if (/\.json$/i.test(file.name) || file.type === 'application/json') {
    const j = JSON.parse(await file.text());
    const items: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
    if (!items.length) throw new Error('Keine Einträge in der Datei gefunden');
    return items.filter((x) => x && typeof x === 'object').map((x) => toRow(Object.entries(x as object)));
  }

  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Die Excel-Datei hat kein Tabellenblatt');
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => (headers[col] = cell.text));
  const rows: Row[] = [];
  ws.eachRow((r, i) => {
    if (i === 1) return;
    const entries: [string, unknown][] = [];
    r.eachCell((cell, col) => {
      const v = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text;
      if (headers[col]) entries.push([headers[col], v]);
    });
    const row = toRow(entries);
    if (Object.values(row).some(Boolean)) rows.push(row);
  });
  if (!rows.length) throw new Error('Keine Zeilen unter der Kopfzeile gefunden');
  return rows;
}

/** «13.03.2027», «2027-03-13» → ISO date, or '' if not a date. */
export function parseDateCell(s: string) {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (ch) return `${ch[3].length === 2 ? '20' + ch[3] : ch[3]}-${ch[2].padStart(2, '0')}-${ch[1].padStart(2, '0')}`;
  return '';
}
