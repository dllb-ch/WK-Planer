// Ausbildungsvorbereitung Grfhr as a document (print, Word) and as a .json file compatible with the standalone
// Grfhr form (a single HTML page the Gruppenführer fill in offline).
import type { AvInput, Ausbildungsstufe } from '@shared/types';
import { AUSBILDUNGSSTUFEN, FACHBEREICHE, PITT } from '@shared/types';
import { fachbereicheOf, normalizeAv, phaseOf, schedule } from '@shared/av';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const nl = (s: unknown) => esc(s).replace(/\n/g, '<br>');
const fmtDateLong = (d: string) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

/** Styles of the document; inlined so print and Word look the same. */
export const DOC_CSS = `
.doc{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000;background:#fff}
.doc .dhead{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #000;padding-bottom:6px;margin-bottom:10px}
.doc .dhead .org{font-size:8pt;text-align:right}
.doc .dhead .kopf{font-size:10pt;line-height:1.25}
.doc .dhead .kopf b{display:block}
.doc h1{font-size:15pt;margin:0 0 8px}
.doc table{width:100%;border-collapse:collapse;margin-bottom:8px;page-break-inside:avoid}
.doc td,.doc th{border:1px solid #000;padding:3pt 5pt;vertical-align:top;text-align:left}
.doc th,.doc .lbl{background:#d9d9d9;font-weight:bold}
.doc ul{margin:0;padding-left:14pt}
.doc .box{font-family:"Segoe UI Symbol",Arial,sans-serif;font-size:12pt}
.doc .ablauf{page-break-inside:auto}
.doc .ablauf tr{page-break-inside:avoid}`;

export interface DocContext {
  org: string; // e.g. Region, Zug and WK
  logo?: string | null;
  /** Letterhead lines (Amt bold, Abteilung …); then the logo is the canton's and sits top right. */
  kopf?: string[];
}

/** Context of the letterhead from the Bataillon settings. */
export const docContext = (
  bat: { regionName: string; logo: string | null; kantonLogo: string | null; briefkopf: { amt: string; abteilung: string } } | undefined,
  org: string,
): DocContext => ({ org, logo: bat?.kantonLogo ?? bat?.logo, kopf: [bat?.briefkopf.amt ?? '', bat?.briefkopf.abteilung ?? ''].filter(Boolean) });

