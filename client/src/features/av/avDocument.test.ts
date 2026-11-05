import { beforeEach, describe, expect, it } from 'vitest';
import { docHtml, parseJson } from './avDocument';
import { setCurrentLang } from '../../lib/lang';

// The document is written in the language of the interface; German unless a test says otherwise.
beforeEach(() => setCurrentLang('de', false));

// A file as saved by the standalone Grfhr form.
const toolFile = JSON.stringify({
  typ: 'Ausbildungsvorbereitung Grfhr',
  version: 1,
  data: {
    art: 'Gruppenausbildung',
    datum: '2027-04-27',
    zeitVon: '08:00',
    zeitBis: '08:45',
    teilnehmer: 'Gruppe 2',
    arbeitsplatz: 'Werkhof',
    leiter: 'Wm Huber',
    thema: 'Pumpen <Typ 2>',
    grundlagen: 'Regl.',
    stufe: 'Festigen',
    ziele: ['Die AdZS können die Pumpe in Betrieb nehmen', ''],
    m_ausruestung: 'Helm',
    m_fahrzeug: 'Pickup',
    m_material: 'Pumpe',
    m_unterlagen: '',
    ablauf: [
      { dauer: 10, phase: 'P – Problematisieren', text: 'Einstieg' },
      { dauer: 35, phase: 'T – Trainieren', text: 'Üben' },
    ],
    controlling: 'gut',
  },
});

describe('Ausbildungsvorbereitung file and document', () => {
  it('reads files of the standalone tool', () => {
    const f = parseJson(toolFile);
    expect(f).toMatchObject({ ausbildungsart: 'Gruppenausbildung', stufe: 'FESTIGEN', persAusruestung: 'Helm', fahrzeug: 'Pickup', zeitVon: '08:00' });
    expect(f.ablauf).toEqual([
      { dauer: 10, phase: 'P', text: 'Einstieg' },
      { dauer: 35, phase: 'T1', text: 'Üben' },
    ]);
  });

  it('tolerates text pasted from TextEdit (curly quotes, BOM)', () => {
    const curly = '﻿' + toolFile.replace(/"/g, (_, i) => (i % 2 ? '“' : '”'));
    expect(parseJson(curly).thema).toBe('Pumpen <Typ 2>');
    expect(() => parseJson('hello')).toThrow();
  });

  it('renders the document with computed times and escaped text', () => {
    const f = parseJson(toolFile);
    const html = docHtml({ ...f, blockId: null, zugId: 1 }, { org: 'Pi Z 1' });
    expect(html).toContain('08:00–08:10');
    expect(html).toContain('08:10–08:45');
    expect(html).toContain('Pumpen &lt;Typ 2&gt;');
    expect(html).toContain('☒</span> Festigen');
    // In French: the labels follow the language, the content stays as entered.
    setCurrentLang('fr', false);
    const fr = docHtml({ ...f, blockId: null, zugId: 1 }, { org: 'Pi Z 1' });
    expect(fr).toContain('☒</span> Consolidation');
    expect(fr).toContain('Objectifs :');
    expect(fr).toContain('Pumpen &lt;Typ 2&gt;');
  });
});
