import type { L4 } from '.';

export const demo = {
  'demo.badge': ['Demo', 'Démo', 'Demo', 'Demo'],
  'demo.title': ['Demo-Version', 'Version de démonstration', 'Versione demo', 'Demo version'],
  'demo.text': ['Alles läuft in diesem Browser – ohne Server. Änderungen bleiben auf diesem Gerät und sind für niemanden sonst sichtbar. Oben rechts lässt sich die Rolle wechseln.', 'Tout fonctionne dans ce navigateur, sans serveur. Les modifications restent sur cet appareil et ne sont visibles par personne d’autre. Le rôle se change en haut à droite.', 'Tutto funziona in questo browser, senza server. Le modifiche restano su questo dispositivo e non sono visibili a nessun altro. Il ruolo si cambia in alto a destra.', 'Everything runs in this browser, without a server. Changes stay on this device and are not visible to anyone else. Switch roles at the top right.'],
  'demo.reset': ['Demo zurücksetzen', 'Réinitialiser la démo', 'Reimposta la demo', 'Reset demo'],
  'demo.confirmReset': ['Alle Änderungen verwerfen und mit den Demo-Daten neu beginnen?', 'Annuler toutes les modifications et recommencer avec les données de démonstration ?', 'Annullare tutte le modifiche e ricominciare con i dati demo?', 'Discard all changes and start over with the demo data?'],
} satisfies Record<string, L4>;