export function docHtml(f: AvInput, ctx: DocContext) {
  const times = schedule(f.zeitVon, f.ablauf);
  const box = (v: Ausbildungsstufe) => `<span class="box">${f.stufe === v ? '☒' : '☐'}</span>`;
  const ziele = f.zielsetzungen.filter((z) => z.trim());
  const zeit = f.zeitVon ? `${f.zeitVon}${f.zeitBis ? '–' + f.zeitBis : ''}` : '';
  const rows =
    f.ablauf
      .map((r, i) => ({ r, t: times[i] }))
      .filter(({ r }) => r.text.trim() || r.phase)
      .map(
        ({ r, t }) => `<tr><td style="width:18%;white-space:nowrap">${t.von ? `${t.von}–${t.bis}<br>` : ''}<small>${esc(r.dauer)}′</small></td>
      <td style="width:15%">${r.phase ? esc(PITT[r.phase]) : ''}</td><td>${nl(r.text)}</td></tr>`,
      )
      .join('') || '<tr><td>&nbsp;</td><td></td><td></td></tr>';
  const extra = [
    f.postenplakat && `<tr><td class="lbl">Postenplakat</td><td>${nl(f.postenplakat)}</td></tr>`,
    f.bemerkungen && `<tr><td class="lbl">Bemerkungen</td><td>${nl(f.bemerkungen)}</td></tr>`,
  ]
    .filter(Boolean)
    .join('');
  return `<div class="doc">
  ${
    ctx.kopf?.length
      ? `<div class="dhead"><div class="kopf"><b>${esc(ctx.kopf[0])}</b>${ctx.kopf.slice(1).map(esc).join('<br>')}<div class="org" style="text-align:left;margin-top:3px">${nl(ctx.org)}</div></div><div>${ctx.logo ? `<img src="${esc(ctx.logo)}" alt="" style="height:13mm;max-width:60mm">` : ''}</div></div>`
      : `<div class="dhead"><div>${ctx.logo ? `<img src="${esc(ctx.logo)}" alt="" style="max-height:16mm;max-width:70mm">` : ''}</div><div class="org">${nl(ctx.org)}</div></div>`
  }
  <h1>Ausbildungsvorbereitung Grfhr</h1>
  <table>
    <tr><td class="lbl" style="width:18%">Ausbildungsart:</td><td style="width:37%">${esc(f.ausbildungsart)}</td><td class="lbl" style="width:12%">Datum:</td><td>${esc(fmtDateLong(f.datum))}</td></tr>
    <tr><td class="lbl">Teilnehmer</td><td>${esc(f.teilnehmer)}</td><td class="lbl">Zeit:</td><td>${esc(zeit)}</td></tr>
    <tr><td class="lbl">Arbeitsplatz</td><td>${esc(f.arbeitsplatz)}</td><td class="lbl">Leiter:</td><td>${esc(f.leiter)}</td></tr>
  </table>
  <table>
    <tr><td class="lbl" style="width:18%">Thema</td><td>${esc(f.thema)}</td></tr>
    <tr><td class="lbl">Fachbereich</td><td>${esc(f.fachbereiche.map((k) => FACHBEREICHE[k]).join(', '))}</td></tr>
    <tr><td class="lbl">Grundlagen</td><td>${nl(f.grundlagen)}</td></tr>
  </table>
  <table>
    <tr><th colspan="3">Ausbildungsstufe</th></tr>
    <tr><td style="width:33%">${box('ANLERNEN')} Anlernen</td><td style="width:33%">${box('FESTIGEN')} Festigen</td><td>${box('ANWENDEN')} Anwenden</td></tr>
  </table>
  <table>
    <tr><th>Zielsetzung:</th></tr>
    <tr><td>${ziele.length ? '<ul>' + ziele.map((z) => `<li>${esc(z)}</li>`).join('') + '</ul>' : '&nbsp;'}</td></tr>
  </table>
  <table>
    <tr><th colspan="2">Mittel</th></tr>
    <tr><td class="lbl" style="width:18%">Pers. Ausrüstung</td><td>${nl(f.persAusruestung)}</td></tr>
    <tr><td class="lbl">Fahrzeug</td><td>${nl(f.fahrzeug)}</td></tr>
    <tr><td class="lbl">Material</td><td>${nl(f.material)}</td></tr>
    <tr><td class="lbl">Unterlagen</td><td>${nl(f.unterlagen)}</td></tr>
    ${extra}
  </table>
  <table class="ablauf">
    <thead><tr><th>Zeit</th><th>Phase<br>PITT</th><th>Ablauf der Tätigkeiten</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table>
    <tr><th>Bemerkungen Controlling</th></tr>
    <tr><td><small><i>(Ausbildungskontrolle, Rückmeldung über die Zielerreichung, Beurteilung der AdZS)</i></small><br>${nl(f.controlling) || '<br><br><br>'}</td></tr>
  </table>
</div>`;
}

