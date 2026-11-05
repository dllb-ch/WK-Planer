# Handbuch WK-Planer

Funktionen und Bedienung im Detail. Installation und Betrieb: siehe [INSTALL.md](../INSTALL.md).

- [Jahresplanung (Bat Kommando)](#jahresplanung-bat-kommando)
- [Ausbildungsbefehl → WK](#ausbildungsbefehl--wk)
- [Rollen](#rollen)
- [Aufbau eines WK](#aufbau-eines-wk)
- [Arbeitsprogramm bedienen](#arbeitsprogramm-bedienen)
- [Lektionsbibliothek](#lektionsbibliothek)
- [Ansichten nach Rolle](#ansichten-nach-rolle)
- [Vorbereitung](#vorbereitung)
- [Mobile Geräte](#mobile-geräte)
- [Briefkopf und Druckvorlagen](#briefkopf-und-druckvorlagen)
- [Dossier (Drucken / PDF)](#dossier-drucken--pdf)
- [App installieren (PWA) und offline lesen](#app-installieren-pwa-und-offline-lesen)
- [Zugansicht](#zugansicht)
- [Fahrzeuge, Räume, Gelände](#fahrzeuge-räume-gelände)
- [Erkundungen](#erkundungen)
- [Übungen](#übungen)
- [Tagesbefehl](#tagesbefehl)
- [Anhänge und Dateien](#anhänge-und-dateien)
- [Rapporte und Pendenzen](#rapporte-und-pendenzen)
- [Personal: Bestand, Teilnehmerliste, Präsenz](#personal-bestand-teilnehmerliste-präsenz)

## Jahresplanung (Bat Kommando)

Menü «Planung › Jahresplanung» (daneben «Ausbildungsbefehl»): AVOR-, KVK- und WK-Tage aller Kompanien eines Jahres, als **Jahresansicht** (Monate als
Spalten, Tage als Zeilen, pro Tag ein Kästchen je Kompanie) oder **Monatsansicht** (Kompanien als Zeilen, mit
Ist-/Sollbestand). Darunter die Liste aller Dienstleistungen des Jahres. «Drucken» gibt Plan und Liste im
Querformat mit Briefkopf aus.

- Tag anklicken → «Neuer WK ab …» oder den Tag als AVOR- bzw. KVK-Tag einem WK der Kompanie zuordnen.
  Ein belegter Tag öffnet den WK: Daten, AVOR- und KVK-Tage ändern oder den WK löschen.
- **Monatsansicht planen:** Tage in den Zeilen der Züge anklicken oder mit der Maus darüberziehen (auch über
  mehrere Zeilen, wie in einer Tabelle) und im Menü WK, KVK, AVOR oder «Kein Dienst» wählen. Tage ausserhalb
  des WK werden zu AVOR- oder KVK-Tagen des nächsten WK der Kompanie bzw. verlängern ihn (WK).
- **Nach Funktion:** Mit dem Häkchen «Nach Funktion» erhält jeder Zug je eine Zeile für Zugführer (Of), Kader
  (Uof) und Soldaten mit ihrem Bestand. Standard: WK = alle, KVK = Zugführer und Kader, AVOR = Zugführer; jede
  Zeile lässt sich einzeln planen (z. B. Zugführer einen Tag früher). Der Zug hat Dienst, sobald eine seiner
  Funktionen Dienst hat (das Arbeitsprogramm richtet sich danach).
- **Nach Gruppen:** Mit «Nach Gruppen» erhält jeder Zug je eine Zeile pro Gruppe (aus der Organisation), mit
  ihrem Bestand, einzeln planbar wie die Funktionen. Standard: die Gruppe hat Dienst wie ihr Zug (am KVK ihre
  Kader), an AVOR-Tagen nicht.
- Jeder geplante WK wird sofort mit dem Vorbereitungs-Zeitplan angelegt; mehrere WKs pro Jahr und Kompanie
  sind möglich. Die Jahresplanung ist der einzige Ort für die Daten – der Ausbildungsbefehl zeigt sie an.
- Kp Kdt, Log Of und Zugführer sehen die Planung ihrer Kompanie (nur lesen).

**Gruppen (Organisation › Kompanien & Personal):** Bat Kommando und Kp Kdt teilen einen Zug unter «Gruppen bearbeiten» in Gruppen auf –
mit Name, Gruppenführer/in und Soll-/Istbestand (Kader, Soldaten). Kader und Soldaten des Zuges ergeben sich dann
aus den Gruppen; der Zugführer-Bestand bleibt beim Zug. Neue WKs übernehmen die Gruppen für Detailplanung und
Turnus (im WK weiter anpassbar).

**Archivieren und Löschen:** In der Übersicht archiviert das Bat Kommando einzelne oder alle vergangenen WKs.
Archivierte WKs verschwinden aus den Listen (Abschnitt «Archiv»), bleiben vollständig lesbar, sind aber
schreibgeschützt (auch der QR-Check-in) – bis sie wiederhergestellt werden. «Löschen» entfernt einen WK mit
allen Daten endgültig.

## Ausbildungsbefehl → WK

Der Ausbildungsbefehl enthält Leitziel, Absicht und pro Kompanie Richtziele und Teilnehmende; die Daten
(AVOR, KVK, WK) zeigt er aus der Jahresplanung an. (Über die API gesendete «WK von/bis» legen weiterhin einen
WK an bzw. verknüpfen ihn, solange das Arbeitsprogramm ein Entwurf ist.)

**WK-Konzept:** Jede Zielsetzung gilt für alle Züge oder für ausgewählte. Zugführer-AP und Zugs-Dossier zeigen
nur die Zielsetzungen des jeweiligen Zuges.

## Rollen

| Fähigkeit | Bat Kommando | Kp Kdt | Log Of | Zugführer/in (+ Stv) | Kader |
|---|---|---|---|---|---|
| Kompanien, WKs, Benutzer verwalten | ✔ | eigene Log Of/Zfhr/Kader, Züge | – | – | – |
| Organisation: Vorlagen, Katalog Fahrzeuge/Räume/Gelände | eigenes Bataillon (Org Admin: alle) | Katalog eigene Kp | Katalog eigene Kp | – | – |
| Ausbildungsbefehl | bearbeiten | Auftrag eigene Kp lesen | lesen | lesen | – |
| WK-Konzept | lesen | bearbeiten | lesen | lesen | lesen |
| Arbeitsprogramm | gesperrte Bat-Vorgaben setzen (z. B. Besuch Bat Kdt) | alle Blöcke inkl. Kdo-Spalte und AVOR-Tage planen, sperren | lesen | Blöcke des eigenen Zuges anpassen (nicht gesperrte) | lesen |
| Zugansicht / Detailplanung | alle Züge lesen | alle Züge | alle Züge lesen | eigener Zug: Detailplanung in den Zeitfenstern | eigener Zug lesen |
| Ausbildungsvorbereitung | lesen | lesen | lesen | alle des eigenen Zuges | eigene erstellen/bearbeiten |
| Fahrzeuge, Räume, Gelände | lesen | Katalog, bewilligen, anfragen | Katalog, bewilligen, anfragen | für eigenen Zug anfragen | Anfragen des Zuges lesen |
| Freigabe Arbeitsprogramm | freigeben / zurückweisen | einreichen / wieder öffnen | – | – | – |
| Zugführerarbeitsprogramm | lesen | lesen | lesen | eigener Zug bearbeiten | eigener Zug lesen |
| Vorbereitung | eigene Schritte abhaken, alle sehen | bearbeiten, alle sehen | eigene Schritte | eigene Schritte | eigene Schritte |
| Kommentare | ✔ | ✔ | ✔ | ✔ | ✔ |

Zugführer Stv: jede weitere Person mit Rolle Zugführer/in, die demselben Zug zugeteilt ist (der Haupt-Zfhr
wird beim Zug unter «Organisation › Kompanien & Personal» gewählt). Ein Log Of, der einem Zug zugeteilt ist, hat für diesen Zug die
Rechte eines Zugführers.

Die Regeln sind zentral in `shared/permissions.ts` definiert, werden vom Server erzwungen und vom Client
zum Ein-/Ausblenden der Bedienelemente genutzt.

## Aufbau eines WK

| Bereich | Inhalt | Sichtbar für |
|---|---|---|
| Zugansicht | Programm und Detailplanung des Zuges | alle |
| Auftrag Kp Kdt | Arbeitsprogramm · WK-Konzept | alle |
| Zugführer-AP | Zugführerarbeitsprogramm | alle |
| Ausbildung | Lektionen (Ausbildungsvorbereitungen) · Übungen · Erkundungen | alle |
| Ressourcen | Fahrzeuge, Räume, Gelände · Personal | Personal: Zugführer und höher |
| Rapporte | Rapporte und Protokolle | alle |
| Pendenzen | Pendenzen und Vorbereitung in einer Ansicht | Vorbereitung wie bisher |
| Dateien | Ablage pro Zug | alle (Kader: eigener Zug) |
| Dossier | Dossier · Tagesbefehl | Tagesbefehl: Kp Kdt und Bat Kdo |

Übungen und Erkundungen erstellen Bat Kdo, Kp Kdt und (für den eigenen Zug) Zugführer; Erkundungen auch Kader.

**Tage:** WK-Tage (alle Züge), **KVK-Tage** (Kadervorkurs, alle Züge) und **AVOR-Tage** (nur Kp Kdo). Unter
Arbeitsprogramm → Einstellungen legt der Kp Kdt in der Matrix «Diensttage pro Zug» pro Zug und Tag fest: WK, KVK,
AVOR oder – (kein Dienst). So kann am selben Tag ein Zug im KVK und ein anderer im WK sein; Abweichungen vom Tagestyp
zeigt das Arbeitsprogramm als Marke beim Zug. Ohne Dienst ist die Spalte schraffiert und nicht beplanbar (auch der
Server lehnt solche Blöcke ab) – ausser für Blöcke über mehrere Spalten wie das Mittagessen für alle, die einen Zug
ohne Dienst überspannen dürfen. Zugführer und Kader sehen AVOR-Tage nur, wenn ihr Zug teilnimmt. Die KVK-Tage aus
dem Ausbildungsbefehl werden als KVK-Tage übernommen.

**Standort & Ressourcen:** Im Block-Dialog stehen Standort und Ressourcen in einem Abschnitt. Der Standort kommt aus
der Legende oder – für den Kp Kdt – direkt aus den Räumen und Geländeabschnitten des Katalogs; er wird dann verknüpft
(🔗) in die Legende aufgenommen. Ein verknüpfter Standort wird beim Speichern automatisch reserviert: die Anfrage gehört
zum Block, wandert beim Verschieben mit (und braucht dann eine neue Bewilligung), wechselt mit dem Standort und
verschwindet, wenn der Standort entfernt oder der Block gelöscht wird. Plant der Kp Kdt oder Log Of und ist der
Raum frei, ist die Reservation gleich bewilligt. Standorte ausserhalb des Katalogs (z. B. ein Altersheim) bleiben
reine Legendeneinträge. Darunter fragt man weitere Fahrzeuge, Anhänger, Räume oder Gelände an; bei einem neuen Block
wird er dafür zuerst gespeichert. Die Ausbildungsvorbereitung zeigt die angefragten Ressourcen ihres Zeitfensters und
erlaubt ebenfalls das Anfragen.

**Rolle wechseln (Demo):** Mit einem Demo-Konto (…@demo.ch) öffnet der Name oben rechts ein Menü, das direkt zu
den anderen Demo-Konten wechselt, ohne Passwort. Das geht nur zwischen Demo-Konten, die noch das Demo-Passwort haben.

**Pendenzen:** Oben in der Ansicht «Pendenzen» weist man eine Pendenz direkt zu (Was · Wer · Bis wann) – sich selbst
und den Unterstellten: Bat Kdo allen der Kompanie, Kp Kdt allen der Kompanie, Zugführer/Log Of dem eigenen Zug, Kader
nur sich selbst. Darunter folgt der Vorbereitungs-Zeitplan.

**Teilnehmerliste:** Personen ankreuzen (oder alle) und gemeinsam einem Zug zuweisen, Diensttage setzen oder entfernen.

## Arbeitsprogramm bedienen

- **Verschieben:** Block ziehen (über Tage und – Kp Kdt – Züge). **Dauer:** obere/untere Kante ziehen.
  **Mehrere Züge:** linke/rechte Kante ziehen (Kp Kdt).
- **Neu:** im leeren Raster ziehen oder doppelklicken; «+ Block».
- **Tastatur:** Pfeile ↑↓ verschieben um das Raster, ←→ um einen Tag, Shift+↑↓ ändert die Dauer,
  Entf löscht, Enter öffnet, Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z rückgängig/wiederholen.
- **Hinweise:** Überschneidungen pro Zug (rot umrandet) und fehlende Verschiebungen zwischen Standorten.
- **Tage wählen:** «Tage ▾» blendet einzelne Tage ein/aus (pro WK im Browser gespeichert).
- **Kdo-Spalte:** pro Tag eine Spalte für Kp Kdt / Stv / AVOR; nur der Kp Kdt plant dort.
- **AVOR-Tage:** Kaderarbeitstage und KVK (auch Wochen vor dem WK) unter «Einstellungen» erfassen; sie sind
  im Raster orange markiert.
- **Standardblöcke** (Appell, Mittagessen für alle inkl. Kdo, Kaderrapport …): Titel, Art, Zeit, «Für» (alle inkl. Kdo /
  alle Züge / nur Kdo) und «fix» anpassen, Blöcke ergänzen oder entfernen; «Als Standard der Kompanie speichern»
  (Kp Kdt, Bat Kdo, Org Admin). Mit «Einfügen für» nur bestimmte Spalten wählen, z. B. einen einzelnen Zug.
  Zugführer fügen Standardblöcke in den eigenen Zug ein. Bereits bestehende gleiche Blöcke werden übersprungen.
- **Rechtsklick-Menü** (Arbeitsprogramm und Zugansicht): auf einem Block Bearbeiten, Duplizieren, Kopie am nächsten
  Tag, Fixieren/Lösen, Fahrzeug/Raum/Gelände anfragen, Löschen; in der Zugansicht zusätzlich Ausbildungsvorbereitung
  öffnen oder erstellen. Auf leerer Fläche: Neuer Block hier, Standardblöcke einfügen. Angeboten wird nur, was die
  Rolle darf.
- Kopieren aus früherem WK, Drucken (A4 quer, inkl. Legende).

## Lektionsbibliothek

Menü «Lektionsbibliothek»: alle Ausbildungsvorbereitungen des Bataillons (über alle Kompanien, Züge und WKs) für alle
Angehörigen des Bataillons lesbar.

- **Fortschritt:** gesamt (Anteil der ausgefüllten 7 Schritte), nach Kompanie und Zug sowie nach Fachbereich;
  jede Lektion zeigt ihren Stand mit den sieben Schritten.
- **Fachbereiche:** jede Ausbildungsveranstaltung kann mit Betreuung, Führungsunterstützung, Pionier und/oder
  Kulturgüterschutz markiert werden (Schritt 2 im Formular; vorgeschlagen anhand des Zugnamens).
- Suche (Thema, Ziele, Material, Leiter …), Filter nach Fachbereich, Stufe, Kompanie und Stand.
- «Ansehen» zeigt das Dokument (auch Word/JSON); «Als Vorlage verwenden» kopiert die Lektion für ein Zeitfenster des
  eigenen Zuges (Ziele, Mittel, Ablauf übernommen; Datum, Zeit und Arbeitsplatz aus dem Zeitfenster).

## Ansichten nach Rolle

- **Kader:** Startseite mit den eigenen Ausbildungsveranstaltungen (Stand der Ausbildungsvorbereitung), offenen
  Vorbereitungsschritten und dem nächsten Dienst; «Meine Ausbildungen» listet alle zugeteilten Lektionen über alle WKs.
- **Zugführer/in:** welche Ausbildungs- und Übungszeitfenster des Zuges schon eine Ausbildungsvorbereitung haben (und
  wer zugeteilt ist), Stand der Anfragen, offene Schritte; «Meine Ausbildungen» mit Umschalter «Ganzer Zug».
- **Kp Kdt / Log Of:** offene Anfragen zum Entscheiden, Ausbildungsvorbereitungen pro Zug, Vorbereitung nach Rolle.

Einer Ausbildungsvorbereitung können **mehrere Personen** zugeteilt werden (Leiter, Postenchefs); zugeteilte Kader
dürfen sie bearbeiten. Mehrere Kp Kdt, Zugführer (★ Haupt-Zugführer, weitere als Stv) und Kader pro Zug werden
unter «Organisation › Kompanien & Personal» erfasst.

## Vorbereitung

Jede Person sieht unter «Vorbereitung» die Schritte ihrer Rolle und hakt sie für sich ab (z. B. muss jede/r
Zugführer/in die Detailvorbereitung selbst erledigen). Bat Kommando und Kp Kdt sehen alle Schritte mit dem
Fortschritt pro Person; der Kp Kdt passt die Schritte eines WK an und kann fehlende Schritte aus der Vorlage
übernehmen.

Unter «Organisation › Vorlagen & Ressourcen» konfigurieren der **Org Admin** (alle Bataillone) und das **Bat Kommando** (eigenes Bataillon)
die Vorbereitung pro Bataillon (gilt für alle Kompanien), bei Bedarf eine eigene Vorlage pro Kompanie, sowie den
Katalog der Fahrzeuge, Räume und Geländeabschnitte jeder Kompanie. Pro Schritt: Titel, Beschreibung, Rolle, Termin in Tagen vor
WK-Beginn (negativ = danach). Vorlagen gelten für neu erstellte WKs. Der Org Admin sieht keine WK-Inhalte.

## Mobile Geräte

Die Oberfläche passt sich an Smartphones an (unter 768 px Breite): Menü-Knopf statt Navigation,
Dialoge im Vollbild, Arbeitsprogramm als Liste. Die Zugansicht zeigt auf dem Handy eine Tagesagenda mit
Detailplanung; ein Tipp auf ein Zeitfenster öffnet Detailplanung, Ausbildungsvorbereitungen und Anfragen.

## Briefkopf und Druckvorlagen

Alle Ausdrucke (Dossier, Arbeitsprogramm, Tagesbefehl, Ausbildungsvorbereitung inkl. Word, WK-Konzept, Zugführer-AP,
Rapport-Protokoll, Erkundungsprotokoll, Übungsunterlagen, Präsenzliste, QR-Code-Aushang) verwenden einen gemeinsamen
Briefkopf: links Amt (fett), Abteilung und Region, rechts das Logo des Kantons bzw. der Organisation; Titel in
Arial Black. Fusszeile: auf der ersten Seite die Adresse, danach der Dokumenttitel; rechts «Seite x / y»
(Chrome/Edge). Texte, Adresse und Logos stellen Org Admin und Bat Kommando unter
«Organisation › Vorlagen & Ressourcen» ein. Dort wählen sie auch den **Standard-Kartenausschnitt**: Alle Karten
(Gelände, Ressourcen, Erkundungen, Übungen) öffnen sich dort, solange noch keine Fläche eingezeichnet ist; ohne
Auswahl zeigen sie die ganze Schweiz. Der Tagesbefehl ist aufgebaut mit Datum / Erfasser / Ersetzt Dok vom,
Tabelle Zeit · Was · Wer · Ort und separaten Rapporten.

**Teilnehmerliste aus dem Personalsystem:** Der Export (Spalten Name, Vorname, Funktion, Grad, *Eff. EinrDatum,
*Eff. EntlDatum …) wird direkt erkannt. Diensttage ergeben sich aus Einrück- und Entlassdatum. Da die Datei keinen Zug
enthält, ordnet der Kp Kdt im Import-Dialog jeder Funktion einen Zug zu (Vorschläge nach Namen, z. B. KGS → KGS,
FU/Fhr Ustü → FU-Zug; Kp Kdt → ohne Zug). Die Zuordnung wird für den nächsten Import gemerkt; Personen, die schon auf
der Liste sind, behalten ihren Zug.

## Dossier (Drucken / PDF)

Tab «Dossier» im WK: stellt alle Unterlagen als druckfertiges Dokument zusammen (A4, Blockübersicht quer).

- **Kompanie** (Kp Kdt, Log Of, Bat): Deckblatt mit Logo und Region, Auftrag aus dem Ausbildungsbefehl,
  WK-Konzept / Befehl Kp Kdo, Arbeitsprogramm als Blockübersicht (so viele Tage pro Seite, dass die Blöcke lesbar
  bleiben), Fahrzeuge, Räume und Standorte.
- **Zug** (Zugführer/in, Kader, Kommando): Deckblatt, Arbeitsprogramm des Zuges mit Detailplanung,
  Zeitplan, Zugführerarbeitsprogramm, alle Ausbildungsvorbereitungen, Ressourcen des Zuges, Zielsetzungen.
- Abschnitte lassen sich einzeln abwählen. Jede Seite hat eine Fusszeile mit Region, Kompanie, (Zug), WK und Datum;
  Seitenzahlen erscheinen beim Drucken mit Chrome oder Edge. «Als PDF sichern» im Druckdialog erzeugt das PDF.

Name des Bataillons, **Zivilschutz-Region** und **Logo** pflegen Org Admin und Bat Kommando unter
«Organisation › Vorlagen & Ressourcen» (Bataillon wählen → «Region & Logo»).

## App installieren (PWA) und offline lesen

Der WK-Planer ist eine Progressive Web App. Voraussetzung im Betrieb: Auslieferung über **HTTPS**
(Service Worker laufen nur auf HTTPS oder localhost).

- **Android (Chrome, Edge, Samsung Internet):** Die App bietet «Installieren» an (Banner oder Browsermenü →
  «App installieren»). Danach startet sie wie eine App im Vollbild.
- **iPhone/iPad (Safari, iOS ≥ 16.4):** Teilen → «Zum Home-Bildschirm». Die App zeigt auf iOS einen Hinweis
  dazu an, weil Safari keinen eigenen Installationsdialog hat.
- **Offline lesen:** Alles, was einmal geladen wurde, bleibt lesbar – beim Öffnen eines WK werden zusätzlich
  alle Tabs (Vorbereitung, Konzept, Ressourcen, Kommentare) und die Ausbildungsvorbereitungen des eigenen Zuges
  vorgeladen. Ohne Verbindung erscheint ein Hinweis; Änderungen sind dann nicht möglich. Bereits angesehene
  swisstopo-Kartenausschnitte bleiben ebenfalls verfügbar.
- **Datenschutz:** Die zwischengespeicherten Daten gehören einem Benutzer und werden beim Ab- und Anmelden
  gelöscht (geteilte Geräte). Zwischengespeicherte Daten verfallen nach 30 Tagen.
- Einschränkungen iOS: kein Hintergrund-Sync; iOS kann Offline-Daten bei längerer Nichtnutzung entfernen.
- Icons neu erzeugen: `node client/scripts/make-icons.mjs`. Im Entwicklungsmodus (`npm run dev`) ist der
  Service Worker deaktiviert; testen mit `npm run build && npm start`.

## Zugansicht

Zugführer/innen und Kader sehen nur ihren Zug (Kommando-Rollen wählen einen Zug):

- **Raster:** die Zeitfenster des Zuges aus dem Grobprogramm; Zfhr/Stv verschieben und passen ihre Blöcke an.
- **Detailplanung:** im Seitenbereich das Zeitfenster in Sequenzen unterteilen (von–bis, Verantw.,
  Was/Wo/Womit – wie der Zeitplan in den Anhängen S. 21). Sequenzen wandern mit, wenn der Block verschoben wird.
- **Gruppen:** Unter «Gruppen …» teilt der Zfhr den Zug auf (z. B. Gr 1–3). Die Zugansicht zeigt dann pro Tag eine
  Spalte pro Gruppe: die Zeitfenster des Grobprogramms liegen im Hintergrund, die Sequenzen werden pro Gruppe gezogen,
  verlängert und zwischen Gruppen verschoben. Im Zeitfenster ziehen erstellt eine neue Sequenz.
- **Klonen:** Sequenz mit gedrückter Alt-/Option-Taste ziehen, oder «Klonen …» (für mehrere Gruppen parallel oder
  nacheinander).
- **Turnus:** Für eine Gruppe die Posten nacheinander planen, dann «Turnus …»: alle anderen Gruppen erhalten dieselben
  Posten im Kreis versetzt (Gr 1: Po 1-2-3, Gr 2: Po 2-3-1, Gr 3: Po 3-1-2).
- **Zeitplan:** druckbare Liste Grobprogramm + Detailplanung pro Tag.
- **Ausbildungsvorbereitung** (Handbuch-Anhänge S. 24–25, im Format des Grfhr-Formulars) pro
  Zeitfenster, vorausgefüllt aus Block und Detailplanung: sieben Schritte (Eckdaten, Thema & Grundlagen,
  Ausbildungsstufe, Zielsetzung, Mittel, Ablauf, Controlling) mit Fortschrittsanzeige. Der Ablauf wird über die
  Dauer der Schritte geplant; die Uhrzeiten ergeben sich aus «Zeit von», ein Zeitbalken zeigt, ob die Lektion ins
  Zeitfenster passt. Ausgabe als A4-Dokument (Drucken / PDF) und als Word-Datei; Export/Import als JSON im Format
  des eigenständigen Grfhr-Formulars (Dateien daraus lassen sich übernehmen).
- **Verantwortlich / Leiter** werden aus den Personen des Zuges gewählt (Zfhr, Stv, Kader; in der Kdo-Spalte das
  Kommando). Früher frei eingetragene Namen bleiben erhalten.
- **Anfragen** für Fahrzeuge, Räume und Gelände direkt aus dem Zeitfenster.

## Fahrzeuge, Räume, Gelände

Tab «Ressourcen»: Kp Kdt und Log Of pflegen den Katalog der Kompanie (Geländeabschnitte als Fläche auf der
swisstopo-Landeskarte bzw. dem Luftbild) und bewilligen oder lehnen Anfragen ab. Zugführer/innen fragen an;
für Gelände kann ein Abschnitt aus dem Katalog gewählt oder eine eigene Fläche gezeichnet werden.
Doppelbelegungen werden markiert; eine überschneidende Bewilligung derselben Ressource wird verweigert.
Karten: © swisstopo (WMTS und Ortssuche von geo.admin.ch, Internetverbindung nötig).

**Anfragen nach Anzahl:** Fahrzeuge und Räume werden in der Regel nach Typ und Anzahl angefragt (z. B. «2×
Mannschaftsbus»); ein bestimmtes Fahrzeug bzw. ein bestimmter Raum nur bei besonderen Anforderungen. Der Typ wird
im Katalog pro Ressource gepflegt. Beim Anfragen zeigt die App, wie viele im Zeitraum frei sind. Beim Bewilligen
teilen Log Of oder Kp Kdt die konkreten Fahrzeuge/Räume zu (die ersten freien sind vorgewählt); reichen sie nicht
aus, wird die Bewilligung verweigert. Zugeteilte Fahrzeuge erscheinen im Belegungsplan und in der Materialübersicht.

**Fahrzeuge nach Anzahl Personen:** Für Transporte wird statt eines Fahrzeugtyps die Anzahl Personen angefragt
(z. B. «30 Personen», optional mit Fahrzeugtyp). Vorgeschlagen wird der Sollbestand des Zuges an diesem Tag. Im
Katalog hat jedes Fahrzeug «Sitzplätze» (bestehende Einträge wurden aus der Kapazität, z. B. «9 Pl.», übernommen).
Beim Bewilligen werden möglichst wenige freie Fahrzeuge vorgeschlagen, bis alle Platz haben; Log Of oder Kp Kdt
können die Auswahl ändern, solange die Plätze reichen.

**In der Ausbildungsvorbereitung** schlagen die Felder «Arbeitsplatz» und «Fahrzeug» die bewilligten Räume,
Geländeabschnitte und Fahrzeuge des Zuges für Tag und Zeit der Lektion vor; ein Klick übernimmt den Namen.

**Import / Export:** Katalog (Organisation und Ressourcen), Vorbereitungsvorlagen und die Vorbereitungsschritte eines
WK lassen sich als Excel (.xlsx) oder JSON exportieren und importieren («Import / Export»). Spalten werden über die
Kopfzeile erkannt (z. B. Art, Typ, Bezeichnung, Kapazität, Beschreibung / Ausstattung, Gehört zu).

**Material des Bataillons:** Fahrzeuge (und bei Bedarf Räume oder Gelände) können dem Bataillon gehören statt einer
Kompanie. Dieses Material pflegen Org Admin und Bat Kommando unter «Organisation › Vorlagen & Ressourcen» (Bataillon wählen); alle
Kompanien des Bataillons sehen es in ihrem Katalog (Kennzeichnung «Bataillon») und können es anfragen. Anfragen
anderer Kompanien für dasselbe Fahrzeug zur selben Zeit werden beim Anfragen und in der Liste angezeigt; eine
überschneidende Bewilligung wird über alle Kompanien hinweg verweigert. Die **Materialübersicht** des Bataillons
zeigt alle Belegungen pro Fahrzeug, Raum und Geländeabschnitt mit Doppelbelegungen.

**Belegungsplan (Ressourcen über die Zeit):** Im Tab «Ressourcen» zeigt der Belegungsplan pro Fahrzeug, Raum und
Geländeabschnitt die Anfragen über die WK-Tage (bewilligt grün, beantragt gelb, andere Kompanien grau,
Doppelbelegungen rot umrandet; «nur mein Zug» für Zugführer). Die Materialübersicht des Bataillons hat dieselbe
Zeitachse wochenweise. Im **Arbeitsprogramm** und in der Zugansicht erscheinen die angefragten Ressourcen als
Symbole auf den Blöcken (ein-/ausblendbar mit «Ressourcen»), auch in der Liste und beim Drucken.
- Gleichzeitiges Arbeiten: Änderungen anderer erscheinen nach ≤10 s; Konflikte werden über
  Versionsnummern erkannt.

## Erkundungen

Tab «Erkundungen»: Erkundungsprotokoll nach Anhänge S. 33–38 – Kopf (Datum, Formation, Ort, Koordinaten, Dauer,
Ansprechpersonen), 1. Erhaltene Aufträge, 2. Skizze (Fotos der Handskizze als Bilder, Fläche auf der Landeskarte),
3. Gefahren (Mensch, Material, Methode, Mitwelt), 4. Risikobeurteilung (Risiko, Massnahmen nach STOP, wer,
Restrisiko; Gesamtbeurteilung hoch/mittel/tief), 5. Notfallorganisation (144, 1414 vorbelegt), 6. Beschreibung der
Arbeit, 7. Logistik, 8. Checkliste (alle Punkte des Formulars: erledigt / offen / n. a. mit Bemerkung), 9. Notizen.
Wird automatisch gespeichert und im Layout des Formulars gedruckt. Kp-Erkundungen erstellt der Kp Kdt, Zugs-
Erkundungen Zugführer und Kader des Zuges.

## Übungen

Tab «Übungen»; «Übung»-Blöcke des Arbeitsprogramms erscheinen zum Vorbereiten (übernimmt Titel, Zeit, Ort, Beübte).
- **Übungskonzept:** Art, Datum/Zeit, Übungsraum (auch auf der Karte), Beübte, Übungsleitung, Zweck, Übungsziele,
  Ausgangslage, Übungsanlage/Phasen, Mittel, Sicherheit, Beobachter, Verbindungen, Besonderes.
- **Drehbuch:** Einspielungen mit Zeit, von, an, Meldung/Ereignis, erwartete Reaktion, Mittel; während der Übung
  abhaken. Nur für die Übungsleitung und den Kp Kdt sichtbar – die Beübten sehen es nicht.
- **Übungsunterlagen:** Lage, Auftrag und Hinweise für die Beübten sowie Dokumente (Lagekarten, Formulare …).
- **Übungsbesprechung:** Zielerreichung pro Übungsziel und After Action Review (Verlauf, gut, zu verbessern,
  Massnahmen).
Jeder Teil lässt sich einzeln drucken. Im Handbuch (S. 44) wird für Details auf den «Behelf Anlegen und Durchführen
von Einsatzübungen» verwiesen; die Gliederung hier folgt dem üblichen Aufbau.

## Tagesbefehl

Tab «Tagesbefehl»: pro Tag automatisch aus der Planung zusammengestellt – Tagesprogramm (Arbeitsprogramm mit Wer,
Ort, Verantwortlich), Standorte, Verpflegung (Zeiten, eingecheckte Personen mit Menüs und Unverträglichkeiten, sonst
Sollbestand), bewilligte Fahrzeuge/Räume/Gelände, Bestand, Rapporte und Übungen, heute fällige Pendenzen.
Kp Kdt und Log Of ergänzen Tagesverantwortliche/n, Tenue, Erreichbarkeit, Sicherheit und besondere Anordnungen.
«Diesen Tag drucken» oder «Alle Tage drucken» (eine A4-Seite pro Tag).

## Anhänge und Dateien

- **Anhänge zur Ausbildungsvorbereitung** (Präsentation, Merkblatt, Fotos …): hochladen und löschen, wer die
  Ausbildungsvorbereitung bearbeiten darf; lesen alle, die sie sehen – auch über die Lektionsbibliothek. «Als Vorlage
  verwenden» übernimmt die Anhänge. 📎 zeigt die Anzahl in den Listen.
- **Dateien pro Zug** (Tab «Dateien»): Ablage über alle WKs. Hochladen: Angehörige des Zuges und Kp Kdo; löschen:
  wer hochgeladen hat, Zugführer, Kp Kdt; Kader sehen nur ihren Zug.
- Max. 25 MB pro Datei, Hochladen per Knopf oder Ziehen. Die Dateien liegen in PostgreSQL (in der Sicherung
  enthalten). PDF, Bilder, Video und Text öffnen im Browser, alles andere wird heruntergeladen.

## Rapporte und Pendenzen

Tab «Rapporte»: Protokolle nach dem Schema des Handbuchs Führung im Zivilschutz (S. 35, 59–60). Beim Anlegen
wird die Traktandenliste gewählt: Rapport in der Ausbildungsvorbereitung, in der Ausbildungsdurchführung
(Kaderrapport), vor dem Einsatzbeginn, während des Einsatzes, Befehlsausgabe (O-A-A-B-S) oder frei. Traktanden
lassen sich umbenennen, verschieben, ergänzen und entfernen.

- **Wer:** Kp Kdt führt Rapporte der Kompanie, Zugführer/innen die ihres Zuges. Bearbeiten dürfen zusätzlich
  Leitung und Protokollführer/in. Kp-Rapporte sieht die ganze Kompanie, Zugsrapporte der Zug und das Kp Kdo.
- **Aus dem Arbeitsprogramm:** «Rapport»-Blöcke ohne Protokoll erscheinen oben; «Protokoll anlegen» übernimmt
  Titel, Datum und Zeit. Vor dem WK und an AVOR-Tagen wird das Vorbereitungs-Schema vorgeschlagen, sonst der
  Kaderrapport.
- **Protokoll:** Kopf (Datum, Zeit, Ort, Leitung, Protokoll, Teilnehmende, Abwesende, Gäste) und Notizen pro
  Traktandum; alles wird automatisch gespeichert. «Abschliessen» sperrt das Protokoll, «Wieder öffnen» gibt es frei.
  «Drucken / PDF» erzeugt ein Protokoll mit nummerierter Pendenzenliste. «Folgerapport» übernimmt Schema, Ort und
  Teilnehmende.
- **Pendenzen** (Was, Wer, Bis wann) werden direkt beim Traktandum erfasst. Die verantwortliche Person hakt sie ab;
  bearbeiten können die Bearbeitenden des Rapports. Unter «Stand der Arbeiten» erscheinen die offenen Pendenzen
  früherer Rapporte; die Liste aller Pendenzen (offen / meine / alle) steht unter «Rapporte», die eigenen offenen
  auf der Startseite.
- **Daten aus dem Planer:** «Stand der Arbeiten» zeigt eingecheckte und geplante Personen des Tages,
  «Logistische Belange» Verpflegung (Menüs, Unverträglichkeiten) und bewilligte Transporte.

## Personal: Bestand, Teilnehmerliste, Präsenz

Tab «Personal» (Bat, Kp Kdt, Log Of, Zugführer/in; Zugführer sehen ihren Zug):

- **Bestand:** Soll- und Istbestand jedes Zuges nach Zugführer, Kader und Soldaten. Erfasst in der
  «Organisation › Kompanien & Personal» («Bestand bearbeiten» beim Zug; Bat Kommando oder Kp Kdt), angezeigt mit Differenz.
- **Geplante Personen pro Tag:** pro Zug (und Kdo) und Tag. Kp Kdt bearbeitet alle Züge, Zugführer den eigenen.
  «Istbestand übernehmen» trägt den Istbestand an allen Diensttagen ein, «Aus Teilnehmerliste übernehmen»
  zählt die Personen der Liste.
- **Teilnehmerliste:** Import aus Excel/JSON (Personalsystem). Erkannte Spalten: Nachname, Vorname, Grad,
  Funktion, Zug, E-Mail, Nummer (z. B. AHV-Nr.), Tage (leer = ganzer WK). «Zusammenführen» aktualisiert bekannte
  Personen (nach Nummer oder Name), «Liste ersetzen» entfernt zusätzlich fehlende. Das genaue Format des
  Personalsystems wird ergänzt, sobald eine Beispieldatei vorliegt.
- **QR-Codes (Kp Kdt):** ein Code pro Tag zum Aushängen oder Zeigen; standardmässig nur an diesem Tag offen
  (manuell öffnen/schliessen, «Neuer Code» macht den alten ungültig). Das Formular (`/checkin/…`, ohne Login)
  fragt Vor- und Nachname, E-Mail, Zug, Essen (Normal, Kein Schwein, Vegetarisch) und Unverträglichkeiten ab
  und merkt sich die Angaben auf dem Handy für die nächsten Tage.
- **Abgleich:** eindeutige Übereinstimmung per E-Mail oder Name (Gross/Klein, Akzente und ä/ae egal, auch
  vertauscht) → eingecheckt. Sonst erscheint der Check-in unter «Nicht zugeordnete Check-ins», wo der Kp Kdt
  ihn einer Person zuordnet (mit Vorschlägen), die Person neu auf die Liste nimmt oder ihn löscht.
- **Sanitarische Eintrittsbefragung** (Weisungen BABS über die Sicherheitsvorschriften im Zivilschutz, Art. 6):
  Beim ersten Check-in im WK kreuzt jede Person an, welche Punkte nach Art. 6 Abs. 2 zutreffen (ärztliches Zeugnis,
  schwere Krankheit/Unfall, Gesundheitsschädigung, ansteckende Krankheit, dem Dienst nicht gewachsen), oder
  bestätigt, dass keiner zutrifft. Ohne Antwort nimmt der Server den Check-in nicht an. Wer etwas ankreuzt,
  erscheint im Bereich «Eintrittsbefragung» als Meldung: der Kp Kdt führt die Person dem Kursarzt zu und trägt die
  angeordneten Einschränkungen ein. Die Angaben selbst sieht nur der Kp Kdt; Zugführer sehen die Einschränkungen
  ihrer Leute (Art. 6 Abs. 3), auch in der Präsenzliste. Wer von Hand präsent gesetzt wurde, erscheint unter
  «Anwesend, noch nicht befragt» und wird mündlich befragt und erfasst.
- **Präsenz:** pro Tag Soll / Liste / Anwesend / Fehlend pro Zug, Präsenzliste (drucken; Kp Kdt und Zugführer
  können Personen von Hand abhaken) und Verpflegung (Anzahl pro Menü, Liste der Unverträglichkeiten).
- **Übersicht:** Kp Kdt und Zugführer sehen auf der Startseite geplant / auf Liste / anwesend pro Zug für heute
  (vor dem WK: erster WK-Tag).

Der Check-in per Handy setzt voraus, dass der Planer unter einer Adresse läuft, die Handys erreichen
(Netzwerk/Internet, siehe [INSTALL.md › Betrieb](../INSTALL.md#betrieb-auf-einem-server)); unter `localhost` zeigt die App einen Hinweis.
