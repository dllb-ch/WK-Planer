import { describe, expect, it } from 'vitest';
import { LANGS, pickLang, translate, translateMessage, weekdayIn } from '.';
import { de } from './de';
import { fr } from './fr';
import { it as itCat } from './it';
import { en } from './en';
import { traktandenOf } from '../rapport';
import { defaultStandardBlocks, defaultVorbereitung } from '../util';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('every language has every key, no empty text and the same placeholders', () => {
    for (const cat of [fr, itCat, en]) {
      expect(Object.keys(cat).sort()).toEqual(Object.keys(de).sort());
      for (const [k, v] of Object.entries(cat)) {
        expect(v.trim(), k).not.toBe('');
        expect(placeholders(v), k).toEqual(placeholders(de[k as keyof typeof de]));
      }
    }
  });

  it('fills in placeholders and picks the language', () => {
    expect(translate('fr', 'checkin.thanks', { name: 'Léa' })).toBe('Merci, Léa !');
    expect(translateMessage('it', 'err.checkin.closed')).toMatch(/non è aperto/);
    expect(translateMessage('it', 'Freier Text')).toBe('Freier Text');
    expect(pickLang('fr-CH,fr;q=0.9,de;q=0.8')).toBe('fr');
    expect(pickLang(['en-US', 'it'])).toBe('en');
    expect(pickLang('es-ES')).toBe('de');
    expect(LANGS.map((l) => weekdayIn(l, '2027-04-26'))).toEqual(['Montag', 'lundi', 'lunedì', 'Monday']);
  });

  it('creates default texts in the language: agendas, standard blocks, preparation template', () => {
    expect(traktandenOf('FREI').map((t) => t.title)).toEqual(['Ziel des Rapports', 'Umfrage', 'Nächster Rapport']);
    expect(traktandenOf('FREI', 'fr').map((t) => t.title)).toEqual(['But du rapport', 'Tour de table', 'Prochain rapport']);
    expect(traktandenOf('BEFEHL', 'it').every((t) => !/[äöü]|Auftr|Absicht/.test(t.title + t.hint))).toBe(true);
    expect(defaultStandardBlocks('it').map((b) => b.title)).toEqual(['Appello', 'Pranzo', 'Rapporto quadri']);
    expect(defaultVorbereitung('en')[0]).toMatchObject({ title: 'Issue the training order to the companies', ownerRole: 'BAT', daysBefore: 400 });
    expect(defaultVorbereitung()[0].title).toBe('Ausbildungsbefehl an die Kompanien erteilen');
  });
});
