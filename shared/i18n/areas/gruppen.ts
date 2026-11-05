import type { L4 } from '.';

export const gruppen = {
  'grp.whole': ['Ganzer Zug', 'Toute la section', 'Tutta la sezione', 'Whole platoon'],
  'grp.title': ['Gruppen {zug}', 'Groupes {zug}', 'Gruppi {zug}', 'Groups {zug}'],
  'grp.intro': ['Mit Gruppen wird der Zug in der Zugansicht in Spalten aufgeteilt. Sequenzen können pro Gruppe geplant, geklont und im Turnus rotiert werden.', 'Avec des groupes, la section est divisée en colonnes dans la vue de la section. Les séquences peuvent être planifiées par groupe, clonées et tournées en tournus.', 'Con i gruppi la sezione viene suddivisa in colonne nella vista della sezione. Le sequenze possono essere pianificate per gruppo, clonate e ruotate.', 'With groups the platoon is split into columns in the platoon view. Sequences can be planned per group, cloned and rotated.'],
  'grp.content': ['Inhalt', 'Contenu', 'Contenuto', 'Content'],
  'grp.clone': ['Klonen …', 'Cloner …', 'Clona …', 'Clone …'],
  'grp.tip': ['Tipp: Im Raster mit gedrückter Alt-/Option-Taste ziehen, um zu klonen.', 'Astuce : faire glisser dans la grille en maintenant la touche Alt/Option pour cloner.', 'Suggerimento: trascinare nella griglia tenendo premuto Alt/Opzione per clonare.', 'Tip: drag in the grid while holding Alt/Option to clone.'],
  'grp.cloneTitle': ['Sequenz klonen', 'Cloner la séquence', 'Clona sequenza', 'Clone sequence'],
  'grp.createCopies': ['{n} Kopien erstellen', 'Créer {n} copies', 'Crea {n} copie', 'Create {n} copies'],
  'grp.createCopy': ['1 Kopie erstellen', 'Créer 1 copie', 'Crea 1 copia', 'Create 1 copy'],
  'grp.forGroups': ['Für Gruppen', 'Pour les groupes', 'Per i gruppi', 'For groups'],
  'grp.same': ['zur gleichen Zeit (parallel)', 'au même moment (en parallèle)', 'allo stesso momento (in parallelo)', 'at the same time (in parallel)'],
  'grp.shift': ['nacheinander, ab', 'l’une après l’autre, dès', 'una dopo l’altra, dalle', 'one after the other, from'],
  'grp.copyStart': ['Beginn der Kopie', 'Début de la copie', 'Inizio della copia', 'Start of the copy'],
  'grp.outside': ['Mindestens eine Kopie liegt ausserhalb des Zeitfensters {from}–{to}.', 'Au moins une copie se trouve hors du créneau {from}–{to}.', 'Almeno una copia è fuori dalla fascia oraria {from}–{to}.', 'At least one copy lies outside the time slot {from}–{to}.'],
  'grp.turnusTitle': ['Turnus erstellen', 'Créer un tournus', 'Creare una rotazione', 'Create a rotation'],
  'grp.turnusTake': ['Turnus übernehmen', 'Reprendre le tournus', 'Riprendi la rotazione', 'Apply rotation'],
  'grp.turnusIntro': ['Planen Sie die Posten für eine Gruppe nacheinander; alle anderen Gruppen erhalten dieselben Posten im Kreis versetzt. Bestehende Sequenzen der anderen Gruppen in diesem Zeitfenster werden ersetzt.', 'Planifiez les postes pour un groupe l’un après l’autre ; tous les autres groupes reçoivent les mêmes postes décalés en rotation. Les séquences existantes des autres groupes dans ce créneau sont remplacées.', 'Pianificare le postazioni per un gruppo una dopo l’altra; tutti gli altri gruppi ricevono le stesse postazioni sfalsate in rotazione. Le sequenze esistenti degli altri gruppi in questa fascia oraria vengono sostituite.', 'Plan the stations for one group one after the other; all other groups get the same stations shifted in rotation. Existing sequences of the other groups in this time slot are replaced.'],
  'grp.template': ['Vorlage-Gruppe', 'Groupe modèle', 'Gruppo modello', 'Template group'],
} satisfies Record<string, L4>;
