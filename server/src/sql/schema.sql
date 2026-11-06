
CREATE TABLE IF NOT EXISTS bataillon (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  region_name TEXT NOT NULL DEFAULT '',
  logo TEXT
);
CREATE TABLE IF NOT EXISTS kompanie (
  id SERIAL PRIMARY KEY,
  bat_id INTEGER NOT NULL REFERENCES bataillon(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS zug (
  id SERIAL PRIMARY KEY,
  kp_id INTEGER NOT NULL REFERENCES kompanie(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  zfhr_user_id INTEGER
);
CREATE TABLE IF NOT EXISTS app_user (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  bat_id INTEGER NOT NULL REFERENCES bataillon(id) ON DELETE CASCADE,
  kp_id INTEGER REFERENCES kompanie(id) ON DELETE SET NULL,
  zug_id INTEGER REFERENCES zug(id) ON DELETE SET NULL,
  funktion TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS session (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS wk (
  id SERIAL PRIMARY KEY,
  kp_id INTEGER NOT NULL REFERENCES kompanie(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  day_start INTEGER NOT NULL DEFAULT 420,
  day_end INTEGER NOT NULL DEFAULT 1020,
  snap_min INTEGER NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'ENTWURF',
  review_note TEXT NOT NULL DEFAULT '',
  avor_days TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE TABLE IF NOT EXISTS location (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  nr INTEGER NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS block (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  zug_ids TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  location_id INTEGER REFERENCES location(id) ON DELETE SET NULL,
  verantwortlich TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  locked INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'KP',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS block_wk ON block(wk_id);
CREATE TABLE IF NOT EXISTS comment (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  block_id INTEGER REFERENCES block(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE TABLE IF NOT EXISTS befehl (
  id SERIAL PRIMARY KEY,
  bat_id INTEGER NOT NULL REFERENCES bataillon(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  dienstart TEXT NOT NULL DEFAULT '',
  leitziel TEXT NOT NULL DEFAULT '',
  absicht TEXT NOT NULL DEFAULT '',
  organisation TEXT NOT NULL DEFAULT '',
  besonderes TEXT NOT NULL DEFAULT '',
  UNIQUE (bat_id, year)
);
CREATE TABLE IF NOT EXISTS auftrag_kp (
  befehl_id INTEGER NOT NULL REFERENCES befehl(id) ON DELETE CASCADE,
  kp_id INTEGER NOT NULL REFERENCES kompanie(id) ON DELETE CASCADE,
  richtziele TEXT NOT NULL DEFAULT '',
  teilnehmende TEXT NOT NULL DEFAULT '',
  kvk_date TEXT NOT NULL DEFAULT '', -- unused since kvk_dates
  kvk_dates TEXT NOT NULL DEFAULT '[]',
  wk_from TEXT NOT NULL DEFAULT '',
  wk_to TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (befehl_id, kp_id)
);
CREATE TABLE IF NOT EXISTS befehl_file (
  id SERIAL PRIMARY KEY,
  befehl_id INTEGER NOT NULL REFERENCES befehl(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  uploaded_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE TABLE IF NOT EXISTS konzept (
  wk_id INTEGER PRIMARY KEY REFERENCES wk(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS zfhr_programm (
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  zug_id INTEGER NOT NULL REFERENCES zug(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  PRIMARY KEY (wk_id, zug_id)
);
CREATE TABLE IF NOT EXISTS milestone (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,
  owner_role TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 -- unused since per-person completion (milestone_done)
);
CREATE TABLE IF NOT EXISTS milestone_done (
  milestone_id INTEGER NOT NULL REFERENCES milestone(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  PRIMARY KEY (milestone_id, user_id)
);
CREATE TABLE IF NOT EXISTS vorbereitung_template (
  id SERIAL PRIMARY KEY,
  bat_id INTEGER NOT NULL REFERENCES bataillon(id) ON DELETE CASCADE,
  kp_id INTEGER REFERENCES kompanie(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  days_before INTEGER NOT NULL,
  owner_role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS block_detail (
  id SERIAL PRIMARY KEY,
  block_id INTEGER NOT NULL REFERENCES block(id) ON DELETE CASCADE,
  zug_id INTEGER NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  title TEXT NOT NULL,
  verantwortlich TEXT NOT NULL DEFAULT '',
  group_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS block_detail_block ON block_detail(block_id);
CREATE TABLE IF NOT EXISTS zug_group (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  zug_id INTEGER NOT NULL REFERENCES zug(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ausbildungsvorbereitung (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  block_id INTEGER REFERENCES block(id) ON DELETE SET NULL,
  zug_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL REFERENCES app_user(id),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resource (
  id SERIAL PRIMARY KEY,
  bat_id INTEGER NOT NULL REFERENCES bataillon(id) ON DELETE CASCADE,
  kp_id INTEGER REFERENCES kompanie(id) ON DELETE CASCADE, -- NULL: shared material of the Bataillon
  kind TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capacity TEXT NOT NULL DEFAULT '',
  seats INTEGER NOT NULL DEFAULT 0,
  nr INTEGER,
  area TEXT
);
CREATE TABLE IF NOT EXISTS resource_request (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  zug_id INTEGER NOT NULL,
  block_id INTEGER REFERENCES block(id) ON DELETE SET NULL,
  resource_id INTEGER REFERENCES resource(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  persons INTEGER NOT NULL DEFAULT 0,
  assigned_ids TEXT NOT NULL DEFAULT '[]',
  date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  zweck TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  area TEXT,
  status TEXT NOT NULL DEFAULT 'BEANTRAGT',
  requested_by INTEGER NOT NULL REFERENCES app_user(id),
  decided_by INTEGER REFERENCES app_user(id),
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  diff TEXT,
  at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE TABLE IF NOT EXISTS rapport (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  zug_id INTEGER REFERENCES zug(id) ON DELETE CASCADE,
  block_id INTEGER REFERENCES block(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  schema TEXT NOT NULL DEFAULT 'AUSB_DURCH',
  date TEXT NOT NULL,
  start_min INTEGER,
  ort TEXT NOT NULL DEFAULT '',
  leitung_user_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  protokoll_user_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  teilnehmer_ids TEXT NOT NULL DEFAULT '[]',
  abwesend TEXT NOT NULL DEFAULT '',
  gaeste TEXT NOT NULL DEFAULT '',
  traktanden TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'OFFEN',
  created_by INTEGER NOT NULL REFERENCES app_user(id),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS rapport_wk ON rapport(wk_id);
CREATE TABLE IF NOT EXISTS pendenz (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  rapport_id INTEGER REFERENCES rapport(id) ON DELETE SET NULL,
  traktandum_key TEXT,
  zug_id INTEGER REFERENCES zug(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  responsible_user_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  due_date TEXT NOT NULL DEFAULT '',
  done_at TEXT,
  done_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  created_by INTEGER NOT NULL REFERENCES app_user(id),
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS pendenz_wk ON pendenz(wk_id);
CREATE TABLE IF NOT EXISTS zug_strength (
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  zug_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  planned INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (wk_id, zug_id, date)
);
CREATE TABLE IF NOT EXISTS participant (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  nachname TEXT NOT NULL,
  vorname TEXT NOT NULL,
  grad TEXT NOT NULL DEFAULT '',
  funktion TEXT NOT NULL DEFAULT '',
  zug_id INTEGER REFERENCES zug(id) ON DELETE SET NULL,
  email TEXT NOT NULL DEFAULT '',
  ext_id TEXT NOT NULL DEFAULT '',
  days TEXT NOT NULL DEFAULT '[]',
  diet TEXT NOT NULL DEFAULT 'NORMAL',
  intolerances TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS participant_wk ON participant(wk_id);
CREATE TABLE IF NOT EXISTS checkin_day (
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'AUTO',
  PRIMARY KEY (wk_id, date)
);
CREATE TABLE IF NOT EXISTS checkin (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  participant_id INTEGER REFERENCES participant(id) ON DELETE SET NULL,
  vorname TEXT NOT NULL DEFAULT '',
  nachname TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  zug_id INTEGER REFERENCES zug(id) ON DELETE SET NULL,
  diet TEXT NOT NULL DEFAULT 'NORMAL',
  intolerances TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'SELF',
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  matched_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS checkin_wk_date ON checkin(wk_id, date);
-- Sanitarische Eintrittsbefragung (Art. 6 Sicherheitsvorschriften im Zivilschutz): one answer per person and WK.
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  participant_id INTEGER REFERENCES participant(id) ON DELETE CASCADE,
  checkin_id INTEGER REFERENCES checkin(id) ON DELETE SET NULL,
  vorname TEXT NOT NULL DEFAULT '',
  nachname TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  zug_id INTEGER REFERENCES zug(id) ON DELETE SET NULL,
  points TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'GESUND',
  restriction TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'SELF',
  created_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  updated_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS health_check_wk ON health_check(wk_id);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email ON app_user (lower(email));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'zug_zfhr_user_fk') THEN
    ALTER TABLE zug ADD CONSTRAINT zug_zfhr_user_fk FOREIGN KEY (zfhr_user_id) REFERENCES app_user(id) ON DELETE SET NULL;
  END IF;
END $$;
-- WKs created from the Ausbildungsbefehl.
ALTER TABLE wk ADD COLUMN IF NOT EXISTS befehl_id INTEGER REFERENCES befehl(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS standard_block (
  id SERIAL PRIMARY KEY,
  kp_id INTEGER NOT NULL REFERENCES kompanie(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'ZUEGE',
  locked INTEGER NOT NULL DEFAULT 0
);
-- Files: attached to an Ausbildungsvorbereitung, or shared in the file area of a Zug.
CREATE TABLE IF NOT EXISTS attachment (
  id SERIAL PRIMARY KEY,
  av_id INTEGER REFERENCES ausbildungsvorbereitung(id) ON DELETE CASCADE,
  zug_id INTEGER REFERENCES zug(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  uploaded_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  CHECK ((av_id IS NULL) <> (zug_id IS NULL))
);
CREATE INDEX IF NOT EXISTS attachment_av ON attachment(av_id);
CREATE INDEX IF NOT EXISTS attachment_zug ON attachment(zug_id);
-- Erkundungsprotokolle, Übungen and the hand-written part of the Tagesbefehl.
CREATE TABLE IF NOT EXISTS erkundung (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  zug_id INTEGER REFERENCES zug(id) ON DELETE CASCADE,
  block_id INTEGER REFERENCES block(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES app_user(id),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS erkundung_wk ON erkundung(wk_id);
CREATE TABLE IF NOT EXISTS uebung (
  id SERIAL PRIMARY KEY,
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  block_id INTEGER REFERENCES block(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES app_user(id),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS uebung_wk ON uebung(wk_id);
CREATE TABLE IF NOT EXISTS tagesbefehl (
  wk_id INTEGER NOT NULL REFERENCES wk(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (wk_id, date)
);
ALTER TABLE attachment ADD COLUMN IF NOT EXISTS erkundung_id INTEGER REFERENCES erkundung(id) ON DELETE CASCADE;
ALTER TABLE attachment ADD COLUMN IF NOT EXISTS uebung_id INTEGER REFERENCES uebung(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachment_owner') THEN
    ALTER TABLE attachment DROP CONSTRAINT IF EXISTS attachment_check;
    ALTER TABLE attachment ADD CONSTRAINT attachment_owner CHECK (num_nonnulls(av_id, zug_id, erkundung_id, uebung_id) = 1);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS attachment_erkundung ON attachment(erkundung_id);
CREATE INDEX IF NOT EXISTS attachment_uebung ON attachment(uebung_id);
-- Letterhead of printed documents.
ALTER TABLE bataillon ADD COLUMN IF NOT EXISTS briefkopf TEXT NOT NULL DEFAULT '{}';
ALTER TABLE bataillon ADD COLUMN IF NOT EXISTS kanton_logo TEXT;
ALTER TABLE bataillon ADD COLUMN IF NOT EXISTS map_view TEXT;
-- KVK days (all Züge) apart from AVOR days (Kp Kdo), and the Züge serving per day.
ALTER TABLE wk ADD COLUMN IF NOT EXISTS kvk_days TEXT NOT NULL DEFAULT '[]';
-- NULL: not yet set (WKs of earlier versions, filled on start).
ALTER TABLE wk ADD COLUMN IF NOT EXISTS day_zuege TEXT;
-- Duty per Zug and day (replaces day_zuege); NULL: not yet converted.
ALTER TABLE wk ADD COLUMN IF NOT EXISTS day_duty TEXT;
-- Standort linked to a catalogue room or terrain: the block reserves it (request marked «standort»).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'location' AND column_name = 'resource_id') THEN
    ALTER TABLE location ADD COLUMN resource_id INTEGER REFERENCES resource(id) ON DELETE SET NULL;
    ALTER TABLE resource_request ADD COLUMN standort BOOLEAN NOT NULL DEFAULT false;
    -- Once: link legend entries to the catalogue by name, and adopt existing requests of that room for the block.
    UPDATE location l SET resource_id = (
      SELECT MIN(r.id) FROM resource r JOIN wk ON wk.id = l.wk_id JOIN kompanie k ON k.id = wk.kp_id
      WHERE r.kind IN ('RAUM', 'GELAENDE') AND r.name = l.name AND (r.kp_id = wk.kp_id OR (r.kp_id IS NULL AND r.bat_id = k.bat_id))
    );
    UPDATE resource_request SET standort = true WHERE id IN (
      SELECT MIN(q.id) FROM resource_request q JOIN block b ON b.id = q.block_id JOIN location l ON l.id = b.location_id
      WHERE q.resource_id = l.resource_id GROUP BY q.block_id
    );
  END IF;
END $$;
-- Sollbestand and Istbestand per Zug (Zugführer, Kader, Soldaten), set in the Verwaltung.
ALTER TABLE zug ADD COLUMN IF NOT EXISTS soll TEXT NOT NULL DEFAULT '{}';
ALTER TABLE zug ADD COLUMN IF NOT EXISTS ist TEXT NOT NULL DEFAULT '{}';
-- Gruppen of a Zug (Organisation); new WKs take them over as their WK-Gruppen.
CREATE TABLE IF NOT EXISTS gruppe (
  id SERIAL PRIMARY KEY,
  zug_id INTEGER NOT NULL REFERENCES zug(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  leiter_user_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  soll TEXT NOT NULL DEFAULT '{}',
  ist TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS gruppe_zug ON gruppe(zug_id);
-- Archived WKs (Bat Kdo): out of the lists and read only.
ALTER TABLE wk ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
-- Language of the interface per user (de, fr, it, en); NULL = the browser's.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS lang TEXT;
-- Named points of a site (Gelände): JSON [{lat, lng, label}].
ALTER TABLE resource ADD COLUMN IF NOT EXISTS points TEXT NOT NULL DEFAULT '[]';
