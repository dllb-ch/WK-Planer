# WK-Planer Zivilschutz

Web-App zur Planung von Wiederholungskursen (WK) im Schweizer Zivilschutz – vom Ausbildungsbefehl des Bataillons
über das Arbeitsprogramm der Kompanie bis zum Check-in am ersten Diensttag. Aufgebaut nach dem *Handbuch Führung im
Zivilschutz* des Bundesamts für Bevölkerungsschutz (BABS).

Mehrere Personen planen gleichzeitig, jede Rolle mit ihren eigenen Rechten: Bat Kommando, Kp Kdt, Log Of,
Zugführer und Kader. Läuft im Browser auf Computer, Tablet und Handy, lässt sich als App installieren und
funktioniert im hellen und dunklen Modus.

**[Demo im Browser ausprobieren →](https://dllb-ch.github.io/WK-Planer/)** – ohne Installation und ohne Konto: Rolle
wählen und loslegen. Die Demo läuft vollständig im Browser; Änderungen bleiben auf dem eigenen Gerät.

## Funktionen

### Check-in per QR-Code

Ein QR-Code pro Diensttag zum Aushängen. Die Teilnehmenden checken mit dem Handy ein – ohne Konto, in wenigen
Sekunden – und beantworten dabei die sanitarische Eintrittsbefragung. Die App gleicht sie mit der Teilnehmerliste
ab und zählt die Verpflegung. Ab dem zweiten Tag genügt ein Tipp.

<p align="center"><img src="docs/media/checkin.gif" alt="Check-in auf dem Handy" width="320"></p>

### Jahresplanung

AVOR-, KVK- und WK-Tage aller Kompanien eines Jahres. In der Monatsansicht plant das Bat Kommando Tage per
Mausziehen wie in einer Tabelle – pro Zug, pro Funktion (Zugführer, Kader, Soldaten) oder pro Gruppe – mit Ist-
und Sollbestand daneben.

<p align="center"><img src="docs/media/jahresplanung.gif" alt="Jahresplanung: Tage pro Funktion planen" width="860"></p>

### Arbeitsprogramm

Das Arbeitsprogramm der Kompanie als Raster: Tage mit je einer Spalte pro Zug. Blöcke werden gezeichnet, verschoben
und in der Länge verändert; Zugführer planen ihren Zug, das Kommando gibt fixe Blöcke vor. Das Rechtsklick-Menü
dupliziert, kopiert auf den nächsten Tag, fixiert oder fragt Fahrzeuge und Räume an. Konflikte werden angezeigt.

<p align="center"><img src="docs/media/arbeitsprogramm.gif" alt="Arbeitsprogramm: Block verschieben und kopieren" width="860"></p>

### Fahrzeuge, Räume und Gelände

Zugführer fragen Fahrzeuge (nach Anzahl Personen), Räume und Gelände für ihre Zeitfenster an; der Kp Kdt bewilligt
und teilt zu. Der Belegungsplan zeigt Auslastung und Doppelbelegungen – auch über die Kompanien des Bataillons.

<p align="center"><img src="docs/media/ressourcen.gif" alt="Ressourcen: Anfrage bewilligen und Fahrzeuge zuteilen" width="860"></p>

### Ausserdem

- **Planungskette:** Ausbildungsbefehl des Bataillons → WK-Konzept der Kompanie → Arbeitsprogramm →
  Zugführerarbeitsprogramm, gesteuert durch einen Vorbereitungs-Zeitplan mit Pendenzen pro Rolle.
- **Ausbildungsvorbereitungen** (Lektionen) mit Zielen, Ablauf und Zeitkontrolle; Lektionsbibliothek des Bataillons.
- **Erkundungen, Übungen** (Konzept, Drehbuch, Besprechung) und automatischer **Tagesbefehl**.
- **Rapporte** mit Traktanden nach Handbuch, Protokoll und Pendenzen.
- **Personal:** Sollbestand pro Zug und Tag, Teilnehmerliste aus Excel, Präsenzliste, Gruppen pro Zug.
- **Dossier:** alle Unterlagen eines WK als PDF mit eigenem Briefkopf und Logo.
- **Offline lesen** als installierte App (PWA); alles Weitere im [Handbuch](docs/handbuch.md).

## Schnellstart

```bash
git clone https://github.com/dllb-ch/WK-Planer.git
cd WK-Planer
docker compose up -d --build
```

Danach <http://localhost:8080> öffnen und mit `kpkdt@demo.ch` (Passwort `zivilschutz`) anmelden – die App startet
mit einem Beispiel-WK und Demo-Konten für alle Rollen.

Oder ohne Docker direkt im Browser: [Demo](https://dllb-ch.github.io/WK-Planer/).

## Dokumentation

- **[Installation und Betrieb](INSTALL.md):** Docker, Entwicklung, erste Einrichtung, Server mit HTTPS, Einstellungen, Tests
- **[Handbuch](docs/handbuch.md):** alle Funktionen und ihre Bedienung, nach Rolle

## Technik

- **Client:** React 18, TypeScript, Vite, TanStack Query, Tailwind CSS; installierbar als PWA
- **Server:** Node.js, Express, zod, PostgreSQL (oder PGlite)
- **Gemeinsam:** Typen und Berechtigungen in `shared/` – die Rechte werden im Server geprüft und im Client gespiegelt

```
client/   Oberfläche (Planer: client/src/features/arbeitsprogramm/)
server/   API und Datenbank (Schema: server/src/sql/schema.sql)
shared/   Typen, Berechtigungen, Planungsregeln
docs/     Handbuch und Animationen
```

## Mitmachen

Fehler und Ideen gerne als Issue, Änderungen als Pull Request – mit Tests (`npm test`) und Typprüfung
(`npm run typecheck`), siehe [INSTALL.md](INSTALL.md#tests).

Der WK-Planer ist ein unabhängiges Projekt und kein offizielles Produkt des BABS oder eines Kantons.

## Lizenz

[MIT](LICENSE)
