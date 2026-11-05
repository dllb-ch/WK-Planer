import type { L4 } from '.';

export const rest2 = {
  'pres.checkedIn': ['eingecheckt', 'enregistrés', 'registrati', 'checked in'],
  'pres.onlyMissing': ['nur fehlende', 'seulement les absents', 'solo gli assenti', 'missing only'],
  'pres.alreadyIn': [' – bereits eingecheckt', ' – déjà enregistré', ' – già registrato', ' – already checked in'],
} satisfies Record<string, L4>;
