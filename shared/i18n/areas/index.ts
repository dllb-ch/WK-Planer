// Texts by area of the app, each with [Deutsch, Français, Italiano, English]; merged into the catalogs (de.ts …).
export type L4 = readonly [de: string, fr: string, it: string, en: string];
import { admin } from './admin';
import { vorlagen } from './vorlagen';
import { setup } from './setup';
import { jahresplanung } from './jahresplanung';
import { planung } from './planung';
import { av } from './av';
import { avdoc } from './avdoc';
import { lektionen } from './lektionen';
import { uebung } from './uebung';
import { erkundung_check } from './erkundung_check';
import { erkundung } from './erkundung';
import { zug } from './zug';
import { gruppen } from './gruppen';
import { personal } from './personal';
import { praesenz } from './praesenz';
import { ressourcen } from './ressourcen';
import { anfrage } from './anfrage';
import { rapporte } from './rapporte';
import { uebersicht } from './uebersicht';
import { komponenten } from './komponenten';
import { komponenten2 } from './komponenten2';
import { rest } from './rest';
import { rest2 } from './rest2';
import { rest3 } from './rest3';
import { rest4 } from './rest4';
// AREA-IMPORTS

export const AREAS = {
  ...admin,
  ...vorlagen,
  ...setup,
  ...jahresplanung,
  ...planung,
  ...av,
  ...avdoc,
  ...lektionen,
  ...uebung,
  ...erkundung_check,
  ...erkundung,
  ...zug,
  ...gruppen,
  ...personal,
  ...praesenz,
  ...ressourcen,
  ...anfrage,
  ...rapporte,
  ...uebersicht,
  ...komponenten,
  ...komponenten2,
  ...rest,
  ...rest2,
  ...rest3,
  ...rest4,
  // AREA-SPREAD
};
export type AreaKey = keyof typeof AREAS;

/** The texts of one language: 0 = de, 1 = fr, 2 = it, 3 = en. */
export function areaTexts(i: 0 | 1 | 2 | 3): Record<AreaKey, string> {
  const out = {} as Record<AreaKey, string>;
  for (const [k, v] of Object.entries(AREAS) as [AreaKey, L4][]) out[k] = v[i];
  return out;
}