export const fileBase = (f: AvInput) =>
  (f.datum ? f.datum + '_' : '') + (f.thema || 'Ausbildungsvorbereitung').replace(/[^\wäöüÄÖÜéèà\- ]+/g, '').trim().replace(/\s+/g, '_');

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Word opens HTML with the msword type as a document (as in the standalone tool). */
export function downloadWord(f: AvInput, ctx: DocContext) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Ausbildungsvorbereitung Grfhr</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page{size:21cm 29.7cm;margin:2cm 2cm 1.8cm 2cm}body{font-family:Arial}${DOC_CSS}</style></head>
<body>${docHtml(f, ctx)}</body></html>`;
  download(fileBase(f) + '.doc', new Blob(['﻿', html], { type: 'application/msword' }));
}

const STUFE_LABEL = AUSBILDUNGSSTUFEN as Record<Ausbildungsstufe, string>;

/** File in the format of the standalone tool, so documents can be exchanged in both directions. */
export function downloadJson(f: AvInput) {
  const data = {
    art: f.ausbildungsart,
    datum: f.datum,
    zeitVon: f.zeitVon,
    zeitBis: f.zeitBis,
    teilnehmer: f.teilnehmer,
    arbeitsplatz: f.arbeitsplatz,
    leiter: f.leiter,
    thema: f.thema,
    fachbereiche: f.fachbereiche.map((k) => FACHBEREICHE[k]),
    grundlagen: f.grundlagen,
    stufe: f.stufe ? STUFE_LABEL[f.stufe] : '',
    ziele: f.zielsetzungen,
    m_ausruestung: f.persAusruestung,
    m_fahrzeug: f.fahrzeug,
    m_material: f.material,
    m_unterlagen: f.unterlagen,
    ablauf: f.ablauf.map((r) => ({ dauer: r.dauer, phase: r.phase ? PITT[r.phase] : '', text: r.text })),
    controlling: f.controlling,
    // Not part of the standalone tool; it ignores these.
    postenplakat: f.postenplakat,
    bemerkungen: f.bemerkungen,
  };
  const json = JSON.stringify({ typ: 'Ausbildungsvorbereitung Grfhr', version: 1, data }, null, 2);
  download(fileBase(f) + '.json', new Blob([json], { type: 'application/json' }));
}

/** Reads a saved file (also one edited in TextEdit) into the fields of an Ausbildungsvorbereitung. */
export function parseJson(text: string): Omit<AvInput, 'blockId' | 'zugId'> {
  const t = text.replace(/[﻿   ]/g, ' ');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Kein Formularinhalt gefunden');
  let j: any;
  try {
    j = JSON.parse(t.slice(a, b + 1));
  } catch {
    j = JSON.parse(t.slice(a, b + 1).replace(/[“”„]/g, '"'));
  }
  const s = j && typeof j.data === 'object' ? j.data : j;
  if (!s || typeof s !== 'object' || !('thema' in s || 'ablauf' in s || 'art' in s)) throw new Error('Keine Ausbildungsvorbereitung');
  const str = (v: unknown) => (v == null ? '' : String(v));
  const stufe = (Object.keys(STUFE_LABEL) as Ausbildungsstufe[]).find((k) => k === s.stufe || STUFE_LABEL[k] === s.stufe) ?? '';
  const ziele = Array.isArray(s.ziele) ? s.ziele : Array.isArray(s.zielsetzungen) ? s.zielsetzungen : [];
  const ablauf = (Array.isArray(s.ablauf) ? s.ablauf : [])
    .filter((r: unknown) => r && typeof r === 'object')
    .map((r: any) => ({ dauer: Number(r.dauer) || 0, phase: phaseOf(r.phase), text: str(r.text), from: r.from, to: r.to }));
  return normalizeAv({
    ausbildungsart: str(s.art ?? s.ausbildungsart),
    datum: str(s.datum),
    zeitVon: str(s.zeitVon),
    zeitBis: str(s.zeitBis),
    zeit: str(s.zeit),
    teilnehmer: str(s.teilnehmer),
    arbeitsplatz: str(s.arbeitsplatz),
    leiter: str(s.leiter),
    thema: str(s.thema),
    fachbereiche: fachbereicheOf(s.fachbereiche),
    grundlagen: str(s.grundlagen),
    stufe,
    zielsetzungen: ziele.map(str),
    persAusruestung: str(s.m_ausruestung ?? s.persAusruestung),
    postenplakat: str(s.postenplakat),
    fahrzeug: str(s.m_fahrzeug ?? s.fahrzeug),
    material: str(s.m_material ?? s.material),
    unterlagen: str(s.m_unterlagen ?? s.unterlagen),
    bemerkungen: str(s.bemerkungen),
    controlling: str(s.controlling),
    ablauf,
  });
}
