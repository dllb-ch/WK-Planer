# Installation und Betrieb

- [Ausprobieren mit Docker](#ausprobieren-mit-docker)
- [Entwicklung](#entwicklung)
- [Betrieb auf einem Server](#betrieb-auf-einem-server)
- [Einstellungen](#einstellungen)
- [Vor dem produktiven Einsatz](#vor-dem-produktiven-einsatz)
- [Demo im Browser (GitHub Pages)](#demo-im-browser-github-pages)
- [Tests](#tests)

## Ausprobieren mit Docker

Voraussetzung: [Docker](https://docs.docker.com/get-docker/) mit Compose.

```bash
git clone https://github.com/dllb-ch/WK-Planer.git
cd WK-Planer
docker compose up -d --build
```

Danach <http://localhost:8080> öffnen. Beim ersten Start füllt die App die leere Datenbank mit einem Beispiel-WK.
Anmelden mit einem Demo-Konto, Passwort `zivilschutz`:

| Rolle | E-Mail |
|---|---|
| Bat Kommando | `bat@demo.ch` |
| Kp Kdt | `kpkdt@demo.ch` |
| Zugführer | `zfhr1@demo.ch` (Pi Z 1), `zfhr2@demo.ch`, `zfhr3@demo.ch`, `zfhrlog@demo.ch` |
| Kader (Gruppenführer) | `kader@demo.ch`, `kader2@demo.ch` |
| Log Of | `logof@demo.ch` |
| Org Admin (Vorlagen) | `admin@demo.ch` |

Oben rechts lässt sich mit Demo-Konten die Rolle wechseln. Beenden mit `docker compose down`
(`docker compose down -v` löscht auch die Daten).

## Entwicklung

Voraussetzungen: [Node.js](https://nodejs.org) ab Version 22.13; Docker ist optional.

```bash
npm install
npm run dev        # API auf :3001, App auf http://localhost:5173 (mit Live-Reload)
```

Ohne weitere Einstellung speichert der Server die Daten mit [PGlite](https://pglite.dev) (PostgreSQL als
WebAssembly) im Ordner `server/data/pglite` – es braucht keinen Datenbank-Server. Mit einem eigenen PostgreSQL:

```bash
docker compose up -d db                                                     # PostgreSQL 16 auf 127.0.0.1:54329
echo 'DATABASE_URL=postgres://zs:zs@127.0.0.1:54329/zs' > server/.env
npm run dev
```

`npm run seed` setzt die Datenbank auf die Demo-Daten zurück.

Das Schema steht in `server/src/sql/schema.sql` und wird beim Start angelegt bzw. ergänzt (`… IF NOT EXISTS`).
SQL wird mit `?`-Platzhaltern geschrieben; `server/src/db.ts` übersetzt sie für PostgreSQL.

## Betrieb auf einem Server

Das `Dockerfile` baut die App; der Server liefert sie mit aus. Für einen Server mit HTTPS liegt in `deploy/` eine
Vorlage für [Traefik](https://traefik.io) mit App und PostgreSQL. Sie erwartet ein Docker-Netzwerk `proxy`, das
Traefik mitbenutzt, die Entrypoints `http`/`https` und eine Middleware `redirect-https` – bei anderen Namen die
Labels in `deploy/docker-compose.yml` anpassen.

```bash
cd deploy
cp .env.example .env          # Domain, Passwörter, Zertifikats-Resolver eintragen
docker compose up -d --build  # auch nach jedem Update des Codes
docker compose logs -f app
```

Sicherung und Wiederherstellung der Datenbank:

```bash
docker compose exec db pg_dump -U zs zs | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-2026-11-05.sql.gz | docker compose exec -T db psql -U zs zs
```

Ohne Traefik genügt die `docker-compose.yml` im Hauptordner hinter einem beliebigen Reverse Proxy mit HTTPS
(Port 8080, `TRUST_PROXY=1` setzen).

## Einstellungen

| Variable | Bedeutung |
|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung; ohne sie verwendet der Server PGlite in `PGLITE_DIR` |
| `PGLITE_DIR` | Ordner der PGlite-Datenbank (Standard `server/data/pglite`) |
| `API_PORT` | Port des Servers (Standard 3001, im Container 8080) |
| `GATE_PASSWORD`, `GATE_USER` | Optionaler Passwortschutz (HTTP Basic Auth) vor der ganzen App; der QR-Check-in bleibt frei. Nach 10 Fehlversuchen ist eine Adresse 15 Minuten gesperrt |
| `TRUST_PROXY` | `1` hinter einem Reverse Proxy (richtige Adressen für Login-Sperren) |
| `DOMAIN`, `TRAEFIK_CERTRESOLVER`, `POSTGRES_PASSWORD` | Nur für `deploy/docker-compose.yml` |

Für die Entwicklung stehen die Variablen in `server/.env`, auf dem Server in `deploy/.env`.

## Vor dem produktiven Einsatz

1. Demo-Konten löschen oder ihre Passwörter ändern («Organisation › Kompanien & Personal»).
2. Eigenes Bataillon, Kompanien, Züge und Gruppen erfassen, Benutzer anlegen.
3. Briefkopf, Adresse und Logos unter «Organisation › Vorlagen & Ressourcen» einstellen, ebenso Fahrzeuge, Räume
   und Gelände.
4. Für den Check-in per Handy muss die App unter einer Adresse erreichbar sein, die die Handys öffnen können
   (unter `localhost` zeigt die App einen Hinweis).
5. Regelmässige Sicherungen der Datenbank einrichten.

## Demo im Browser (GitHub Pages)

`npm run build:demo` baut eine Fassung, in der der Server im Browser läuft: PGlite speichert die Daten in der
IndexedDB des Browsers, Anfragen an `/api/…` beantwortet die Seite selbst (`client/src/demo/`). Jeder Besucher hat
seine eigenen Demo-Daten; «Demo zurücksetzen» (unten links) beginnt neu. Die Anmeldeseite meldet mit einem Klick als
Rolle an. Nicht dabei sind der Passwortschutz vor der App und der Check-in von einem anderen Gerät (der QR-Code
zeigt auf denselben Browser).

Der Workflow `.github/workflows/pages.yml` veröffentlicht die Demo bei jedem Push auf `main`. Einmalig unter
*Settings › Pages › Source* «GitHub Actions» wählen. Lokal ausprobieren:

```bash
npm run build:demo
npm run preview -w client -- --mode demo      # http://localhost:4173/WK-Planer/
```

## Tests

```bash
npm test             # Vitest: Berechtigungen, Planungsregeln und API (PGlite im Speicher, je Test neu)
TEST_DATABASE_URL=postgres://… npm test   # dieselben Tests gegen einen PostgreSQL-Server (Schema wird geleert!)
npm run typecheck
npm run test:e2e     # Playwright (vorher einmalig: npx playwright install chromium)
```

Die Animationen im README entstehen mit `docs/media/record.mjs` aus einer Demo-Instanz (Anleitung im Kopf der Datei).
