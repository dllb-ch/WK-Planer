# Installation et exploitation

[Deutsch](INSTALL.md) · **Français** · [Italiano](INSTALL.it.md) · [English](INSTALL.en.md)

- [Essayer avec Docker](#essayer-avec-docker)
- [Développement](#développement)
- [Première configuration](#première-configuration)
- [Exploitation sur un serveur](#exploitation-sur-un-serveur)
- [Paramètres](#paramètres)
- [Avant la mise en service](#avant-la-mise-en-service)
- [Démo dans le navigateur (GitHub Pages)](#démo-dans-le-navigateur-github-pages)
- [Tests](#tests)

## Essayer avec Docker

Prérequis : [Docker](https://docs.docker.com/get-docker/) avec Compose.

```bash
git clone https://github.com/dllb-ch/WK-Planer.git
cd WK-Planer
docker compose up -d --build
```

Ouvrir ensuite <http://localhost:8080>. Cette configuration de démarrage rapide remplit la base de données vide au
premier démarrage avec un CR d'exemple (`SEED_DEMO=1`, données de démonstration en allemand).
Se connecter avec un compte de démonstration, mot de passe `zivilschutz` :

| Rôle | E-mail |
|---|---|
| Cdmt bat | `bat@demo.ch` |
| Cdt cp | `kpkdt@demo.ch` |
| Chef de section | `zfhr1@demo.ch` (Pi Z 1), `zfhr2@demo.ch`, `zfhr3@demo.ch`, `zfhrlog@demo.ch` |
| Cadres (chef de groupe) | `kader@demo.ch`, `kader2@demo.ch` |
| Of log | `logof@demo.ch` |
| Admin org (modèles) | `admin@demo.ch` |

En haut à droite, les comptes de démonstration permettent de changer de rôle. Arrêter avec `docker compose down`
(`docker compose down -v` supprime aussi les données).

## Développement

Prérequis : [Node.js](https://nodejs.org) à partir de la version 22.13 ; Docker est facultatif.

```bash
npm install
npm run dev        # API sur :3001, application sur http://localhost:5173 (avec rechargement à chaud)
```

Sans autre réglage, le serveur enregistre les données avec [PGlite](https://pglite.dev) (PostgreSQL en
WebAssembly) dans le dossier `server/data/pglite` – aucun serveur de base de données n'est nécessaire. Avec un
PostgreSQL propre :

```bash
docker compose up -d db                                                     # PostgreSQL 16 sur 127.0.0.1:54329
echo 'DATABASE_URL=postgres://zs:zs@127.0.0.1:54329/zs' > server/.env
npm run dev
```

Une base de données vide ouvre la [configuration](#première-configuration) dans le navigateur ;
`SEED_DEMO=1 npm run dev` la remplit plutôt directement avec les données de démonstration. `npm run seed` remet la
base de données aux données de démonstration.

Le schéma se trouve dans `server/src/sql/schema.sql` et est créé ou complété au démarrage (`… IF NOT EXISTS`).
Le SQL s'écrit avec des paramètres `?` ; `server/src/db.ts` les traduit pour PostgreSQL.

## Première configuration

Une installation vide affiche, au lieu de la connexion, un assistant qui crée l'organisation en une seule fois :

<p align="center"><img src="docs/media/einrichtung.gif" alt="Assistant de configuration d'une nouvelle installation" width="760"></p>

1. **Bataillon :** nom, région, en-tête des documents (office, service, adresse, téléphone, site web) et logos.
2. **Compagnies et sections** avec l'effectif réglementaire par section (chefs de section, cadres, soldats).
3. **Personnes :** son propre compte (cdmt bat) et, si souhaité, les cdt cp et les chefs de section avec un mot de
   passe initial commun, qu'ils modifient sous « Mon compte ».
4. **Ressources :** véhicules, remorques, locaux et terrains – par compagnie ou pour le bataillon.
5. **Carte :** la zone dans laquelle s'ouvrent toutes les cartes.

On est ensuite connecté en tant que cdmt bat ; le calendrier de préparation est créé avec le modèle standard. Tout le
reste (groupes, cadres, of log, surfaces de terrain, modèles propres) se fait sous « Organisation ». Au lieu de sa
propre organisation, on peut aussi charger la démo. Dès qu'un compte existe, la configuration est verrouillée.

L'assistant s'affiche dans la langue du navigateur ; les textes standard (calendrier de préparation, ordres du jour
des rapports) sont créés dans cette langue.

Si une installation vide est accessible publiquement, `SETUP_TOKEN` devrait être défini : l'assistant demande alors
ce code, afin que personne d'autre ne configure l'installation en premier.

## Exploitation sur un serveur

Le `Dockerfile` construit l'application ; le serveur la livre. Pour un serveur avec HTTPS, `deploy/` contient un
modèle pour [Traefik](https://traefik.io) avec l'application et PostgreSQL. Il attend un réseau Docker `proxy`
partagé avec Traefik, les entrypoints `http`/`https` et un middleware `redirect-https` – pour d'autres noms, adapter
les labels dans `deploy/docker-compose.yml`.

```bash
cd deploy
cp .env.example .env          # saisir le domaine, les mots de passe et le résolveur de certificats
docker compose up -d --build  # aussi après chaque mise à jour du code
docker compose logs -f app
```

Sauvegarde et restauration de la base de données :

```bash
docker compose exec db pg_dump -U zs zs | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-2026-11-05.sql.gz | docker compose exec -T db psql -U zs zs
```

Sans Traefik, le `docker-compose.yml` du dossier principal suffit derrière n'importe quel reverse proxy avec HTTPS
(port 8080, définir `TRUST_PROXY=1`).

## Paramètres

| Variable | Signification |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL ; sans elle, le serveur utilise PGlite dans `PGLITE_DIR` |
| `PGLITE_DIR` | Dossier de la base de données PGlite (par défaut `server/data/pglite`) |
| `API_PORT` | Port du serveur (par défaut 3001, 8080 dans le conteneur) |
| `GATE_PASSWORD`, `GATE_USER` | Protection facultative par mot de passe (HTTP Basic Auth) devant toute l'application ; le check-in par code QR reste libre. Après 10 tentatives échouées, une adresse est bloquée pendant 15 minutes |
| `TRUST_PROXY` | `1` derrière un reverse proxy (adresses correctes pour les blocages de connexion) |
| `SETUP_TOKEN` | Code pour la [première configuration](#première-configuration) d'une installation vide |
| `SEED_DEMO` | `1` : remplir une base de données vide au démarrage avec les données de démonstration au lieu d'afficher la configuration |
| `DOMAIN`, `TRAEFIK_CERTRESOLVER`, `POSTGRES_PASSWORD` | Uniquement pour `deploy/docker-compose.yml` |

Pour le développement, les variables se trouvent dans `server/.env`, sur le serveur dans `deploy/.env`.

## Avant la mise en service

1. Démarrer avec une base de données vide et parcourir la [première configuration](#première-configuration) – ou, si
   l'on a commencé avec les données de démonstration, supprimer les comptes de démonstration ou changer leurs mots de
   passe (« Organisation › Compagnies et personnel »).
2. Compléter les groupes, les autres utilisateurs (cadres, of log) et les modèles.
3. Régler l'en-tête, l'adresse et les logos sous « Organisation › Modèles et ressources », de même que les
   véhicules, les locaux et les terrains.
4. Pour le check-in par téléphone, l'application doit être accessible à une adresse que les téléphones peuvent
   ouvrir (sous `localhost`, l'application affiche une remarque).
5. Mettre en place des sauvegardes régulières de la base de données.

## Démo dans le navigateur (GitHub Pages)

`npm run build:demo` construit une version dans laquelle le serveur fonctionne dans le navigateur : PGlite enregistre
les données dans l'IndexedDB du navigateur, et la page répond elle-même aux requêtes vers `/api/…`
(`client/src/demo/`). Chaque visiteur a ses propres données de démonstration ; « Réinitialiser la démo » (en bas à
gauche) recommence à zéro. La page de connexion connecte en un clic avec un rôle. Ne sont pas inclus la protection
par mot de passe devant l'application ni le check-in depuis un autre appareil (le code QR pointe vers le même
navigateur).

Le workflow `.github/workflows/pages.yml` publie la démo à chaque push sur `main`. Une seule fois, sous
*Settings › Pages › Source*, choisir « GitHub Actions ». Essayer en local :

```bash
npm run build:demo
npm run preview -w client -- --mode demo      # http://localhost:4173/WK-Planer/
```

## Tests

```bash
npm test             # Vitest : droits, règles de planification et API (PGlite en mémoire, nouvelle pour chaque test)
TEST_DATABASE_URL=postgres://… npm test   # les mêmes tests contre un serveur PostgreSQL (le schéma est vidé !)
npm run typecheck
npm run test:e2e     # Playwright (une seule fois avant : npx playwright install chromium)
```

Les animations du README sont créées avec `docs/media/record.mjs` à partir d'une instance de démonstration
(instructions en tête du fichier).
