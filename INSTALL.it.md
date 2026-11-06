# Installazione ed esercizio

[Deutsch](INSTALL.md) · [Français](INSTALL.fr.md) · **Italiano** · [English](INSTALL.en.md)

- [Provare con Docker](#provare-con-docker)
- [Sviluppo](#sviluppo)
- [Prima configurazione](#prima-configurazione)
- [Esercizio su un server](#esercizio-su-un-server)
- [Impostazioni](#impostazioni)
- [Prima della messa in esercizio](#prima-della-messa-in-esercizio)
- [Demo nel browser (GitHub Pages)](#demo-nel-browser-github-pages)
- [Test](#test)

## Provare con Docker

Requisito: [Docker](https://docs.docker.com/get-docker/) con Compose.

```bash
git clone https://github.com/dllb-ch/WK-Planer.git
cd WK-Planer
docker compose up -d --build
```

Aprire poi <http://localhost:8080>. Questa configurazione di avvio rapido riempie la banca dati vuota al primo avvio
con un CR d'esempio (`SEED_DEMO=1`, dati demo in tedesco).
Accedere con un account demo, password `zivilschutz`:

| Ruolo | E-mail |
|---|---|
| Cdo bat | `bat@demo.ch` |
| Cdt cp | `kpkdt@demo.ch` |
| Caposezione | `zfhr1@demo.ch` (Pi Z 1), `zfhr2@demo.ch`, `zfhr3@demo.ch`, `zfhrlog@demo.ch` |
| Quadri (capogruppo) | `kader@demo.ch`, `kader2@demo.ch` |
| Uff log | `logof@demo.ch` |
| Admin org (modelli) | `admin@demo.ch` |

In alto a destra, con gli account demo si può cambiare ruolo. Terminare con `docker compose down`
(`docker compose down -v` elimina anche i dati).

## Sviluppo

Requisiti: [Node.js](https://nodejs.org) dalla versione 22.13; Docker è facoltativo.

```bash
npm install
npm run dev        # API su :3001, app su http://localhost:5173 (con ricaricamento automatico)
```

Senza altre impostazioni il server salva i dati con [PGlite](https://pglite.dev) (PostgreSQL come WebAssembly) nella
cartella `server/data/pglite` – non serve un server di banca dati. Con un proprio PostgreSQL:

```bash
docker compose up -d db                                                     # PostgreSQL 16 su 127.0.0.1:54329
echo 'DATABASE_URL=postgres://zs:zs@127.0.0.1:54329/zs' > server/.env
npm run dev
```

Una banca dati vuota apre nel browser la [configurazione](#prima-configurazione); `SEED_DEMO=1 npm run dev` la riempie
invece subito con i dati demo. `npm run seed` riporta la banca dati ai dati demo.

Lo schema si trova in `server/src/sql/schema.sql` e viene creato o completato all'avvio (`… IF NOT EXISTS`).
L'SQL si scrive con segnaposto `?`; `server/src/db.ts` li traduce per PostgreSQL.

## Prima configurazione

Un'installazione vuota mostra, invece dell'accesso, un assistente che crea l'organizzazione in un solo passaggio:

<p align="center"><img src="docs/media/einrichtung.gif" alt="Assistente di configurazione di una nuova installazione" width="760"></p>

1. **Battaglione:** nome, regione, intestazione dei documenti (ufficio, sezione, indirizzo, telefono, sito web) e
   loghi.
2. **Compagnie e sezioni** con l'effettivo regolamentare per sezione (capisezione, quadri, militi).
3. **Persone:** il proprio account (cdo bat) e, se desiderato, cdt cp e capisezione con una password iniziale comune,
   che modificano in «Il mio account».
4. **Risorse:** veicoli, rimorchi, locali e terreni – per compagnia o per il battaglione.
5. **Carta:** la zona in cui si aprono tutte le carte.

Poi si è collegati come cdo bat; il calendario di preparazione viene creato con il modello standard. Tutto il resto
(gruppi, quadri, uff log, superfici di terreno, modelli propri) segue in «Organizzazione». Invece della propria
organizzazione si può anche caricare la demo. Non appena esiste un account, la configurazione è bloccata.

L'assistente appare nella lingua del browser; i testi standard (calendario di preparazione, trattande dei rapporti)
vengono creati in questa lingua.

Se un'installazione vuota è raggiungibile pubblicamente, va impostato `SETUP_TOKEN`: l'assistente chiede allora questo
codice, affinché nessun altro configuri l'installazione per primo.

## Esercizio su un server

Il `Dockerfile` costruisce l'app; il server la distribuisce. Per un server con HTTPS, in `deploy/` c'è un modello per
[Traefik](https://traefik.io) con app e PostgreSQL. Si aspetta una rete Docker `proxy` condivisa con Traefik, gli
entrypoint `http`/`https` e un middleware `redirect-https` – con altri nomi, adattare le label in
`deploy/docker-compose.yml`.

```bash
cd deploy
cp .env.example .env          # inserire dominio, password e resolver dei certificati
docker compose up -d --build  # anche dopo ogni aggiornamento del codice
docker compose logs -f app
```

Backup e ripristino della banca dati:

```bash
docker compose exec db pg_dump -U zs zs | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-2026-11-05.sql.gz | docker compose exec -T db psql -U zs zs
```

Senza Traefik basta il `docker-compose.yml` nella cartella principale dietro un qualsiasi reverse proxy con HTTPS
(porta 8080, impostare `TRUST_PROXY=1`).

## Impostazioni

| Variabile | Significato |
|---|---|
| `DATABASE_URL` | Connessione PostgreSQL; senza, il server usa PGlite in `PGLITE_DIR` |
| `PGLITE_DIR` | Cartella della banca dati PGlite (predefinita `server/data/pglite`) |
| `API_PORT` | Porta del server (predefinita 3001, 8080 nel container) |
| `GATE_PASSWORD`, `GATE_USER` | Protezione facoltativa con password (HTTP Basic Auth) davanti a tutta l'app; il check-in con codice QR resta libero. Dopo 10 tentativi falliti un indirizzo è bloccato per 15 minuti |
| `TRUST_PROXY` | `1` dietro un reverse proxy (indirizzi corretti per i blocchi d'accesso) |
| `SETUP_TOKEN` | Codice per la [prima configurazione](#prima-configurazione) di un'installazione vuota |
| `SEED_DEMO` | `1`: riempire all'avvio una banca dati vuota con i dati demo invece di mostrare la configurazione |
| `DOMAIN`, `TRAEFIK_CERTRESOLVER`, `POSTGRES_PASSWORD` | Solo per `deploy/docker-compose.yml` |

Per lo sviluppo le variabili stanno in `server/.env`, sul server in `deploy/.env`.

## Prima della messa in esercizio

1. Avviare con una banca dati vuota e seguire la [prima configurazione](#prima-configurazione) – oppure, se si è
   iniziato con i dati demo, eliminare gli account demo o cambiarne le password («Organizzazione › Compagnie e
   personale»).
2. Completare gruppi, altri utenti (quadri, uff log) e modelli.
3. Impostare intestazione, indirizzo e loghi in «Organizzazione › Modelli e risorse», così come veicoli, locali e
   terreni.
4. Per il check-in con il telefono l'app deve essere raggiungibile a un indirizzo che i telefoni possono aprire (con
   `localhost` l'app mostra un avviso).
5. Predisporre backup regolari della banca dati.

## Demo nel browser (GitHub Pages)

`npm run build:demo` costruisce una versione in cui il server gira nel browser: PGlite salva i dati nell'IndexedDB del
browser e la pagina stessa risponde alle richieste verso `/api/…` (`client/src/demo/`). Ogni visitatore ha i propri
dati demo; «Reimposta la demo» (in basso a sinistra) ricomincia da capo. La pagina d'accesso collega con un clic in un
ruolo. Non sono inclusi la protezione con password davanti all'app né il check-in da un altro dispositivo (il codice
QR rimanda allo stesso browser).

Il workflow `.github/workflows/pages.yml` pubblica la demo a ogni push su `main`. Una sola volta, in
*Settings › Pages › Source*, scegliere «GitHub Actions». Provare in locale:

```bash
npm run build:demo
npm run preview -w client -- --mode demo      # http://localhost:4173/WK-Planer/
```

## Test

```bash
npm test             # Vitest: diritti, regole di pianificazione e API (PGlite in memoria, nuova per ogni test)
TEST_DATABASE_URL=postgres://… npm test   # gli stessi test su un server PostgreSQL (lo schema viene svuotato!)
npm run typecheck
npm run test:e2e     # Playwright (prima, una sola volta: npx playwright install chromium)
```

Le animazioni del README sono create con `docs/media/record.mjs` a partire da un'istanza demo (istruzioni all'inizio
del file).
