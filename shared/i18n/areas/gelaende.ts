import type { L4 } from '.';

// Sites (Gelände) on the map: drawing and editing the area and its points, viewing a requested site.
export const gelaende = {
  'site.toolSelect': ['Verschieben', 'Déplacer', 'Spostare', 'Move'],
  'site.toolArea': ['Fläche zeichnen', 'Dessiner la surface', 'Disegnare la superficie', 'Draw area'],
  'site.toolPoint': ['Punkt setzen', 'Placer un point', 'Posare un punto', 'Add point'],
  'site.tools': ['Kartenwerkzeug', 'Outil de carte', 'Strumento della carta', 'Map tool'],
  'site.hintSelect': [
    'Eckpunkte und Punkte ziehen, um sie zu verschieben. Ein ○ zwischen zwei Eckpunkten antippen oder ziehen fügt einen Eckpunkt ein. Einen Eckpunkt antippen, um ihn auszuwählen.',
    'Faire glisser les coins et les points pour les déplacer. Toucher ou faire glisser un ○ entre deux coins insère un coin. Toucher un coin pour le sélectionner.',
    'Trascinare i vertici e i punti per spostarli. Toccare o trascinare un ○ tra due vertici inserisce un vertice. Toccare un vertice per selezionarlo.',
    'Drag corners and points to move them. Tap or drag a ○ between two corners to insert a corner. Tap a corner to select it.',
  ],
  'site.hintArea': [
    'Auf die Karte tippen, um Eckpunkte des Geländeabschnitts anzufügen (mind. 3).',
    'Toucher la carte pour ajouter des coins au secteur de terrain (au moins 3).',
    'Toccare la carta per aggiungere vertici al settore di terreno (almeno 3).',
    'Tap the map to add corners to the site section (at least 3).',
  ],
  'site.hintPoint': [
    'Auf die Karte tippen, um einen Punkt zu setzen, z. B. Sammelplatz, Zufahrt oder Wasserbezug.',
    'Toucher la carte pour placer un point, p. ex. place de rassemblement, accès ou prise d’eau.',
    'Toccare la carta per posare un punto, p. es. punto di raccolta, accesso o presa d’acqua.',
    'Tap the map to add a point, e.g. assembly point, access or water supply.',
  ],
  'site.deleteVertex': ['Eckpunkt löschen', 'Supprimer le coin', 'Elimina il vertice', 'Delete corner'],
  'site.removeLastVertex': ['Letzten Eckpunkt entfernen', 'Retirer le dernier coin', 'Rimuovi l’ultimo vertice', 'Remove last corner'],
  'site.insertVertex': ['Eckpunkt einfügen', 'Insérer un coin', 'Inserire un vertice', 'Insert corner'],
  'site.vertexN': ['Eckpunkt {n}', 'Coin {n}', 'Vertice {n}', 'Corner {n}'],
  'site.points': ['Punkte', 'Points', 'Punti', 'Points'],
  'site.pointN': ['Punkt {n}', 'Point {n}', 'Punto {n}', 'Point {n}'],
  'site.pointLabelPh': ['Bezeichnung, z. B. Sammelplatz', 'Désignation, p. ex. place de rassemblement', 'Designazione, p. es. punto di raccolta', 'Name, e.g. assembly point'],
  'site.deletePoint': ['Punkt löschen', 'Supprimer le point', 'Elimina il punto', 'Delete point'],
  'site.requested': ['Angefragtes Gelände', 'Terrain demandé', 'Terreno richiesto', 'Requested site'],
  'site.decideLegend': [
    '{a} angefragt · {b} bewilligt und {c} beantragt am selben Tag',
    '{a} demandé · {b} approuvé et {c} demandé le même jour',
    '{a} richiesto · {b} approvato e {c} richiesto lo stesso giorno',
    '{a} requested · {b} approved and {c} requested on the same day',
  ],
  'site.noShape': [
    'Für dieses Gelände sind weder Fläche noch Punkte erfasst.',
    'Ni surface ni points ne sont saisis pour ce terrain.',
    'Per questo terreno non sono registrati né superficie né punti.',
    'No area or points are recorded for this site.',
  ],
} satisfies Record<string, L4>;
